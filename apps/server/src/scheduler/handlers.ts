/**
 * The work itself, one function per task type.
 *
 * A handler is told which game and which boundary, and returns what it did.
 * It knows nothing about claims, leases or retries — those belong to the
 * runner, and keeping them out of here is what makes the work callable by hand
 * from an admin screen or a script without any of the scheduling machinery
 * being involved.
 */

import { db } from "@sim-engine/db"
import {
  claimChunk,
  countWork,
  createWorkItems,
  finishWork,
  hasOutstandingWork,
  heartbeatWork,
  recordSample,
} from "./animal-work.js"
import {
  advanceAnimalAging,
  checkCompetitions,
  loadGameAgingCache,
  selectEligibleAnimals,
  summariseInnateTotals,
  type Clock,
  type ScheduledType,
} from "@sim-engine/engine"

/**
 * The counters on `ScheduledTaskRun`. Every handler fills in what it can; the
 * runner writes the rest as zero.
 */
export type HandlerCounts = {
  /** Rows that were candidates before any filtering. */
  eligibleCount: number
  /** Rows the handler decided to act on. */
  claimedCount: number
  /** Rows it actually attempted. */
  processedCount: number
  succeededCount: number
  failedCount: number
  retriedCount: number
  /** Candidates deliberately passed over. Not an error. */
  skippedCount: number
}

export type HandlerContext = {
  gameId: string
  runId: string
  /** The boundary this run covers, which may be older than `clock.now()`. */
  scheduledFor: Date
  clock: Clock
  /**
   * The run's fencing token. Per-animal work items are claimed with it, so a
   * worker whose run was reclaimed cannot write results over its successor.
   */
  token: string
}

export type TaskHandler = (ctx: HandlerContext) => Promise<Partial<HandlerCounts>>

/**
 * How many animals one claim covers.
 *
 * Big enough that claiming is not the dominant cost, small enough that a crash
 * loses at most this much lease time. The plan suggests 250-1,000; benchmark
 * before moving it.
 */
const CHUNK_SIZE = 250

/** How long a claimed chunk is owned for without a renewal. */
const WORK_LEASE_MS = 120_000

/**
 * A stop on the drain loop. Each pass claims a chunk or discovers new work; a
 * run that somehow keeps finding more should give up rather than spin all
 * night.
 */
const MAX_PASSES = 10_000

/**
 * Age every animal in a game that was cared for during its current cycle, then
 * recompute the game's innate ceiling.
 *
 * Lifted from the BullMQ nightly worker with one behavioural change: a run in
 * which animals threw is no longer recorded as a success. It used to write
 * `success: true` unconditionally, so a night on which every single animal
 * failed looked identical in `NightlyUpdateLog` to one that worked.
 */
export const runNightly: TaskHandler = async (ctx) => {
  const { gameId, runId, token } = ctx
  const startedAt = ctx.clock.now()

  const log = await db.nightlyUpdateLog.create({
    data: { gameId, startedAt, success: false },
  })

  try {
    // Auto-bury deceased animals.
    const cutoff = new Date(startedAt.getTime() - 3 * 24 * 60 * 60 * 1000)
    await db.animal.updateMany({
      where: { gameId, status: "DECEASED", diedAt: { lt: cutoff } },
      data: { status: "BURIED" },
    })

    // One work item per animal a player interacted with during its current
    // cycle. Creating them first is what makes the night resumable: after this
    // commits, the list of what has to happen is in the database rather than in
    // this process's memory.
    const eligible = await selectEligibleAnimals(db, gameId)
    await createWorkItems(runId, eligible)

    // Only so `skipped` still means "living animals nobody touched".
    const livingCount = await db.animal.count({
      where: { gameId, status: "ALIVE", NOT: { gameShopAnimal: { isAvailable: true } } },
    })

    // The game's definitions — config, life stages, expression rules, illness
    // and injury pools — read once for the whole run rather than once per
    // animal. Loaded only when there is work, so an idle game stays free.
    const cache = (await hasOutstandingWork(runId)) ? await loadGameAgingCache(db, gameId) : null

    let processed = 0
    let failed = 0
    let transitions = 0
    let skippedAlreadyAged = 0

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const now = ctx.clock.now()
      const chunk = await claimChunk(runId, token, now, WORK_LEASE_MS, CHUNK_SIZE)

      if (chunk.length === 0) {
        // Nothing claimable. Before finishing, look for animals that became
        // eligible while this run was going — somebody playing in the seconds
        // either side of the boundary. Plan section 8 requires that check, and
        // because the set stabilises it terminates.
        const late = await selectEligibleAnimals(db, gameId)
        const added = await createWorkItems(runId, late)
        if (added > 0) {
          console.log(`[nightly] ${added} animal(s) became eligible mid-run`)
          continue
        }
        break
      }

      for (const work of chunk) {
        try {
          // `expectedCycle` is the idempotency guarantee. If a previous attempt
          // aged this animal and died before closing the item out, the aging
          // transaction sees the animal has moved on and does nothing.
          const result = await advanceAnimalAging(db, work.animalId, cache ?? undefined, {
            expectedCycle: work.cycleNumber,
          })

          if (result.alreadyAged) skippedAlreadyAged++
          else if (result.lifeStageAdvanced) transitions++

          processed++
          await finishWork(work.id, token, ctx.clock.now(), { status: "COMPLETED" })
        } catch (err) {
          failed++
          console.error(`[nightly] failed to age animal ${work.animalId}:`, err)
          // Left RETRYING so the next pass picks it up; `attempt` on the row is
          // the record of how many times it has been tried.
          await finishWork(work.id, token, ctx.clock.now(), {
            status: work.attempt >= 3 ? "FAILED" : "RETRYING",
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // One lease renewal and one progress sample per chunk. Chunks are large,
      // so this is naturally spaced without a timer of its own.
      const after = ctx.clock.now()
      await heartbeatWork(runId, token, after, WORK_LEASE_MS)
      await recordSample(runId, ctx.clock)
    }

    const counts = await countWork(runId)

    // Deaths are counted from the database rather than accumulated here, so the
    // number is right even when an earlier attempt did some of the work.
    const deaths = await db.animal.count({
      where: {
        gameId,
        status: "DECEASED",
        diedAt: { gte: startedAt },
        nightlyWork: { some: { runId } },
      },
    })

    // Recalculate GameInnateMax from the living population.
    //
    // Postgres does the per-animal sum, so this returns one row per animal
    // rather than every stat row of every animal. Tutorial animals are excluded
    // — they are handed generous fixed stats and would drag the game's ceiling
    // around for everyone.
    const innateTotals = await db.animalStat.groupBy({
      by: ["animalId"],
      where: { animal: { gameId, status: "ALIVE", isTutorialAnimal: false } },
      _sum: { innateValue: true },
    })

    const innate = summariseInnateTotals(innateTotals.map((row) => row._sum.innateValue ?? 0))
    if (innate) {
      await db.gameInnateMax.upsert({
        where: { gameId },
        create: { gameId, maxTotalInnate: innate.max, averageTotalInnate: innate.average },
        update: { maxTotalInnate: innate.max, averageTotalInnate: innate.average },
      })
    }

    const completedAt = ctx.clock.now()
    const aged = counts.completed - skippedAlreadyAged
    const outstanding = counts.pending + counts.running + counts.retrying

    // Plan section 8: a run is not complete while work remains or any of it
    // failed. Both are reported as failures so the runner refuses to mark the
    // run COMPLETED.
    const unfinished = counts.failed + outstanding

    await db.nightlyUpdateLog.update({
      where: { id: log.id },
      data: {
        completedAt,
        success: unfinished === 0,
        errorMessage:
          unfinished === 0
            ? null
            : `${counts.failed} animal(s) failed, ${outstanding} still outstanding`,
        animalsAged: aged,
        animalDeaths: deaths,
        lifeStageTransitions: transitions,
      },
    })

    const elapsedMs = completedAt.getTime() - startedAt.getTime()
    const rate = processed > 0 ? (processed / (elapsedMs / 1000)).toFixed(1) : "0"
    console.log(
      `[nightly] gameId=${gameId} aged=${aged} failed=${counts.failed} outstanding=${outstanding} deaths=${deaths} transitions=${transitions} in ${elapsedMs}ms (${rate}/s)`
    )

    return {
      eligibleCount: eligible.length,
      claimedCount: counts.completed + counts.failed + outstanding,
      processedCount: processed,
      succeededCount: aged,
      failedCount: unfinished,
      retriedCount: counts.retrying,
      skippedCount: Math.max(0, livingCount - eligible.length),
    }
  } catch (err) {
    // The log row is created up front precisely so that a crash leaves a
    // record behind rather than nothing at all.
    await db.nightlyUpdateLog
      .update({
        where: { id: log.id },
        data: {
          completedAt: ctx.clock.now(),
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch((logErr) => console.error("[nightly] could not record the failure:", logErr))

    throw err
  }
}

/** Resolve competitions whose deadline has passed, then top the open set back up. */
export const runCompetitionSweep: TaskHandler = async (ctx) => {
  const { ran, failed, expired } = await checkCompetitions(db, ctx.gameId)

  // `failedCount` is what makes the runner mark the run as not completed, so a
  // sweep that could not resolve a competition is visible rather than being
  // reported as a clean run that happened to do less.
  return { eligibleCount: expired, processedCount: expired, succeededCount: ran, failedCount: failed }
}

export const HANDLERS: Record<ScheduledType, TaskHandler> = {
  NIGHTLY: runNightly,
  COMPETITION_SWEEP: runCompetitionSweep,
}
