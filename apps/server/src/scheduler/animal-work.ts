/**
 * The nightly's per-animal work queue.
 *
 * A nightly is the one task long enough to be interrupted halfway through.
 * Without a queue it is all-or-nothing: a crash at animal 40,000 of 50,000
 * leaves no record of which 40,000 were done, and the only safe thing left to
 * do is run the whole night again. With one, the finished animals stay
 * finished and a reclaimed run picks up what is still outstanding.
 *
 * Claiming works the same way the run claim does — a conditional update whose
 * row count is the answer — rather than the plan's `FOR UPDATE SKIP LOCKED`.
 * That is deliberate: `updateManyAndReturn` gives an atomic claim that hands
 * back exactly the rows it won, with no raw SQL and so none of the
 * `timestamp` / session time zone hazards that would come with writing lease
 * comparisons by hand. Under contention two workers can pick overlapping
 * candidates and one wins fewer than it asked for, which is correct, just less
 * efficient than SKIP LOCKED would be. With one process it is identical, and
 * switching later changes this file only.
 */

import { db } from "@sim-engine/db"
import type { Prisma } from "@sim-engine/db"
import type { Clock, EligibleAnimal } from "@sim-engine/engine"

export type ClaimedWork = {
  id: string
  animalId: string
  /** The age the animal was when this item was created. */
  cycleNumber: number
  attempt: number
}

export type WorkCounts = {
  pending: number
  running: number
  retrying: number
  completed: number
  failed: number
}

/** The statuses that mean an item still needs doing. */
const OUTSTANDING = ["PENDING", "RETRYING", "RUNNING"] as const

/**
 * The database's view of "this item can be claimed", which has to agree with
 * the run-level `claimableWhere` for the same reason: a candidate the query
 * offers and the claim refuses is an item that never gets done and never gets
 * reported.
 */
function claimableWhere(now: Date): Prisma.NightlyAnimalWorkWhereInput[] {
  return [
    { status: { in: ["PENDING", "RETRYING"] } },
    { status: "RUNNING", leaseUntil: { lte: now } },
    { status: "RUNNING", leaseUntil: null },
  ]
}

/**
 * Create one work item per eligible animal.
 *
 * Returns how many were new. Safe to call repeatedly against the same run —
 * the unique key on (runId, animalId) means a second call adds only animals
 * that have become eligible since, which is exactly what the late-activity
 * sweep needs.
 */
export async function createWorkItems(
  runId: string,
  animals: readonly EligibleAnimal[]
): Promise<number> {
  if (animals.length === 0) return 0

  const { count } = await db.nightlyAnimalWork.createMany({
    data: animals.map((animal) => ({
      runId,
      animalId: animal.id,
      cycleNumber: animal.ageInCycles,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  })

  return count
}

/**
 * Take ownership of up to `chunkSize` outstanding items.
 *
 * Two statements: pick candidates, then claim them conditionally. The claim is
 * what decides ownership — the pick is only a shortlist, and anything another
 * worker took in between simply does not come back.
 */
export async function claimChunk(
  runId: string,
  token: string,
  now: Date,
  leaseMs: number,
  chunkSize: number
): Promise<ClaimedWork[]> {
  const candidates = await db.nightlyAnimalWork.findMany({
    where: { runId, OR: claimableWhere(now) },
    orderBy: { createdAt: "asc" },
    take: chunkSize,
    select: { id: true },
  })

  if (candidates.length === 0) return []

  const claimed = await db.nightlyAnimalWork.updateManyAndReturn({
    where: { id: { in: candidates.map((c) => c.id) }, OR: claimableWhere(now) },
    data: {
      status: "RUNNING",
      claimedBy: token,
      startedAt: now,
      leaseUntil: new Date(now.getTime() + leaseMs),
      attempt: { increment: 1 },
    },
    select: { id: true, animalId: true, cycleNumber: true, attempt: true },
  })

  return claimed
}

/** Renew the lease on everything this worker currently holds for a run. */
export async function heartbeatWork(runId: string, token: string, now: Date, leaseMs: number): Promise<number> {
  const { count } = await db.nightlyAnimalWork.updateMany({
    where: { runId, claimedBy: token, status: "RUNNING" },
    data: { leaseUntil: new Date(now.getTime() + leaseMs) },
  })
  return count
}

/**
 * Close an item out, but only while this worker still owns it.
 *
 * The same fencing the run claim uses: a worker whose lease lapsed and whose
 * items were reclaimed must not write its result over the attempt that took
 * over from it.
 */
export async function finishWork(
  id: string,
  token: string,
  now: Date,
  outcome: { status: "COMPLETED" } | { status: "RETRYING" | "FAILED"; errorMessage: string }
): Promise<boolean> {
  const { count } = await db.nightlyAnimalWork.updateMany({
    where: { id, claimedBy: token, status: "RUNNING" },
    data: {
      status: outcome.status,
      completedAt: outcome.status === "RETRYING" ? null : now,
      errorMessage: outcome.status === "COMPLETED" ? null : outcome.errorMessage,
      leaseUntil: null,
    },
  })

  return count === 1
}

/** How the run's items stand. Used to decide whether a nightly may finish. */
export async function countWork(runId: string): Promise<WorkCounts> {
  const rows = await db.nightlyAnimalWork.groupBy({
    by: ["status"],
    where: { runId },
    _count: { _all: true },
  })

  const counts: WorkCounts = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0 }
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof WorkCounts
    if (key in counts) counts[key] = row._count._all
  }
  return counts
}

/** Whether anything is still outstanding — the gate on finishing a run. */
export async function hasOutstandingWork(runId: string): Promise<boolean> {
  const outstanding = await db.nightlyAnimalWork.count({
    where: { runId, status: { in: [...OUTSTANDING] } },
  })
  return outstanding > 0
}

/**
 * Record a snapshot of where a run has got to.
 *
 * Sampled rather than counted per animal: fifty thousand animals would
 * otherwise be fifty thousand writes to one row, which is both a hotspot and a
 * worse answer — a single running total cannot show whether throughput is
 * climbing or collapsing.
 */
export async function recordSample(runId: string, token: string, clock: Clock): Promise<void> {
  const [counts, claimants] = await Promise.all([
    countWork(runId),
    // Workers, not in-flight items. A sample is taken at the seam between
    // chunks, where the caller has just finished everything it claimed and
    // holds no live lease — counting leases here would have reported zero
    // workers for the whole of a single-process run, and made "completed per
    // worker-second" a division by nothing.
    db.nightlyAnimalWork.findMany({
      where: { runId, status: "RUNNING", claimedBy: { not: null } },
      distinct: ["claimedBy"],
      select: { claimedBy: true },
    }),
  ])

  // Everyone else holding work, plus this worker, which is active by virtue of
  // being the one recording.
  const others = claimants.filter((c) => c.claimedBy !== token).length

  await db.scheduledTaskRunSample.create({
    data: {
      runId,
      recordedAt: clock.now(),
      processedTotal: counts.completed + counts.failed,
      succeededTotal: counts.completed,
      failedTotal: counts.failed,
      activeWorkers: others + 1,
    },
  })
}
