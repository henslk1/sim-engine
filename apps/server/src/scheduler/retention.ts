/**
 * Keeping a run's summary, and letting its detail expire.
 *
 * The first version of this deleted whole `ScheduledTaskRun` rows once they
 * were a month old. That removed the runs from analytics entirely: the history
 * and detail endpoints are rooted in the run, and everything the detail page
 * derives — retried items, pregnancies completed, peak and per-worker
 * throughput, the per-animal timing distribution — is computed from the
 * `NightlyAnimalWork` and `ScheduledTaskRunSample` rows that cascade with it.
 * A thirty-day-old night went from a full record to three numbers in
 * `NightlyUpdateLog`, and the timing baseline, whose whole value is being long,
 * would have been deleted a month after it started accumulating.
 *
 * So the run is now kept indefinitely and only the detail expires. A run row is
 * small and there are three a day — a thousand a year, which is nothing. The
 * detail is one row per animal per night, which at a hundred thousand animals
 * is three million rows a month that nothing reads once the summary exists.
 *
 * This is a scheduler module, so the rules in `schedule-architecture.test.ts`
 * apply: no direct clock reads, no raw SQL. Both shape the code here — the
 * cutoff is derived from a `Date` the caller supplies, and the one comparison
 * that wants SQL (a marker's cycle against its animal's age) is done by reading
 * candidates and filtering them in memory.
 */

import { db } from "@sim-engine/db"
import type { Prisma } from "@sim-engine/db"

/**
 * Only the delegates retention touches.
 *
 * Narrowed the same way `loadGameAgingCache` narrows its client, and for the
 * same two reasons: a transaction client satisfies it just as well as the root
 * one, and a test can stand in a client pointed at a disposable schema instead
 * of reaching for the real database.
 */
export type RetentionClient = Pick<
  typeof db,
  | "gameConfig"
  | "scheduledTaskRun"
  | "scheduledTaskRunSample"
  | "nightlyAnimalWork"
  | "animalCycleActivity"
  | "pregnancy"
>

/**
 * How many runs' detail to clear in one night.
 *
 * **A budget has to exceed what one day produces or it is not a budget, it is a
 * leak.** The first version capped this at five, which was wrong before it ever
 * reached scale: the dev game alone logged 68 runs in 24 hours - one nightly,
 * 35 competition sweeps and 28 shop rotations - so retention fell behind by 63
 * runs a day from the moment it shipped.
 *
 * Most of those are cheap. A sweep or a rotation has no `NightlyAnimalWork` at
 * all, only a handful of progress samples, so the per-run cost is dominated by
 * the nightly and the row budget below is the real limit. This number exists to
 * stop one pass walking an unbounded backlog, not to ration ordinary nights.
 */
const RUNS_PER_PASS = 500

/**
 * Child rows deleted per run, per statement.
 *
 * `deleteMany` with no bound is one statement however many rows it matches, and
 * at a hundred thousand animals a single run's work is a hundred thousand rows
 * and their index entries. Deleting in batches keeps any one statement short
 * enough that it is not holding locks while the window stays open.
 */
const DETAIL_BATCH = 5_000

/**
 * The most child rows one night will delete before leaving the rest for tomorrow.
 *
 * Sized against what a night produces, for the same reason as `RUNS_PER_PASS`.
 * A hundred thousand animals is a hundred thousand work rows every night, so
 * anything at or below that guarantees the table grows forever - 50,000 was
 * exactly that mistake. This leaves room to clear a night's worth and make
 * progress on arrears at the same time.
 */
const DETAIL_ROWS_PER_PASS = 250_000

/** The most activity markers one night will delete. */
const MARKERS_PER_PASS = 200_000

/**
 * How the marker scan is paged.
 *
 * Markers are examined in keyset pages rather than one window, because
 * protected markers do not go away. A single `take` of the oldest N was a
 * livelock waiting to happen: once N current-cycle markers sit past the cutoff
 * they fill the window every night, and no consumed marker behind them is ever
 * reached again. Paging past them costs a few more reads and removes the cliff.
 */
const MARKER_SCAN_PAGE = 5_000
const MARKER_SCAN_PAGES = 100

/**
 * Store what a run's detail rows say, before they are allowed to expire.
 *
 * Called at the end of every nightly, and again — opportunistically — for any
 * run about to be pruned that has no summary yet. The second call is what gives
 * runs that finished before this existed a summary anyway, as long as their
 * detail is still there to compute it from.
 *
 * Safe to call twice: it recomputes and overwrites, and every input is already
 * final by the time a run reaches this point.
 */
export async function finalizeRunSummary(
  runId: string,
  boundary: Date,
  client: RetentionClient = db
): Promise<void> {
  const run = await client.scheduledTaskRun.findUnique({
    where: { id: runId },
    select: { id: true, startedAt: true, completedAt: true },
  })
  if (!run) return

  // Where this run's window ends. `completedAt` is not set yet when the handler
  // finalizes its own run - the runner writes it afterwards - so the caller
  // supplies the clock reading it is about to use. For a run finalized later,
  // on its way to being pruned, the stored `completedAt` is the honest edge and
  // the caller's "now" would be weeks too late.
  const endedAt = run.completedAt ?? boundary

  const retriedItemCount = await client.nightlyAnimalWork.count({
    where: { runId, attempt: { gt: 1 } },
  })

  // Counted from the database rather than tallied by the handler, so the number
  // survives a run that was reclaimed halfway and finished by a second attempt.
  //
  // Bounded at both ends. An open-ended `gte: startedAt` is very nearly right
  // when a run finalizes itself seconds after finishing, and badly wrong down
  // the opportunistic path below, where a month-old run is summarised on its
  // way out: every foal born in the intervening thirty days would be counted
  // as that night's work.
  const pregnanciesCompleted = run.startedAt
    ? await client.pregnancy.count({
        where: {
          isCompleted: true,
          completedAt: { gte: run.startedAt, lte: endedAt },
          animal: { nightlyWork: { some: { runId } } },
        },
      })
    : 0

  const samples = await client.scheduledTaskRunSample.findMany({
    where: { runId },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true, succeededTotal: true, activeWorkers: true },
  })

  // Worker-seconds: each sample's worker count held for the interval that ended
  // at it, including the first interval back to the run's start. This is what
  // makes the per-worker rate differ from the wall-clock rate once more than one
  // worker is on a run.
  let workerSeconds = 0
  let previousAt = run.startedAt
  for (const sample of samples) {
    if (previousAt) {
      const dt = (sample.recordedAt.getTime() - previousAt.getTime()) / 1000
      if (dt > 0) workerSeconds += dt * sample.activeWorkers
    }
    previousAt = sample.recordedAt
  }

  let peakRatePerSecond: number | null = null
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1]!
    const to = samples[i]!
    const seconds = (to.recordedAt.getTime() - from.recordedAt.getTime()) / 1000
    if (seconds <= 0) continue
    const rate = (to.succeededTotal - from.succeededTotal) / seconds
    if (peakRatePerSecond === null || rate > peakRatePerSecond) peakRatePerSecond = rate
  }

  const timing = await summariseDurations(runId, client)

  await client.scheduledTaskRun.update({
    where: { id: runId },
    data: {
      retriedItemCount,
      pregnanciesCompleted,
      workerSeconds,
      peakRatePerSecond,
      ...timing,
    },
  })
}

/**
 * The per-animal timing distribution, as stored on the run.
 *
 * Finished attempts only, matching `timingFor` in the analytics router: a
 * FAILED item's duration measures how long it spun before giving up, which is a
 * different quantity from how long aging an animal takes.
 *
 * Nearest-rank percentiles via indexed offsets rather than `percentile_cont`,
 * because raw SQL is banned in this directory and the difference between
 * interpolating two adjacent millisecond readings and not is under a
 * millisecond.
 */
async function summariseDurations(runId: string, client: RetentionClient) {
  const where = { runId, status: "COMPLETED", durationMs: { not: null } } as const

  const spread = await client.nightlyAnimalWork.aggregate({
    where,
    _count: { _all: true },
    _avg: { durationMs: true },
    _min: { durationMs: true },
    _max: { durationMs: true },
  })

  const durationMeasured = spread._count._all
  if (durationMeasured === 0) {
    // Zero, not null. A run that completed and measured nothing is a fact worth
    // recording; null is reserved for a run nothing ever looked at.
    return {
      durationMeasured: 0,
      durationMinMs: null,
      durationAvgMs: null,
      durationP50Ms: null,
      durationP95Ms: null,
      durationP99Ms: null,
      durationMaxMs: null,
    }
  }

  const at = async (fraction: number): Promise<number | null> => {
    const index = Math.min(
      durationMeasured - 1,
      Math.max(0, Math.ceil(fraction * durationMeasured) - 1)
    )
    const row = await client.nightlyAnimalWork.findFirst({
      where,
      orderBy: { durationMs: "asc" },
      skip: index,
      select: { durationMs: true },
    })
    return row?.durationMs ?? null
  }

  // Outside a transaction, so these genuinely run on separate connections.
  const [durationP50Ms, durationP95Ms, durationP99Ms] = await Promise.all([
    at(0.5),
    at(0.95),
    at(0.99),
  ])

  return {
    durationMeasured,
    durationMinMs: spread._min.durationMs,
    durationAvgMs: spread._avg.durationMs,
    durationP50Ms,
    durationP95Ms,
    durationP99Ms,
    durationMaxMs: spread._max.durationMs,
  }
}

/** Delete by id in batches, up to a budget. Returns how many went. */
async function deleteInBatches(
  findIds: (take: number) => Promise<string[]>,
  remove: (ids: string[]) => Promise<void>,
  budget: number
): Promise<number> {
  let deleted = 0
  while (deleted < budget) {
    const ids = await findIds(Math.min(DETAIL_BATCH, budget - deleted))
    if (ids.length === 0) break
    await remove(ids)
    deleted += ids.length
  }
  return deleted
}

/**
 * Housekeeping, run at the end of a nightly rather than the start.
 *
 * Nothing here is urgent — it removes rows that have been dead for a month — so
 * it has no business standing between the boundary and the first animal being
 * aged. It is deliberately not the fix for what claiming a chunk costs either:
 * that was the missing `[runId, createdAt, status]` index, and no amount of
 * pruning would have helped while the planner was ignoring `runId` entirely.
 *
 * Failures are logged and swallowed. A nightly that aged every animal must not
 * be reported as failed because a delete of month-old rows hit a lock.
 */
export async function pruneScheduledWork(
  gameId: string,
  now: Date,
  client: RetentionClient = db
): Promise<void> {
  try {
    const config = await client.gameConfig.findUnique({
      where: { gameId },
      select: { workRetentionDays: true },
    })
    const days = config?.workRetentionDays ?? 30
    if (days <= 0) return

    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const runsPruned = await pruneRunDetail(gameId, cutoff, now, client)
    const markersPruned = await pruneActivityMarkers(gameId, cutoff, client)

    if (runsPruned > 0 || markersPruned > 0) {
      console.log(
        `[nightly] retention: cleared detail for ${runsPruned} run(s) and ${markersPruned} consumed activity marker(s)`
      )
    }

    // Arrears are reported rather than left to be inferred from a table that
    // quietly stops shrinking. One night behind is ordinary; the same number
    // every night means the budgets above are too small for this game.
    const backlog = await client.scheduledTaskRun.count({
      where: {
        gameId,
        status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
        completedAt: { lt: cutoff },
        detailPrunedAt: null,
      },
    })
    if (backlog > 0) {
      console.warn(`[nightly] retention: ${backlog} run(s) still awaiting cleanup after this pass`)
    }
  } catch (err) {
    console.error("[nightly] could not prune old scheduled work:", err)
  }
}

/**
 * Clear the per-animal work and progress samples of runs past the cutoff.
 *
 * Only terminal runs, so nothing that could still be reclaimed after a crash is
 * touched.
 *
 * **A run holding failed work is left entirely alone** — not "all of it except
 * the failed rows", which is what this did first and which was still wrong in
 * two ways.
 *
 * It raced. The filter spared FAILED and deleted everything else, including
 * PENDING, so a `retryFailed` landing between the scan above and the deletes
 * below turned the failed rows into PENDING rows and then watched this delete
 * them. The requeued work simply vanished.
 *
 * And it destroyed the history it was supposed to preserve. Retrying clears the
 * stored summary so the reopened run can write a fresh one; if the successful
 * work had already been pruned, the only detail left to rebuild from was the
 * handful of retried animals, and a 700-animal night finalized itself as a
 * three-animal night.
 *
 * Both follow from pruning something that is still in play. A run with failed
 * items is recoverable, so it keeps everything until the failures are resolved
 * — retried to success, at which point the run has no failed work and becomes
 * prunable with its history intact — or explicitly abandoned. Abandonment has
 * no admin action yet; until it does, a permanently failed run holds its detail,
 * which is the safe direction to be wrong in.
 */
async function pruneRunDetail(
  gameId: string,
  cutoff: Date,
  now: Date,
  client: RetentionClient
): Promise<number> {
  const due = await client.scheduledTaskRun.findMany({
    where: {
      gameId,
      status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
      completedAt: { lt: cutoff },
      detailPrunedAt: null,
      // Nothing left to recover. This is also what makes the delete below safe
      // without a lock: a run with no failed items is a run `retryFailed`
      // refuses, so there is no requeue that could collide with it.
      animalWork: { none: { status: "FAILED" } },
    },
    orderBy: { completedAt: "asc" },
    take: RUNS_PER_PASS,
    select: { id: true, durationMeasured: true },
  })

  let budget = DETAIL_ROWS_PER_PASS
  let cleared = 0

  for (const run of due) {
    if (budget <= 0) break

    // A run that finished before summaries existed still has its detail right
    // now, so this is the last chance to turn it into one.
    if (run.durationMeasured === null) {
      await finalizeRunSummary(run.id, now, client)
    }

    const samplesGone = await deleteInBatches(
      async (take) =>
        (
          await client.scheduledTaskRunSample.findMany({
            where: { runId: run.id },
            take,
            select: { id: true },
          })
        ).map((r) => r.id),
      async (ids) => {
        await client.scheduledTaskRunSample.deleteMany({ where: { id: { in: ids } } })
      },
      budget
    )
    budget -= samplesGone

    const workGone = await deleteInBatches(
      async (take) =>
        (
          await client.nightlyAnimalWork.findMany({
            where: { runId: run.id },
            take,
            select: { id: true },
          })
        ).map((r) => r.id),
      async (ids) => {
        await client.nightlyAnimalWork.deleteMany({ where: { id: { in: ids } } })
      },
      budget
    )
    budget -= workGone

    // A run that ran out of budget halfway is left unmarked and finished
    // tomorrow; its summary was stored before any of this, so the panel reads
    // the same numbers throughout.
    const left = await client.nightlyAnimalWork.count({ where: { runId: run.id } })
    if (left === 0) {
      await client.scheduledTaskRun.update({
        where: { id: run.id },
        data: { detailPrunedAt: now },
      })
      cleared++
    }
  }

  return cleared
}

/**
 * Delete interaction markers that have been consumed, and only those.
 *
 * The age filter alone is not enough, and the first version of this got it
 * wrong. Eligibility is `marker.cycleNumber = animal.ageInCycles`, so a marker
 * stops mattering when its animal ages past it — but an animal whose work keeps
 * failing never ages, and its marker stays current while every other animal in
 * the game ages normally. Deleting that marker on age alone makes the one
 * animal that most needs attention invisible to the nightly, until somebody
 * happens to interact with it again. The comment this replaces claimed an old
 * current-cycle marker meant the whole nightly had stopped for a month; it
 * meant nothing of the sort.
 *
 * So the cycle is checked, and a marker still sitting at its animal's current
 * age is kept however old it is. That also covers the recovery case without a
 * separate rule: an animal with outstanding work has not aged, so its marker is
 * current, so it is protected.
 *
 * Candidates are read and filtered here rather than compared in SQL because a
 * column-to-column comparison across two tables is not expressible through
 * Prisma, and raw SQL is banned in this directory.
 *
 * **Scanned in keyset pages, and the position is saved between nights.**
 *
 * Protected markers are not consumed by being looked at. Taking the oldest N
 * candidates and filtering them was therefore a livelock: once N current-cycle
 * markers sit past the cutoff they fill the window every night and everything
 * behind them is unreachable. Paging within a pass was only half the answer -
 * restarting from the beginning each night reproduces the same starvation at
 * whatever the per-pass ceiling happens to be, so raising the ceiling moves the
 * cliff rather than removing it.
 *
 * `markerPruneCursor` carries the position forward, so consecutive nights sweep
 * the whole table however much of it is protected, and reaching the end resets
 * to null to begin the next sweep. The cursor is a plain `id > last` rather
 * than Prisma's `cursor`, because rows inside a page have just been deleted and
 * a cursor row that no longer exists is not a position.
 */
export type MarkerScanLimits = {
  /** Rows examined per read. */
  page: number
  /** Reads per pass. `page * pages` is how far one night can advance. */
  pages: number
  /** Markers deleted per pass. */
  budget: number
}

const DEFAULT_MARKER_SCAN: MarkerScanLimits = {
  page: MARKER_SCAN_PAGE,
  pages: MARKER_SCAN_PAGES,
  budget: MARKERS_PER_PASS,
}

export async function pruneActivityMarkers(
  gameId: string,
  cutoff: Date,
  client: RetentionClient,
  // Parameterised so the carry-over between passes can be exercised against a
  // handful of rows instead of the half-million the defaults would need.
  limits: MarkerScanLimits = DEFAULT_MARKER_SCAN
): Promise<number> {
  const state = await client.gameConfig.findUnique({
    where: { gameId },
    select: { markerPruneCursor: true },
  })

  let deleted = 0
  let after: string | null = state?.markerPruneCursor ?? null
  // Whether this pass reached the end of the candidate set, which is what
  // decides between carrying the position forward and starting over.
  let exhausted = false

  for (let page = 0; page < limits.pages && deleted < limits.budget; page++) {
    // Built as a typed value rather than a conditional spread: the spread makes
    // the filter's type depend on `after`, which is assigned from the result,
    // and the inference goes round in a circle.
    const where: Prisma.AnimalCycleActivityWhereInput = {
      gameId,
      lastInteractionAt: { lt: cutoff },
    }
    if (after !== null) where.id = { gt: after }

    const candidates = await client.animalCycleActivity.findMany({
      where,
      orderBy: { id: "asc" },
      take: limits.page,
      select: {
        id: true,
        cycleNumber: true,
        animal: { select: { ageInCycles: true } },
      },
    })

    if (candidates.length === 0) {
      exhausted = true
      break
    }
    after = candidates[candidates.length - 1]!.id

    const consumed = candidates
      .filter((marker) => marker.cycleNumber !== marker.animal.ageInCycles)
      .map((marker) => marker.id)

    if (consumed.length > 0) {
      await client.animalCycleActivity.deleteMany({ where: { id: { in: consumed } } })
      deleted += consumed.length
    }

    // A short page is the end of the candidate set, however little of it was
    // deletable.
    if (candidates.length < limits.page) {
      exhausted = true
      break
    }
  }

  // Written whether or not anything was deleted: a pass that scanned ten pages
  // of protected markers and removed none still made progress, and losing that
  // is precisely the starvation this exists to prevent.
  // `updateMany`, not `update`: it writes one column and returns a count, where
  // `update` reads the whole row back and throws outright if a game has no
  // config row. Neither is wanted for a position marker.
  await client.gameConfig.updateMany({
    where: { gameId },
    data: { markerPruneCursor: exhausted ? null : after },
  })

  return deleted
}
