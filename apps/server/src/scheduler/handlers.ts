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
  advanceAnimalAging,
  checkCompetitions,
  loadGameAgingCache,
  selectAnimalsForAging,
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
}

export type TaskHandler = (ctx: HandlerContext) => Promise<Partial<HandlerCounts>>

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
  const { gameId } = ctx
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

    // Only age animals that were interacted with during their current cycle.
    // Shop animals (isAvailable: true) are always excluded.
    const candidates = await db.animal.findMany({
      where: { gameId, status: "ALIVE", NOT: { gameShopAnimal: { isAvailable: true } } },
      select: { id: true, lifeStageId: true, ageInCycles: true },
    })

    // COVER_ACCEPTED is written to the sire when a female owner accepts a stud
    // market cover — the stud owner played no part, so it must not count as an
    // interaction.
    //
    // Deliberately not `distinct` — the match is per animal against its own
    // current cycle, and keeping one arbitrary row per animal is what made
    // `selectAnimalsForAging` necessary. See the note there.
    const interactions = await db.animalDailyLog.findMany({
      where: {
        animalId: { in: candidates.map((a) => a.id) },
        cycleNumber: { in: [...new Set(candidates.map((a) => a.ageInCycles))] },
        NOT: { eventType: "COVER_ACCEPTED" },
      },
      select: { animalId: true, cycleNumber: true },
    })

    const animals = selectAnimalsForAging(candidates, interactions)
    let failed = 0

    if (animals.length > 0) {
      // The game's definitions — config, life stages, expression rules, illness
      // and injury pools — read once for the whole run rather than once per
      // animal. Loaded only when there is work, so an idle game stays free.
      const cache = await loadGameAgingCache(db, gameId)

      // Nothing in here renews the lease. The runner holds it open on a timer
      // for as long as this function is running, which is the only version
      // that works: a game with fewer animals than any batch size would never
      // have reached a renewal point, and the aggregate below can outlast a
      // lease on its own however many animals there were.
      for (const animal of animals) {
        try {
          await advanceAnimalAging(db, animal.id, cache)
        } catch (err) {
          failed++
          console.error(`[nightly] failed to age animal ${animal.id}:`, err)
        }
      }
    }

    const updated = await db.animal.findMany({
      where: { id: { in: animals.map((a) => a.id) } },
      select: { id: true, status: true, lifeStageId: true },
    })

    const stageBefore = new Map(animals.map((a) => [a.id, a.lifeStageId]))
    const deaths = updated.filter((a) => a.status === "DECEASED").length
    const transitions = updated.filter((a) => {
      const before = stageBefore.get(a.id)
      return before !== undefined && before !== a.lifeStageId
    }).length

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
    const aged = animals.length - failed

    await db.nightlyUpdateLog.update({
      where: { id: log.id },
      data: {
        completedAt,
        // The change. A night in which animals threw is not a success, and
        // recording that is what lets anyone notice it happened.
        success: failed === 0,
        errorMessage: failed === 0 ? null : `${failed} of ${animals.length} animals failed to age`,
        animalsAged: aged,
        animalDeaths: deaths,
        lifeStageTransitions: transitions,
      },
    })

    const elapsedMs = completedAt.getTime() - startedAt.getTime()
    const rate = animals.length > 0 ? (animals.length / (elapsedMs / 1000)).toFixed(1) : "0"
    console.log(
      `[nightly] gameId=${gameId} aged=${aged} failed=${failed} deaths=${deaths} transitions=${transitions} in ${elapsedMs}ms (${rate}/s)`
    )

    return {
      eligibleCount: candidates.length,
      claimedCount: animals.length,
      processedCount: animals.length,
      succeededCount: aged,
      failedCount: failed,
      skippedCount: candidates.length - animals.length,
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
