/**
 * What a tick decides, with no database and no clock of its own.
 *
 * The runner's job is reduced to: read rows, ask these functions, write the
 * answer. Everything that is actually a decision — which boundary a late run
 * covers, which of three piled-up sweeps is the real one, whether a RUNNING
 * row belongs to a live process or a dead one — happens here, where it can be
 * tested by handing it rows and an instant.
 */

import type { ScheduledTaskRunStatus } from "@sim-engine/db"
import { nextBoundaryFor, type GameSchedule, type ScheduledType } from "./clock.js"

export type TaskRow = {
  id: string
  gameId: string
  taskType: ScheduledType
  /** The boundary this task is waiting on. Due once it is not in the future. */
  nextRunAt: Date
}

export type RunRow = {
  id: string
  taskType: ScheduledType
  /** The boundary this run covers. Its identity, with game and type. */
  scheduledFor: Date
  status: ScheduledTaskRunStatus
  leaseUntil: Date | null
}

export type Materialization = {
  /** The boundary that came due. Recorded as-is, even when it is hours old. */
  scheduledFor: Date
  /** Where the task waits next. Always in the future. */
  nextRunAt: Date
  /** How late this tick is to the boundary. Zero on a healthy server. */
  lateByMs: number
}

export type GamePlan = {
  /** The single run to claim and execute now, if any. */
  execute: RunRow | null
  /** Runs an newer boundary has overtaken. Cancelled, not run. */
  supersede: RunRow[]
  /** Left PENDING for a later tick. Nothing is written for these. */
  deferred: RunRow[]
  /** The live run that is holding this game, when one is. */
  blockedBy: RunRow | null
}

/** Whether a claim on this run is still being renewed by a living process. */
export function isLeaseLive(run: Pick<RunRow, "status" | "leaseUntil">, now: Date): boolean {
  if (run.status !== "RUNNING") return false
  // A RUNNING row with no lease cannot be produced by the claim, which sets
  // both in one statement. If one ever appears, treating it as abandoned gets
  // the game moving again; treating it as live would stop that game's nightly
  // permanently and need someone to go and fix it by hand.
  if (run.leaseUntil === null) return false
  return run.leaseUntil.getTime() > now.getTime()
}

/** Whether this run is available to be claimed, including one left by a crash. */
export function isClaimable(run: Pick<RunRow, "status" | "leaseUntil">, now: Date): boolean {
  switch (run.status) {
    case "PENDING":
    case "RETRYING":
      return true
    case "RUNNING":
      return !isLeaseLive(run, now)
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED":
      return false
    default: {
      const unhandled: never = run.status
      throw new Error(`Unhandled run status ${String(unhandled)}`)
    }
  }
}

/**
 * Turn a due task into the run that covers it, and move the task on.
 *
 * `nextRunAt` is computed from **now**, not from the boundary that just came
 * due, and that single choice is what makes a missed run run late once instead
 * of replaying history. After an outage over three nights, stepping forward
 * from the old boundary would produce three nightlies — or seventy-two sweeps —
 * that all have to be cancelled again. Reading the grid from the present
 * produces exactly one, and the `scheduledFor` on it still records honestly
 * which boundary it was for.
 */
export function materializeTask(task: TaskRow, schedule: GameSchedule, now: Date): Materialization {
  return {
    scheduledFor: task.nextRunAt,
    nextRunAt: nextBoundaryFor(task.taskType, schedule, now),
    lateByMs: Math.max(0, now.getTime() - task.nextRunAt.getTime()),
  }
}

// The nightly runs first when both are waiting. It is the one with a time
// players are told, it is the long one, and the sweep it delays is idempotent
// and will collapse to a single run when it gets its turn.
const PRIORITY: Record<ScheduledType, number> = {
  NIGHTLY: 0,
  COMPETITION_SWEEP: 1,
}

/**
 * Decide what to do with one game's outstanding runs.
 *
 * Two rules, both of which exist because the trigger is allowed to misbehave:
 *
 * **One run at a time per game.** A game is a consistent world — aging an
 * animal and resolving a competition it is entered in must not interleave — so
 * while any run for a game holds a live lease, nothing else for that game
 * starts. Other games are entirely unaffected; this is the only thing the
 * scheduler serialises.
 *
 * **The newest boundary wins.** If three hourly sweeps piled up behind a long
 * nightly, running all three in a row would do the same scan three times. The
 * latest is kept and the rest are cancelled, which is exactly what "one scan
 * afterwards finds everything that is due" means in practice.
 */
export function planGameRuns(runs: readonly RunRow[], now: Date): GamePlan {
  const blockedBy = runs.find((run) => isLeaseLive(run, now)) ?? null
  const claimable = runs.filter((run) => isClaimable(run, now))

  // Of the runs waiting for each task type, only the one covering the newest
  // boundary is worth running.
  const newestPerType = new Map<ScheduledType, RunRow>()
  for (const run of claimable) {
    const held = newestPerType.get(run.taskType)
    if (!held || run.scheduledFor.getTime() > held.scheduledFor.getTime()) {
      newestPerType.set(run.taskType, run)
    }
  }
  const kept = [...newestPerType.values()]
  const keptIds = new Set(kept.map((run) => run.id))
  const supersede = claimable.filter((run) => !keptIds.has(run.id))

  // Superseding still happens while a game is blocked: the pile-up is real
  // whether or not anything can start yet, and clearing it is what stops the
  // backlog growing for the length of a nightly.
  if (blockedBy) return { execute: null, supersede, deferred: kept, blockedBy }

  const ordered = [...kept].sort((a, b) => {
    const byType = PRIORITY[a.taskType] - PRIORITY[b.taskType]
    return byType !== 0 ? byType : a.scheduledFor.getTime() - b.scheduledFor.getTime()
  })

  const [execute, ...deferred] = ordered
  return { execute: execute ?? null, supersede, deferred, blockedBy: null }
}
