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
  pruneAnimalData,
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

/** How long a deceased animal lies before the nightly buries it. */
const BURIAL_DELAY_MS = 3 * 24 * 60 * 60 * 1000

/**
 * How many animals one night will bury.
 *
 * Burial prunes, and pruning is a transaction across nearly thirty tables, so
 * this is the expensive half of the night's housekeeping. The rest wait a day.
 */
const MAX_BURIALS = 2_000

/**
 * How many dead competitions one night will collect.
 *
 * A cap rather than a full sweep: the set only grows as animals are buried, so
 * whatever is left over is collected tomorrow. This is the same catch-up
 * principle the scheduler runs on — never let one night's housekeeping grow
 * without a ceiling.
 */
const MAX_DEAD_COMPETITIONS = 5_000

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
/**
 * Delete competitions that have run and every one of whose entrants has since
 * been buried.
 *
 * This is the only competition a delete can safely take. A competition's
 * entries are kept when an animal is buried, because a placement only means
 * something against the field it was won against — but once every entrant is
 * buried the whole thing is unreachable. A buried animal's profile shows no
 * competition history, so nothing in the live game can navigate to it, and
 * `CompetitionEntry` is the only foreign key in the database that points at
 * `Competition`.
 *
 * Two clauses do the protecting, and neither is optional:
 *
 *   * **OPEN is excluded.** An open competition is never dead however many of
 *     its entrants are buried, because anyone can still enter it — and the
 *     moment a living animal does, it has a field again and resolves.
 *   * **`entries: { some: {} }`** keeps the live open set out of reach twice
 *     over: a competition nobody has entered has no entries and never matches,
 *     however long it waits.
 */
/**
 * Bury the animals that died long enough ago, and prune each as it goes.
 *
 * Pruned first, status second. `pruneAnimalData` is a delete and so is safe to
 * repeat, and a crash between the two leaves the animal DECEASED to be buried
 * again tomorrow — which is recoverable. The other order would leave an animal
 * BURIED but unpruned, and nothing would ever come back for it.
 *
 * Capped, because pruning is a transaction over nearly thirty tables per
 * animal. Whatever is left waits for tomorrow; it has already waited three
 * days.
 */
async function buryDeceased(gameId: string, cutoff: Date): Promise<number> {
  const due = await db.animal.findMany({
    where: { gameId, status: "DECEASED", diedAt: { lt: cutoff } },
    take: MAX_BURIALS,
    select: { id: true },
  })

  let count = 0
  for (const animal of due) {
    try {
      await pruneAnimalData(animal.id)
      await db.animal.update({ where: { id: animal.id }, data: { status: "BURIED" } })
      count++
    } catch (err) {
      // One animal that cannot be pruned must not stop the rest, and must not
      // take the whole nightly down with it.
      console.error(`[nightly] could not bury animal ${animal.id}:`, err)
    }
  }

  return count
}

async function collectDeadCompetitions(gameId: string): Promise<number> {
  const dead = await db.competition.findMany({
    where: {
      gameId,
      status: { not: "OPEN" },
      entries: { some: {} },
      NOT: { entries: { some: { animal: { status: { not: "BURIED" } } } } },
    },
    take: MAX_DEAD_COMPETITIONS,
    select: { id: true },
  })

  if (dead.length === 0) return 0

  const ids = dead.map((c) => c.id)

  // CompetitionResult.entryId and CompetitionEntry.competitionId are both
  // RESTRICT, so this is the only order Postgres will accept.
  // CompetitionEntryStat cascades off the entry.
  await db.$transaction([
    db.competitionResult.deleteMany({ where: { entry: { competitionId: { in: ids } } } }),
    db.competitionEntry.deleteMany({ where: { competitionId: { in: ids } } }),
    db.competition.deleteMany({ where: { id: { in: ids } } }),
  ])

  return dead.length
}

export const runNightly: TaskHandler = async (ctx) => {
  const { gameId, runId, token } = ctx
  const startedAt = ctx.clock.now()

  // One log row per run, not per attempt. A reclaimed run reopens the row it
  // already has, which is what lets the outcome counters below describe the
  // whole night rather than only whichever attempt happened to finish it.
  const log = await db.nightlyUpdateLog.upsert({
    where: { runId },
    create: { runId, gameId, startedAt, success: false },
    update: { completedAt: null, success: false, errorMessage: null },
  })

  try {
    // Auto-bury deceased animals, pruning each one exactly as the player's own
    // bury button does.
    //
    // This used to be a bare `updateMany` that set the status and nothing else,
    // so an animal the nightly buried kept every record a manually buried one
    // lost. Most animals are buried this way rather than by hand, which meant
    // the storage that burial exists to reclaim was not being reclaimed in the
    // common case — the only one that matters at a million animals.
    const buried = await buryDeceased(gameId, new Date(startedAt.getTime() - BURIAL_DELAY_MS))

    // Then collect the competitions those burials just finished off. Runs
    // after the burial above so tonight's are included.
    const collected = await collectDeadCompetitions(gameId)

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
      await recordSample(runId, token, ctx.clock)
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

    // Every completed item is an animal this run aged: either this attempt
    // aged it, or an earlier attempt of the same run did and this one
    // confirmed it. Subtracting `skippedAlreadyAged` looked right and was not
    // — on a reclaimed run it is the count of work the *first* attempt
    // finished, so taking it away reported zero for a night that had in fact
    // aged everything. An animal that aged outside this run never gets an item
    // in the first place, because eligibility matches the activity marker
    // against the animal's current cycle.
    const aged = counts.completed
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
        // Aged and deaths are recounted from the database each attempt, so
        // they are already cumulative and are written outright. Transitions
        // are counted in this process as they happen, so a second attempt
        // only ever sees its own share and has to add to what is there.
        animalsAged: aged,
        animalDeaths: deaths,
        lifeStageTransitions: { increment: transitions },
      },
    })

    const elapsedMs = completedAt.getTime() - startedAt.getTime()
    const rate = processed > 0 ? (processed / (elapsedMs / 1000)).toFixed(1) : "0"
    console.log(
      `[nightly] gameId=${gameId} aged=${aged} failed=${counts.failed} outstanding=${outstanding} deaths=${deaths} transitions=${transitions}` +
        (buried > 0 ? ` buried=${buried}` : "") +
        (collected > 0 ? ` collected=${collected}` : "") +
        (skippedAlreadyAged > 0 ? ` (${skippedAlreadyAged} already done by an earlier attempt)` : "") +
        ` in ${elapsedMs}ms (${rate}/s)`
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
  // The scheduler's instant, not a fresh reading: deadlines are judged against
  // the same moment that decided this sweep was due.
  const { ran, failed, due, created } = await checkCompetitions(db, ctx.gameId, ctx.clock.now())

  if (created > 0) console.log(`[competition] gameId=${ctx.gameId} resolved=${ran} failed=${failed} created=${created}`)

  // `failedCount` is what makes the runner mark the run as not completed, so a
  // sweep that could not resolve a competition is visible rather than being
  // reported as a clean run that happened to do less.
  return { eligibleCount: due, processedCount: due, succeededCount: ran, failedCount: failed }
}

export const HANDLERS: Record<ScheduledType, TaskHandler> = {
  NIGHTLY: runNightly,
  COMPETITION_SWEEP: runCompetitionSweep,
}
