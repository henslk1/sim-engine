/**
 * The tick: the only thing in the system that decides work should start.
 *
 * It wakes on a timer and does two separate things, in this order:
 *
 *   materialize  every task whose boundary has passed becomes one PENDING run,
 *                and the task moves on to its next boundary
 *   drain        each game's outstanding runs are claimed and executed
 *
 * Splitting them is what makes the whole thing tolerant of a timer that
 * misbehaves. The timer is allowed to fire twice, fire late, or not fire at
 * all — none of that decides whether work happens. A run row does, and only one
 * process can hold it at a time. Deferring is free: a run that cannot start yet
 * is simply left PENDING and picked up by a later tick, with nothing written
 * and nothing lost.
 *
 * **Execution is at-least-once, not exactly-once.** The unique key guarantees
 * one run row per boundary, and the claim guarantees one holder at a time, but
 * a process that dies mid-run leaves a lease that lapses and the work is
 * redone. Handlers have to tolerate that. The nightly does, because
 * `selectEligibleAnimals` only matches an animal whose current age equals a
 * marker's cycle — an animal already aged has moved past its marker and stops
 * matching. Anything added later has to earn the same property. The fencing token on each claim is what
 * stops the two attempts writing over each other.
 *
 * Nothing here constructs a date. Every reading comes from the injected
 * `Clock`: one per tick for the planning, and deliberate re-reads between runs
 * and when recording when something finished — a thirty-minute nightly must not
 * judge the next run's lease against an instant from before it started. Every
 * boundary comes from `nextBoundaryFor`, which reads the game's own
 * configuration. See `schedule-architecture.test.ts`, which fails the build if
 * that stops being true.
 */

import { hostname } from "node:os"
import { randomUUID } from "node:crypto"
import { db } from "@sim-engine/db"
import type { Prisma, ScheduledTaskRunStatus } from "@sim-engine/db"
import {
  SCHEDULED_TASK_TYPES,
  describeSchedule,
  isScheduledType,
  materializeTask,
  nextBoundaryFor,
  planGameRuns,
  systemClock,
  validateGameSchedule,
  type Clock,
  type GameSchedule,
  type RunRow,
  type ScheduledType,
  type TaskRow,
} from "@sim-engine/engine"
import { HANDLERS, type HandlerCounts, type TaskHandler } from "./handlers.js"

export type SchedulerOptions = {
  /** Where "now" comes from. Overridden in tests. */
  clock?: Clock
  /**
   * What each task type actually does. Replaceable so the claiming, leasing
   * and superseding can be exercised against a database without running a
   * thirty-minute nightly to do it.
   */
  handlers?: Record<ScheduledType, TaskHandler>
  /** How often to wake. One minute is the finest schedule anything needs. */
  tickIntervalMs?: number
  /**
   * How long a claim is good for without a heartbeat. Short enough that a
   * crashed run is picked up promptly, long enough to survive a slow query.
   */
  leaseMs?: number
  /** Identifies this process in `claimedBy`. */
  instanceId?: string
  /** A guard against a planner that somehow never stops producing work. */
  maxRunsPerGamePerTick?: number
  /**
   * How many times a boundary is attempted before it is given up on. A retry
   * waits for the next tick rather than happening immediately, so this is also
   * what stops a reclaim loop.
   */
  maxAttempts?: number
}

export type SchedulerHealth = {
  /** False if the scheduler could not start at all. */
  started: boolean
  lastTickAt: Date | null
  lastTickError: string | null
  consecutiveTickFailures: number
}

export type TickSummary = {
  materialized: number
  executed: number
  failed: number
  superseded: number
  deferred: number
}

/** The statuses a run can still be acted on from. */
const ACTIVE_STATUSES: ScheduledTaskRunStatus[] = ["PENDING", "RETRYING", "RUNNING"]

const DEFAULTS = {
  tickIntervalMs: 60_000,
  leaseMs: 120_000,
  maxRunsPerGamePerTick: 8,
  maxAttempts: 3,
}

/**
 * The database's version of `isClaimable`, and it has to agree with it exactly.
 *
 * Where they disagree, the planner picks a run the claim then refuses, the run
 * is dropped from this tick, and the next tick does the same thing — a row
 * stuck forever with nobody reporting anything wrong. Sharing one definition
 * between the claim and the supersede is what keeps them from drifting apart.
 *
 * `lte`, not `lt`, because the planner treats a lease that expires exactly now
 * as expired.
 */
function claimableWhere(now: Date): Prisma.ScheduledTaskRunWhereInput[] {
  return [
    { status: { in: ["PENDING", "RETRYING"] } },
    // Left RUNNING by a process that died: the lease stopped being renewed.
    { status: "RUNNING", leaseUntil: { lte: now } },
    // A RUNNING row with no lease at all cannot be produced by the claim, which
    // writes both in one statement. `isClaimable` treats it as abandoned so a
    // game is never stuck permanently, and this must say the same or the
    // planner would offer a run the claim could never take.
    { status: "RUNNING", leaseUntil: null },
  ]
}

/** Prisma's code for a unique constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createScheduler(options: SchedulerOptions = {}) {
  const clock = options.clock ?? systemClock
  const handlers = options.handlers ?? HANDLERS
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULTS.tickIntervalMs
  const leaseMs = options.leaseMs ?? DEFAULTS.leaseMs
  const maxRunsPerGamePerTick = options.maxRunsPerGamePerTick ?? DEFAULTS.maxRunsPerGamePerTick
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts
  const instanceId = options.instanceId ?? `${hostname()}:${process.pid}`

  let timer: NodeJS.Timeout | null = null
  let inFlight: Promise<TickSummary> | null = null
  let stopping = false

  const health: SchedulerHealth = {
    started: false,
    lastTickAt: null,
    lastTickError: null,
    consecutiveTickFailures: 0,
  }

  /**
   * A game's scheduling configuration, or null with a complaint logged.
   *
   * A game whose config is missing or unusable is skipped rather than allowed
   * to throw: one misconfigured game must not stop every other game's nightly.
   */
  function scheduleFor(gameId: string, config: GameSchedule | null): GameSchedule | null {
    if (!config) {
      console.error(`[scheduler] game ${gameId} has no GameConfig row — skipped`)
      return null
    }

    const problems = validateGameSchedule(config)
    if (problems.length > 0) {
      console.error(`[scheduler] game ${gameId} has an unusable schedule — skipped: ${problems.join("; ")}`)
      return null
    }

    return config
  }

  async function loadGameSchedules(): Promise<Map<string, GameSchedule>> {
    const games = await db.game.findMany({
      where: { isActive: true },
      select: {
        id: true,
        gameConfig: {
          select: {
            nightlyRunHour: true,
            nightlyRunMinute: true,
            gameTimeZone: true,
            competitionSweepMinutes: true,
          },
        },
      },
    })

    const schedules = new Map<string, GameSchedule>()
    for (const game of games) {
      const schedule = scheduleFor(game.id, game.gameConfig)
      if (schedule) schedules.set(game.id, schedule)
    }
    return schedules
  }

  /**
   * Give every active game a task row for every scheduled type.
   *
   * Only ever creates. An existing row's `nextRunAt` is left alone, because it
   * may have been moved deliberately — by an admin, or by a config change that
   * recomputed it — and silently resetting it on every boot would make that
   * impossible.
   */
  async function ensureTasks(): Promise<number> {
    const now = clock.now()
    const schedules = await loadGameSchedules()
    if (schedules.size === 0) return 0

    const existing = await db.scheduledTask.findMany({
      where: { gameId: { in: [...schedules.keys()] } },
      select: { gameId: true, taskType: true },
    })
    const have = new Set(existing.map((task) => `${task.gameId}:${task.taskType}`))

    let created = 0
    for (const [gameId, schedule] of schedules) {
      for (const taskType of SCHEDULED_TASK_TYPES) {
        if (have.has(`${gameId}:${taskType}`)) continue

        try {
          await db.scheduledTask.create({
            data: { gameId, taskType, nextRunAt: nextBoundaryFor(taskType, schedule, now) },
          })
          created++
          console.log(`[scheduler] game ${gameId}: ${taskType} scheduled ${describeSchedule(taskType, schedule)}`)
        } catch (error) {
          // Another instance booting at the same moment got there first.
          if (!isUniqueViolation(error)) throw error
        }
      }
    }

    return created
  }

  /**
   * Turn every due task into exactly one PENDING run.
   *
   * The run is created first and the task advanced second. If this process
   * dies between the two, the next tick tries the same insert, hits the unique
   * constraint on (gameId, taskType, scheduledFor), and advances the task —
   * so the boundary is covered once either way. Doing it the other way round
   * would lose the run entirely.
   */
  async function materializeDue(now: Date, schedules: Map<string, GameSchedule>): Promise<number> {
    const due = await db.scheduledTask.findMany({
      where: { enabled: true, nextRunAt: { lte: now }, gameId: { in: [...schedules.keys()] } },
      orderBy: { nextRunAt: "asc" },
      select: { id: true, gameId: true, taskType: true, nextRunAt: true },
    })

    let materialized = 0

    for (const row of due) {
      if (!isScheduledType(row.taskType)) {
        // VENUE_ROTATION has no handler by design. A row for it is someone's
        // mistake, and running it is not an option, so say so and move on.
        console.error(`[scheduler] task ${row.id} has type ${row.taskType}, which nothing is scheduled to run`)
        continue
      }

      const schedule = schedules.get(row.gameId)
      if (!schedule) continue

      const task: TaskRow = { id: row.id, gameId: row.gameId, taskType: row.taskType, nextRunAt: row.nextRunAt }
      const plan = materializeTask(task, schedule, now)

      try {
        await db.scheduledTaskRun.create({
          data: {
            taskId: task.id,
            gameId: task.gameId,
            taskType: task.taskType,
            scheduledFor: plan.scheduledFor,
            status: "PENDING",
          },
        })
        materialized++

        if (plan.lateByMs > tickIntervalMs) {
          // Worth saying out loud: this is the catch-up path. One run covers
          // the missed boundary and the task jumps to the next one ahead,
          // rather than replaying every boundary in between.
          const lateMinutes = Math.round(plan.lateByMs / 60_000)
          console.warn(
            `[scheduler] game ${task.gameId}: ${task.taskType} for ${plan.scheduledFor.toISOString()} is ${lateMinutes}m late — running once, next at ${plan.nextRunAt.toISOString()}`
          )
        }
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // The run for this boundary already exists. Fall through and make sure
        // the task is advanced past it so this does not repeat every tick.
      }

      // Compare-and-swap: only move the task if nothing else has moved it.
      // This is the same mutual exclusion the claim uses, and it is why two
      // instances can materialize at once without a lock.
      await db.scheduledTask.updateMany({
        where: { id: task.id, nextRunAt: task.nextRunAt },
        data: { nextRunAt: plan.nextRunAt },
      })
    }

    return materialized
  }

  /**
   * Take ownership of a run, if it is still there to be taken.
   *
   * One conditional statement, and the row count is the answer: 1 means this
   * process owns it, 0 means someone else claimed it first or it was already
   * cancelled. No lock is held afterwards, so a thirty-minute nightly does not
   * sit on an open transaction — the lease is what says the work is still
   * alive, and the heartbeat is what renews it.
   *
   * The token written to `claimedBy` is a fencing token, and it is why every
   * later write names it. Without one, a process whose lease had lapsed could
   * finish its work after the run was reclaimed and write COMPLETED over the
   * attempt that is still going: the row would say finished while a handler was
   * still running, and the counts would be the losing attempt's. Matching on
   * the token means a stale writer changes nothing, and finds out.
   */
  async function claim(runId: string, now: Date): Promise<string | null> {
    const token = `${instanceId}#${randomUUID()}`

    const { count } = await db.scheduledTaskRun.updateMany({
      where: { id: runId, OR: claimableWhere(now) },
      data: {
        status: "RUNNING",
        claimedBy: token,
        claimedAt: now,
        startedAt: now,
        heartbeatAt: now,
        leaseUntil: new Date(now.getTime() + leaseMs),
        attempt: { increment: 1 },
      },
    })

    return count === 1 ? token : null
  }

  /** Push the lease out. False means this process no longer owns the run. */
  async function heartbeat(runId: string, token: string): Promise<boolean> {
    const now = clock.now()
    const { count } = await db.scheduledTaskRun.updateMany({
      where: { id: runId, claimedBy: token, status: "RUNNING" },
      data: { heartbeatAt: now, leaseUntil: new Date(now.getTime() + leaseMs) },
    })

    return count === 1
  }

  /**
   * Write a run's outcome, but only while this process still owns it.
   *
   * False means the claim was lost. That is not an error: another process is
   * already redoing the work and its result is the one that counts.
   */
  async function finish(
    runId: string,
    token: string,
    data: Prisma.ScheduledTaskRunUpdateManyMutationInput
  ): Promise<boolean> {
    const { count } = await db.scheduledTaskRun.updateMany({
      where: { id: runId, claimedBy: token, status: "RUNNING" },
      data,
    })

    if (count !== 1) {
      console.warn(`[scheduler] run ${runId} was taken over mid-flight — this attempt's result is discarded`)
    }

    return count === 1
  }

  type Outcome = "completed" | "failed" | "lost"

  async function execute(run: RunRow, gameId: string, token: string, attempt: number): Promise<Outcome> {
    const handler = handlers[run.taskType]

    // The lease is renewed on a timer rather than by the handler. Tying it to
    // progress through a loop meant a game with fewer animals than the
    // heartbeat interval never renewed at all, and one slow aggregate at the
    // end could outlast the lease however many animals there were.
    let owned = true
    const renew = setInterval(() => {
      void heartbeat(run.id, token).then((held) => {
        owned = held
      })
    }, Math.max(1_000, Math.floor(leaseMs / 3)))
    renew.unref()

    try {
      const totals = zeroFilled(
        await handler({ gameId, runId: run.id, scheduledFor: run.scheduledFor, clock, token })
      )

      // A handler that returns normally having failed some of its work has not
      // completed. The nightly already writes `success: false` on its own log
      // in that case, and a run row saying COMPLETED beside it was a flat
      // contradiction.
      if (totals.failedCount > 0) {
        const retrying = attempt < maxAttempts
        const held = await finish(run.id, token, {
          status: retrying ? "RETRYING" : "FAILED",
          completedAt: retrying ? null : clock.now(),
          errorMessage: `${totals.failedCount} of ${totals.processedCount} items failed`,
          leaseUntil: null,
          ...totals,
        })
        return held ? "failed" : "lost"
      }

      const held = await finish(run.id, token, {
        status: "COMPLETED",
        completedAt: clock.now(),
        errorMessage: null,
        // Released explicitly rather than left to lapse, so a finished run
        // never looks briefly like an abandoned one.
        leaseUntil: null,
        ...totals,
      })

      return held ? "completed" : "lost"
    } catch (error) {
      console.error(`[scheduler] ${run.taskType} failed for game ${gameId}:`, error)

      // A retry waits for the next tick — the run is already out of this tick's
      // working set — so attempts are a minute apart rather than instant, and
      // `maxAttempts` is what stops a reclaim becoming a loop.
      const retrying = attempt < maxAttempts
      const held = await finish(run.id, token, {
        status: retrying ? "RETRYING" : "FAILED",
        completedAt: retrying ? null : clock.now(),
        errorMessage: describeError(error),
        leaseUntil: null,
      }).catch((markError) => {
        console.error("[scheduler] could not mark the run failed:", markError)
        return false
      })

      return held ? "failed" : "lost"
    } finally {
      clearInterval(renew)
      if (!owned) console.warn(`[scheduler] lost the lease on run ${run.id} while it was running`)
    }
  }


  /** Claim and run what each game is ready for, one game at a time. */
  async function drain(now: Date, schedules: Map<string, GameSchedule>): Promise<Omit<TickSummary, "materialized">> {
    const rows = await db.scheduledTaskRun.findMany({
      where: { status: { in: ACTIVE_STATUSES }, gameId: { in: [...schedules.keys()] } },
      select: { id: true, gameId: true, taskType: true, scheduledFor: true, status: true, leaseUntil: true },
    })

    const byGame = new Map<string, RunRow[]>()
    for (const row of rows) {
      if (!isScheduledType(row.taskType)) continue
      const run: RunRow = {
        id: row.id,
        taskType: row.taskType,
        scheduledFor: row.scheduledFor,
        status: row.status,
        leaseUntil: row.leaseUntil,
      }
      const existing = byGame.get(row.gameId)
      if (existing) existing.push(run)
      else byGame.set(row.gameId, [run])
    }

    let executed = 0
    let failed = 0
    let superseded = 0
    let deferred = 0

    // Games are drained one after another, and on a single server that means a
    // game's long nightly does delay the games queued behind it. With one game
    // that costs nothing, and sequential execution is one less thing to get
    // wrong during the cutover — but it is a real limit, not an independence
    // guarantee, and it is the first thing to change when there is a second
    // game. The claim already permits it: nothing here assumes one game at a
    // time, only one run at a time within a game.
    for (const [gameId, runs] of byGame) {
      let remaining = [...runs]

      for (let pass = 0; pass < maxRunsPerGamePerTick; pass++) {
        // Re-read the clock each pass. A nightly can run for half an hour, and
        // whether the next run's lease is still live has to be judged against
        // the present, not against when this tick started.
        const at = pass === 0 ? now : clock.now()
        const plan = planGameRuns(remaining, at)

        if (plan.supersede.length > 0) {
          const ids = plan.supersede.map((run) => run.id)
          // The same predicate the claim uses, so a run the planner says is
          // superseded is one this statement can actually cancel. Narrowing it
          // to PENDING and RETRYING silently left abandoned RUNNING rows behind
          // while still counting them as cancelled and dropping them from the
          // working set — they were never touched again.
          const { count } = await db.scheduledTaskRun.updateMany({
            where: { id: { in: ids }, OR: claimableWhere(at) },
            data: {
              status: "CANCELLED",
              completedAt: at,
              claimedBy: null,
              leaseUntil: null,
              errorMessage: "Superseded by a later boundary",
            },
          })

          superseded += count
          if (count !== ids.length) {
            console.warn(`[scheduler] expected to cancel ${ids.length} superseded run(s), cancelled ${count}`)
          }
          remaining = remaining.filter((run) => !ids.includes(run.id))
        }

        if (!plan.execute) {
          deferred += plan.deferred.length
          break
        }

        // Winding down: leave the rest PENDING for the next process to pick up
        // rather than starting work this one may not finish.
        if (stopping) {
          deferred += plan.deferred.length + 1
          break
        }

        const run = plan.execute
        // Out of the working set whatever happens next, so a run that fails
        // and goes RETRYING waits for the next tick rather than burning every
        // attempt inside this one.
        remaining = remaining.filter((other) => other.id !== run.id)

        const token = await claim(run.id, at)
        if (!token) continue

        // `attempt` after the claim incremented it: this run's attempt number.
        const claimed = await db.scheduledTaskRun.findUnique({
          where: { id: run.id },
          select: { attempt: true },
        })

        const outcome = await execute(run, gameId, token, claimed?.attempt ?? 1)
        if (outcome === "completed") executed++
        else if (outcome === "failed") failed++
      }
    }

    return { executed, failed, superseded, deferred }
  }

  async function runTick(): Promise<TickSummary> {
    // Every tick, not only at boot. A game created or activated while the
    // server was already running would otherwise have no task rows until
    // somebody happened to restart it — and nothing would say so. Two queries
    // when there is nothing to add.
    await ensureTasks()

    const now = clock.now()
    const schedules = await loadGameSchedules()

    if (schedules.size === 0) {
      return { materialized: 0, executed: 0, failed: 0, superseded: 0, deferred: 0 }
    }

    const materialized = await materializeDue(now, schedules)
    const drained = await drain(now, schedules)

    return { materialized, ...drained }
  }

  /**
   * One tick, with the guarantee that two never overlap.
   *
   * A nightly that runs longer than the tick interval is normal, not an error:
   * the timer keeps firing and those ticks are skipped. Without this, a slow
   * night would stack ticks on top of each other until something gave way.
   */
  async function tick(): Promise<TickSummary> {
    if (inFlight) return inFlight

    const started = runTick()
      .then((summary) => {
        health.lastTickAt = clock.now()
        health.lastTickError = null
        health.consecutiveTickFailures = 0
        return summary
      })
      .catch((error) => {
        // A tick must never reject: it is called from a timer, and an
        // unhandled rejection takes the whole server with it. It is still
        // recorded, so a scheduler that is failing every minute is visible
        // from /health rather than only in the logs.
        console.error("[scheduler] tick failed:", error)
        health.lastTickAt = clock.now()
        health.lastTickError = describeError(error)
        health.consecutiveTickFailures++
        return { materialized: 0, executed: 0, failed: 0, superseded: 0, deferred: 0 }
      })
      .finally(() => {
        inFlight = null
      })

    inFlight = started
    return started
  }

  function start(): void {
    if (timer) return
    stopping = false

    void ensureTasks()
      .then(() => {
        health.started = true
        return tick()
      })
      .catch((error) => {
        // Left false on purpose. `/health` reports the scheduler as down, so a
        // server that is serving pages while scheduling nothing is something a
        // deployment can actually detect.
        health.lastTickError = describeError(error)
        console.error("[scheduler] start failed:", error)
      })

    timer = setInterval(() => void tick(), tickIntervalMs)
    console.log(`[scheduler] database backend started as ${instanceId}, ticking every ${tickIntervalMs / 1000}s`)
  }

  /**
   * Stop starting work and wait for the current tick.
   *
   * A handler already running is not interrupted — there is nothing safe to
   * interrupt it with. If the process is killed before it finishes, its lease
   * lapses within `leaseMs` and the next process reclaims the run, which is
   * exactly the crash path this design is built around.
   */
  async function stop(): Promise<void> {
    stopping = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (inFlight) await inFlight.catch(() => undefined)
  }

  return { start, stop, tick, ensureTasks, instanceId, getHealth: (): SchedulerHealth => ({ ...health }) }
}

export type Scheduler = ReturnType<typeof createScheduler>

/** Every counter, so a run row never carries a stale number from a past attempt. */
function zeroFilled(counts: Partial<HandlerCounts>): HandlerCounts {
  return {
    eligibleCount: counts.eligibleCount ?? 0,
    claimedCount: counts.claimedCount ?? 0,
    processedCount: counts.processedCount ?? 0,
    succeededCount: counts.succeededCount ?? 0,
    failedCount: counts.failedCount ?? 0,
    retriedCount: counts.retriedCount ?? 0,
    skippedCount: counts.skippedCount ?? 0,
  }
}
