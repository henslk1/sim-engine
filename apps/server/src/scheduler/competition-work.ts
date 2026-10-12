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
  /** Carried so the resolver can replace what it resolves, per game. */
  gameId: string
  attempt: number
}

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
  chunkSize: number,
  excludeGameIds: string[] = []
): Promise<ClaimedResolution[]> {
  const candidates = await db.competitionResolutionWork.findMany({
    where: {
      OR: claimableWhere(now),
      ...(excludeGameIds.length > 0 && { gameId: { notIn: excludeGameIds } }),
    },
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
    select: { id: true, competitionId: true, gameId: true, attempt: true },
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
  outcome:
    | { status: "COMPLETED" }
    | { status: "CANCELLED" }
    | { status: "RETRYING" | "FAILED"; errorMessage: string }
): Promise<boolean> {
  const settled = outcome.status === "COMPLETED" || outcome.status === "CANCELLED"

  const { count } = await db.competitionResolutionWork.updateMany({
    where: { id, claimedBy: token, status: "RUNNING" },
    data: {
      status: outcome.status,
      completedAt: outcome.status === "RETRYING" ? null : now,
      errorMessage: settled ? null : outcome.errorMessage,
      leaseUntil: null,
    },
  })

  return count === 1
}

/**
 * Give up on work whose owner died too many times.
 *
 * `attempt` increments on every claim, so a crashed worker's item carries its
 * count forward and the clean failure path honours it. The reclaim path did
 * not: an item that kills the process never reaches that path, so it was
 * reclaimed, killed the process again, and was reclaimed again - with nothing
 * anywhere saying it had been tried four times. This is where it stops being
 * tried and starts being a failure somebody can see.
 *
 * Scoped to RUNNING with a lapsed lease, which is exactly "claimed and then
 * abandoned". An item reset by an administrator comes back with `attempt` at
 * zero, so a deliberate retry is never caught by this.
 */
export async function abandonExhaustedResolutions(now: Date, maxAttempts: number): Promise<number> {
  const { count } = await db.competitionResolutionWork.updateMany({
    where: {
      status: "RUNNING",
      attempt: { gte: maxAttempts },
      OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }],
    },
    data: {
      status: "FAILED",
      completedAt: now,
      leaseUntil: null,
      errorMessage: `Abandoned after ${maxAttempts} attempts — the worker holding it stopped without finishing`,
    },
  })

  if (count > 0) {
    console.warn(`[resolver] gave up on ${count} competition(s) abandoned mid-resolution ${maxAttempts} times`)
  }

  return count
}

/**
 * The games whose nightly update is running right now.
 *
 * The resolver holds these back. A nightly and a competition sweep are already
 * serialised against each other — the planner works one run at a time within a
 * game — but the resolver is not part of that: it runs on its own timer and
 * would happily resolve a few hundred competitions against the same connection
 * pool a nightly is working through, competing for connections with the thing
 * players are locked out of the game waiting for.
 *
 * A lapsed lease does not count as running. Such a run is one the scheduler is
 * about to reclaim, and treating it as live would stall the queue for that game
 * indefinitely if a process died mid-nightly.
 */
export async function gamesInNightly(now: Date): Promise<string[]> {
  const running = await db.scheduledTaskRun.findMany({
    where: { taskType: "NIGHTLY", status: "RUNNING", leaseUntil: { gt: now } },
    select: { gameId: true },
    distinct: ["gameId"],
  })

  return running.map((run) => run.gameId)
}
