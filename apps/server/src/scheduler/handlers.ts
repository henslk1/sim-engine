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
import { forEachBounded, withLeaseRenewal } from "./bounded.js"
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
  signalCompetitionResolution,
  pruneAnimalData,
  rotateShop,
  selectEligibleAnimals,
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
 * How many animals are aged at once.
 *
 * The first benchmark put this at 25.7 animals a second against the plan's
 * 50/s floor, and the whole gap was the loop: one animal's transaction waited
 * for the previous animal's, about 39ms each, nearly all of it the database
 * rather than this process. Four at a time is the plan's bounded concurrency.
 *
 * Bounded, and deliberately small. Each one is a transaction holding a
 * connection, this multiplies by `maxConcurrentGames`, and the same pool
 * serves every HTTP request the process is handling — the ceiling is
 * `DATABASE_POOL_MAX`, and going past it makes a nightly slower than the serial
 * version while locking players out of the game waiting for it.
 */
const ANIMAL_CONCURRENCY = 4

/**
 * How many animals are buried at once.
 *
 * Burial was the last serial loop in the nightly, and it is the heavier half:
 * `pruneAnimalData` is thirty-one `deleteMany`s in one transaction against
 * aging's twenty-five statements, and it runs before a single animal is aged.
 * Measured on the live database, a burial costs about 35ms, so the 2,000-animal
 * cap was seventy seconds of nothing else happening.
 *
 * Four, matching `ANIMAL_CONCURRENCY`, for the same reason and the same
 * ceiling: each burial holds a connection for the life of its transaction, and
 * the pool it comes from is the one serving every HTTP request this process is
 * handling. Burial and aging never overlap — burial finishes before the first
 * chunk is claimed — so the night's peak demand on the pool is unchanged.
 *
 * Safe to run in parallel because every statement in `pruneAnimalData` is
 * keyed by `animalId`: two burials touch the same tables but never the same
 * rows, so they cannot block or deadlock each other.
 */
const BURIAL_CONCURRENCY = 4

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
 * How long finished scheduled runs, and interaction markers, are kept.
 *
 * Deleting a run takes its `NightlyAnimalWork` and `ScheduledTaskRunSample`
 * rows with it — both cascade — which is the whole point: at a hundred thousand
 * animals a night, one work row each, thirty days is three million rows that
 * nothing reads. The history players and admins actually look at lives in
 * `NightlyUpdateLog`, whose `runId` is `SetNull` rather than `Cascade`, so it
 * survives its run being pruned.
 */
const WORK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Housekeeping, run at the end of a nightly rather than the start.
 *
 * Nothing here is urgent — it removes rows that have been dead for a month — so
 * it has no business standing between the boundary and the first animal being
 * aged. It is deliberately not the fix for what claiming a chunk costs either:
 * that was the missing `[runId, createdAt, status]` index, and no amount of
 * pruning would have helped while the planner was ignoring `runId` entirely.
 *
 * Only runs in a terminal state are touched, so nothing that could still be
 * reclaimed after a crash is removed.
 *
 * An activity marker is safe to drop on age alone. It decides eligibility only
 * at the animal's *current* cycle, and an animal that ages leaves its marker
 * behind for good — a new one has to be written for it to age again. So a
 * marker still sitting at an animal's current cycle after thirty days means the
 * nightly has not run for a month, and a missing marker is not that game's
 * problem.
 *
 * Failures are logged and swallowed. A nightly that aged every animal must not
 * be reported as failed because a delete of month-old rows hit a lock.
 */
async function pruneScheduledWork(gameId: string, now: Date): Promise<void> {
  try {
    const cutoff = new Date(now.getTime() - WORK_RETENTION_MS)

    const runs = await db.scheduledTaskRun.deleteMany({
      where: {
        gameId,
        status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
        completedAt: { lt: cutoff },
      },
    })

    const markers = await db.animalCycleActivity.deleteMany({
      where: { gameId, lastInteractionAt: { lt: cutoff } },
    })

    if (runs.count > 0 || markers.count > 0) {
      console.log(`[nightly] pruned ${runs.count} old run(s) and ${markers.count} stale activity marker(s)`)
    }
  } catch (err) {
    console.error("[nightly] could not prune old scheduled work:", err)
  }
}

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
 *
 * Bounded rather than serial, for the reason the aging loop is: each burial
 * spends nearly all of its time waiting on the database, and waiting for the
 * previous one to finish before starting the next is the whole of the cost.
 * `forEachBounded` catches nothing, so the per-animal `try` stays — a single
 * animal that cannot be pruned must not abandon the rest of the batch.
 */
async function buryDeceased(gameId: string, cutoff: Date): Promise<number> {
  const due = await db.animal.findMany({
    where: { gameId, status: "DECEASED", diedAt: { lt: cutoff } },
    take: MAX_BURIALS,
    select: { id: true },
  })

  let count = 0
  await forEachBounded(due, BURIAL_CONCURRENCY, async (animal) => {
    try {
      await pruneAnimalData(animal.id)
      await db.animal.update({ where: { id: animal.id }, data: { status: "BURIED" } })
      // Safe without any synchronisation: `++` is not a suspension point, so
      // no two workers can interleave inside it.
      count++
    } catch (err) {
      // One animal that cannot be pruned must not stop the rest, and must not
      // take the whole nightly down with it.
      console.error(`[nightly] could not bury animal ${animal.id}:`, err)
    }
  })

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

      // Renewed on a timer for as long as the chunk is being worked, not once
      // after it. A chunk is 250 animals against a two-minute lease, so at the
      // measured rate it was already finishing with seconds to spare — and a
      // chunk of slow ones would have been reclaimed out from under itself.
      await withLeaseRenewal(
        () => heartbeatWork(runId, token, ctx.clock.now(), WORK_LEASE_MS),
        Math.floor(WORK_LEASE_MS / 3),
        () =>
          forEachBounded(chunk, ANIMAL_CONCURRENCY, async (work) => {
            try {
              // `expectedCycle` is the idempotency guarantee. If a previous
              // attempt aged this animal and died before closing the item out,
              // the aging transaction sees the animal has moved on and does
              // nothing.
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
              // Left RETRYING so the next pass picks it up; `attempt` on the
              // row is the record of how many times it has been tried.
              await finishWork(work.id, token, ctx.clock.now(), {
                status: work.attempt >= 3 ? "FAILED" : "RETRYING",
                errorMessage: err instanceof Error ? err.message : String(err),
              })
            }
          })
      )

      // One progress sample per chunk, once the chunk is actually done.
      await heartbeatWork(runId, token, ctx.clock.now(), WORK_LEASE_MS)
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
    // `Animal.totalInnate` is the sum of that animal's stat rows, written when
    // the rows are. Postgres takes the max and the mean over the column and
    // hands back a single row.
    //
    // This used to group the whole of `AnimalStat` by animal and return one
    // row per living animal for Node to reduce — a result set that grew with
    // the population, and one that `summariseInnateTotals` existed to loop
    // over by hand because spreading it into `Math.max(...)` would throw
    // RangeError somewhere past 100,000 animals. Nothing is sent to Node now,
    // so that cliff is gone along with the helper.
    //
    // Tutorial animals are excluded — they are handed generous fixed stats and
    // would drag the game's ceiling around for everyone. An animal with no stat
    // rows has a null total and is skipped, which is what the grouped query did
    // implicitly by producing no row for it; the filter says so out loud.
    const innate = await db.animal.aggregate({
      where: { gameId, status: "ALIVE", isTutorialAnimal: false, totalInnate: { not: null } },
      _max: { totalInnate: true },
      _avg: { totalInnate: true },
    })

    const maxTotalInnate = innate._max.totalInnate
    const averageTotalInnate = innate._avg.totalInnate
    if (maxTotalInnate !== null && averageTotalInnate !== null) {
      await db.gameInnateMax.upsert({
        where: { gameId },
        create: { gameId, maxTotalInnate, averageTotalInnate },
        update: { maxTotalInnate, averageTotalInnate },
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

    await pruneScheduledWork(gameId, completedAt)

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
  //
  // The run id goes down with each work item so the run detail can show this
  // sweep's share of the queue. Without it the only question answerable was
  // "how does the game's queue look right now", which stops being about this
  // sweep the moment another one runs.
  const { due, enqueued, created } = await checkCompetitions(db, ctx.gameId, ctx.clock.now(), ctx.runId)

  if (due > 0 || created > 0) {
    console.log(`[competition] gameId=${ctx.gameId} due=${due} enqueued=${enqueued} created=${created}`)
  }

  // Resolving is the resolver's job now, so the sweep no longer reports
  // successes or failures of its own — writing down what is due is the whole
  // of its work, and all of it succeeded. Whether those competitions actually
  // resolve is answered by `CompetitionResolutionWork`, not by this run.
  if (due > 0) signalCompetitionResolution()

  // `eligibleCount` is what came due, `succeededCount` what this sweep added.
  // They differ by the competitions that had already enqueued themselves by
  // filling up, which is a real thing to be able to see rather than a rounding
  // error to hide.
  return { eligibleCount: due, processedCount: due, succeededCount: enqueued, failedCount: 0 }
}

/** Clear the shop's unsold stock and generate a new set. */
export const runShopRotation: TaskHandler = async (ctx) => {
  // The scheduler's instant, so a breed's rotation window is judged against the
  // same moment that decided this rotation was due — a breed whose run ends at
  // 14:00 leaves on the 14:00 rotation, not on whichever side of it the handler
  // happened to read the clock.
  const rotation = await rotateShop(db, ctx.gameId, ctx.clock.now())

  if (rotation.removed > 0 || rotation.created > 0) {
    console.log(
      `[shop] gameId=${ctx.gameId} cleared=${rotation.removed} created=${rotation.created}` +
        ` across ${rotation.stocking}/${rotation.configs} breed(s)`
    )
  }

  // Counted in animals, which is what the stock is. `claimedCount` is the one
  // figure in breeds: how many of the game's breed configs were in their window
  // and took part, against how many exist.
  return {
    eligibleCount: rotation.removed,
    claimedCount: rotation.stocking,
    processedCount: rotation.removed,
    succeededCount: rotation.created,
    failedCount: 0,
    skippedCount: rotation.configs - rotation.stocking,
  }
}

export const HANDLERS: Record<ScheduledType, TaskHandler> = {
  NIGHTLY: runNightly,
  COMPETITION_SWEEP: runCompetitionSweep,
  SHOP_ROTATION: runShopRotation,
}
