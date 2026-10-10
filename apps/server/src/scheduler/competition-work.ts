/**
 * The competition resolution queue's database side.
 *
 * Deliberately the same shape as `animal-work.ts`, down to the claim being a
 * conditional `updateManyAndReturn` whose returned rows are the answer. Two
 * queues that behave differently under contention would be two sets of
 * reasoning to keep straight, and the reasoning is the hard part.
 */

import { db } from "@sim-engine/db"
import type { Prisma } from "@sim-engine/db"

export type ClaimedResolution = {
  id: string
  competitionId: string
  attempt: number
}

export type ResolutionCounts = {
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
 * every other claim predicate in the scheduler: a candidate the query offers
 * and the claim refuses is work that never gets done and never gets reported.
 */
function claimableWhere(now: Date): Prisma.CompetitionResolutionWorkWhereInput[] {
  return [
    { status: { in: ["PENDING", "RETRYING"] } },
    { status: "RUNNING", leaseUntil: { lte: now } },
    { status: "RUNNING", leaseUntil: null },
  ]
}

/**
 * Take ownership of up to `chunkSize` outstanding items.
 *
 * Two statements: pick candidates, then claim them conditionally. The claim is
 * what decides ownership — the pick is only a shortlist, and anything another
 * worker took in between simply does not come back.
 */
export async function claimResolutions(
  token: string,
  now: Date,
  leaseMs: number,
  chunkSize: number
): Promise<ClaimedResolution[]> {
  const candidates = await db.competitionResolutionWork.findMany({
    where: { OR: claimableWhere(now) },
    orderBy: { createdAt: "asc" },
    take: chunkSize,
    select: { id: true },
  })

  if (candidates.length === 0) return []

  return db.competitionResolutionWork.updateManyAndReturn({
    where: { id: { in: candidates.map((c) => c.id) }, OR: claimableWhere(now) },
    data: {
      status: "RUNNING",
      claimedBy: token,
      startedAt: now,
      leaseUntil: new Date(now.getTime() + leaseMs),
      attempt: { increment: 1 },
    },
    select: { id: true, competitionId: true, attempt: true },
  })
}

/** Renew the lease on everything this worker currently holds. */
export async function heartbeatResolutions(token: string, now: Date, leaseMs: number): Promise<number> {
  const { count } = await db.competitionResolutionWork.updateMany({
    where: { claimedBy: token, status: "RUNNING" },
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
export async function finishResolution(
  id: string,
  token: string,
  now: Date,
  outcome: { status: "COMPLETED" } | { status: "RETRYING" | "FAILED"; errorMessage: string }
): Promise<boolean> {
  const { count } = await db.competitionResolutionWork.updateMany({
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

/** How a game's resolution work stands. Used by the admin analytics. */
export async function countResolutions(gameId: string): Promise<ResolutionCounts> {
  const rows = await db.competitionResolutionWork.groupBy({
    by: ["status"],
    where: { gameId },
    _count: { _all: true },
  })

  const counts: ResolutionCounts = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0 }
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof ResolutionCounts
    if (key in counts) counts[key] = row._count._all
  }
  return counts
}

/** Whether anything is still waiting to be resolved anywhere. */
export async function hasOutstandingResolutions(): Promise<boolean> {
  const outstanding = await db.competitionResolutionWork.count({
    where: { status: { in: [...OUTSTANDING] } },
  })
  return outstanding > 0
}
