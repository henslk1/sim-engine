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
import {
  setGameMaintenance,
  syncGameMaintenance,
  lockGameForMaintenance,
  GameplayDrainTimeout,
  lockGameSchedule,
  ScheduleLockTimeout,
} from "@sim-engine/trpc"
import type { Prisma, ScheduledTaskRunStatus, ScheduledTaskType } from "@sim-engine/db"
import {
  SCHEDULED_TASK_TYPES,
  describeSchedule,
  isLeaseLive,
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
import { realtimeControl } from "../realtime.js"

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
  /** How many games may be drained at once. */
  maxConcurrentGames?: number
  /** The longest the tick may sleep with nothing due. */
  maxIdleSleepMs?: number
  /**
   * How many times a boundary is attempted before it is given up on. A retry
   * waits for the next tick rather than happening immediately, so this is also
   * what stops a reclaim loop.
   */
  maxAttempts?: number
  /**
   * Tell a game's players that its maintenance window may have changed.
   *
   * A nudge, not a state update. Everything that decides anything - the guard,
   * the lock, the banner, the redirect - reads the run row; this only shortens
   * the wait before somebody reads it again. So it is deliberately sent on
   * "something happened here" rather than on a transition anybody has reasoned
   * about: a spurious one costs a query, and a lost one costs nothing at all,
   * because the poll underneath it has not gone anywhere.
   *
   * Replaceable so the announcement can be observed without a socket server.
   */
  announceMaintenance?: (gameId: string) => void
}

export type SchedulerHealth = {
  /** False if the scheduler could not start at all. */
  started: boolean
  lastTickAt: Date | null
  lastTickError: string | null
  consecutiveTickFailures: number
  /**
   * When the next tick is due.
   *
   * Worth exposing because the cadence is no longer fixed: a scheduler with
   * nothing to do sleeps, and "it has not ticked for twelve minutes" needs to
   * be distinguishable from "it has stopped ticking".
   */
  nextWakeAt: Date | null
  /**
   * Nightlies that could not start because gameplay was still draining.
   *
   * Expected in small numbers and self-correcting - the run stays claimable and
   * the next tick retries. A count that keeps climbing means gameplay
   * transactions are routinely outlasting `CLAIM_TX.timeout`, which is a
   * different problem from the scheduler being broken, and worth being able to
   * tell apart from one.
   */
  claimContentionCount: number
  lastClaimContentionAt: Date | null
  /**
   * Games whose draining threw, and the last one to do it.
   *
   * One game is caught so it cannot take the tick down for the others, and
   * that catch used to be the end of it: a run would stay PENDING for ever
   * while `/health` said `ok`, `lastTickError` said null and the only record
   * was a line in the log. A failure nothing can see is the same as one
   * nobody fixes, so it is counted and the reason is kept.
   */
  gameErrorCount: number
  lastGameError: { gameId: string; message: string; at: Date } | null
}

export type TickSummary = {
  materialized: number
  executed: number
  failed: number
  superseded: number
  deferred: number
  /**
   * Games whose draining threw where nothing else could catch it.
   *
   * Counted separately from `failed`, which is runs that were attempted and
   * did not succeed. This is a game that never got that far - a schema the
   * code disagrees with, a connection that would not come - and the run it was
   * about is still sitting there PENDING with nothing recorded against it.
   */
  gameErrors: number
}

/** The statuses a run can still be acted on from. */
const ACTIVE_STATUSES: ScheduledTaskRunStatus[] = ["PENDING", "RETRYING", "RUNNING"]

const DEFAULTS = {
  /**
   * How many games are drained at once.
   *
   * Small on purpose. Each concurrent nightly holds its own aging cache and
   * its own stream of per-animal transactions, so this trades directly against
   * the connection pool: too many and every game runs slower than it would
   * have done in turn.
   */
  maxConcurrentGames: 4,
  tickIntervalMs: 60_000,
  /**
   * The longest the tick may sleep when nothing is due.
   *
   * Generous enough that a managed Postgres gets real idle time - anything
   * past its five-minute timeout is time nobody is paying for - and short
   * enough that work this process could not anticipate, such as a task row
   * another instance just created, is still found quickly.
   */
  maxIdleSleepMs: 15 * 60_000,
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
  const maxConcurrentGames = Math.max(1, options.maxConcurrentGames ?? DEFAULTS.maxConcurrentGames)
  const MAX_IDLE_SLEEP_MS = Math.max(
    options.tickIntervalMs ?? DEFAULTS.tickIntervalMs,
    options.maxIdleSleepMs ?? DEFAULTS.maxIdleSleepMs
  )
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts
  const instanceId = options.instanceId ?? `${hostname()}:${process.pid}`
  const announceMaintenance =
    options.announceMaintenance ??
    ((gameId: string) => {
      // Through the Redis adapter, so a nightly running on one instance reaches
      // the players connected to every other one. `realtimeControl` tolerates
      // there being no socket server at all, which is the case in scripts and
      // for the seconds before `initSocket` has run.
      realtimeControl.emitToGame(gameId, "maintenance:changed", { gameId })
    })

  let timer: NodeJS.Timeout | null = null
  let inFlight: Promise<TickSummary> | null = null
  let stopping = false

  /**
   * The games the last reconciliation saw a nightly running in.
   *
   * Only so the tick can tell a change from a repetition - a thirty-minute
   * nightly on another instance is RUNNING for thirty ticks, and announcing it
   * on each of them would send every player's client to re-read the same
   * answer thirty times.
   *
   * It deliberately does not know about runs this process is executing. It
   * cannot meet one: `tick` refuses to start while another is in flight, and
   * the reconciliation runs at the top of a tick, so a game being drained is
   * never reconciled against halfway through. If that ever stops being true
   * the cost is one redundant nudge, not a wrong answer - which is the whole
   * reason the event carries no state.
   */
  let seenRunning = new Set<string>()

  const health: SchedulerHealth = {
    started: false,
    lastTickAt: null,
    lastTickError: null,
    consecutiveTickFailures: 0,
    nextWakeAt: null,
    claimContentionCount: 0,
    lastClaimContentionAt: null,
    gameErrorCount: 0,
    lastGameError: null,
  }

  /**
   * Announce, never fail.
   *
   * Telling players to look again is not part of the work, and a run that aged
   * ten thousand animals must not be recorded as failed because a socket was
   * not there to hear about it.
   */
  function announce(gameId: string): void {
    try {
      announceMaintenance(gameId)
    } catch (error) {
      console.error(`[scheduler] could not announce maintenance for game ${gameId}:`, error)
    }
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
            shopRotationMinutes: true,
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
  /**
   * How long a nightly may wait for gameplay to drain before giving up.
   *
   * The claim transaction takes the game's maintenance lock exclusively, so it
   * waits behind every gameplay transaction already holding it in shared mode.
   * That means this has to exceed the longest gameplay transaction, and the
   * longest one is competition entry at twenty seconds - it takes the
   * competition's row lock and can queue behind a resolution. The default five
   * seconds was shorter than that, so a perfectly ordinary entry could make the
   * nightly fail to start.
   *
   * Bounded rather than patient: a claim that times out has written nothing and
   * leaves the run claimable, so the next tick retries. Waiting for ever would
   * turn one stuck transaction into a nightly that never runs.
   */
  const CLAIM_TX = { timeout: 40_000, maxWait: 10_000 } as const

  /**
   * How long the claim waits for gameplay to let go of the game.
   *
   * Bounded below `CLAIM_TX.timeout` on purpose, so the wait ends as a lock
   * timeout - which is attributable - rather than as the transaction expiring,
   * which is not. It still has to exceed the longest gameplay transaction, and
   * that is competition entry at twenty seconds.
   */
  const DRAIN_WAIT_MS = 25_000

  /**
   * How long the claim waits for another scheduler to finish claiming.
   *
   * Short, because the thing being waited for is a claim and not any work: the
   * only reason it is ever slow is that the other instance's claim is itself
   * draining gameplay. Giving up then is the right answer - that instance is
   * about to own this game, so there is nothing here worth queueing for.
   *
   * `SCHEDULE_WAIT_MS + DRAIN_WAIT_MS` is what `CLAIM_TX.timeout` has to cover,
   * which is why it is forty seconds rather than thirty.
   */
  const SCHEDULE_WAIT_MS = 5_000

  async function claim(
    runId: string,
    now: Date,
    run: { gameId: string; taskType: ScheduledTaskType }
  ): Promise<string | null> {
    const token = `${instanceId}#${randomUUID()}`

    try {
      return await db.$transaction(async (tx) => {
        // One scheduler at a time for this game, before anything else is read
        // or decided. The planner's "one run at a time within a game" was only
        // ever true inside a process: two instances planned from their own
        // snapshots, both taken before either claim, so each claimed whatever
        // the other had not - A the nightly, B the sweep behind it - and both
        // claims succeeded because they were different rows.
        //
        // Always before the maintenance lock, never after. Gameplay never
        // takes this one, so there is no cycle for the two to deadlock on.
        await lockGameSchedule(tx, run.gameId, SCHEDULE_WAIT_MS)

        // Now that this game is held: is anything else already running in it?
        // The complement of `claimableWhere` - RUNNING with a live lease - so
        // a run abandoned by a dead process is not mistaken for a live one and
        // left to block the game for ever.
        const active = await tx.scheduledTaskRun.findFirst({
          where: {
            gameId: run.gameId,
            id: { not: runId },
            status: "RUNNING",
            leaseUntil: { gt: now },
          },
          select: { id: true, taskType: true },
        })
        if (active) {
          console.log(
            `[scheduler] game ${run.gameId}: not starting ${run.taskType} — ${active.taskType} is still running`
          )
          return null
        }

        // A nightly takes the game's maintenance lock exclusively before it
        // becomes RUNNING. Gameplay mutations hold the same lock in shared mode
        // for as long as their own write is in flight, so this waits for the ones
        // already running and makes them land before the nightly touches
        // anything. A status check alone cannot do that: a nightly can begin in
        // the gap between a mutation checking and writing.
        //
        // Held for this transaction only. From here on the run's status is what
        // refuses later mutations, and keeping the lock for the length of the
        // nightly would queue every player behind it to no purpose.
          if (run.taskType === "NIGHTLY") {
          await lockGameForMaintenance(tx, run.gameId, DRAIN_WAIT_MS)
        }

        const { count } = await tx.scheduledTaskRun.updateMany({
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
      }, CLAIM_TX)
    } catch (error) {
      // Another scheduler was mid-claim for this game and took longer than we
      // were prepared to wait - almost always because its own claim is
      // draining gameplay. Nothing written, run still claimable, next tick.
      if (error instanceof ScheduleLockTimeout) {
        console.log(
          `[scheduler] game ${run.gameId}: another scheduler is claiming it, leaving ${run.taskType} for the next tick`
        )
        return null
      }

      // One expected failure, and it identifies itself.
      //
      // `lockGameForMaintenance` raises this only when Postgres cancelled the
      // lock wait itself, so it means "gameplay was still holding this game"
      // and nothing else. Every other failure - a pool with no connections
      // left, an expired transaction, a mistake in this file - propagates, or
      // it becomes an invisible retry loop behind a tick that reports success.
      if (!(error instanceof GameplayDrainTimeout)) throw error

      // A gameplay transaction held the game's lock for longer than
      // `CLAIM_TX.timeout`. Nothing has been written - the claim and the lock
      // are the same transaction - so the run is still claimable and the next
      // tick tries again. Reported rather than thrown, so one stubborn game
      // does not take the rest of the tick with it.
      health.lastClaimContentionAt = clock.now()
      health.claimContentionCount++
      console.warn(
        `[scheduler] run ${runId} could not take game ${run.gameId} within ${DRAIN_WAIT_MS}ms;` +
          " gameplay is still draining, retrying next tick"
      )
      return null
    }
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

    // Gameplay closes for the duration of a nightly, and it closes here rather
    // than inside the handler so that it is tied to holding the claim: a run
    // this process took over from a dead one blocks just the same, and the
    // block lifts in the `finally` below whatever the outcome was.
    //
    // The per-tick sync is what covers everything this cannot — another
    // instance's nightly, or one already in flight when this process started.
    const blocking = run.taskType === "NIGHTLY"
    // Built once and reused by every refresh below. `startedAt` is what the
    // countdown counts from, so it has to stay the moment the run began rather
    // than advancing each time the entry is renewed.
    const window = blocking ? { runId: run.id, startedAt: clock.now() } : null
    if (window) {
      setGameMaintenance(gameId, window)
      // After the claim committed, so the first thing a client does in response
      // - ask the database - already finds the run RUNNING.
      announce(gameId)
    }

    // The lease is renewed on a timer rather than by the handler. Tying it to
    // progress through a loop meant a game with fewer animals than the
    // heartbeat interval never renewed at all, and one slow aggregate at the
    // end could outlast the lease however many animals there were.
    let owned = true
    const renew = setInterval(() => {
      // The gameplay block is refreshed here too, not only when the run starts.
      //
      // It is held in memory with a five-minute backstop so that a process
      // which stops refreshing cannot lock players out for ever. Nothing was
      // refreshing it during a run: this heartbeat renewed the database lease,
      // and the per-tick `syncMaintenance` cannot help because the tick is
      // itself awaiting this handler. So any nightly lasting longer than five
      // minutes quietly reopened gameplay while it was still aging animals -
      // which is precisely the window the block exists for, since a short
      // nightly barely needs one.
      //
      // Renewal is a third of the lease, 40s by default, so the entry is
      // refreshed seven times over before the backstop could expire it.
      if (window) setGameMaintenance(gameId, window)

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
      if (window) {
        setGameMaintenance(gameId, null)
        // After `finish` wrote the outcome, and sent whatever that outcome was.
        // A run that went RETRYING has not reopened the game, and saying
        // "changed, look again" rather than "open" is what keeps this from
        // being a lie in that case: the client looks, and is told to keep
        // waiting.
        announce(gameId)
      }
      if (!owned) console.warn(`[scheduler] lost the lease on run ${run.id} while it was running`)
    }
  }


  /** This game's outstanding runs, as they are right now. */
  async function activeRunsFor(gameId: string): Promise<RunRow[]> {
    const rows = await db.scheduledTaskRun.findMany({
      where: { status: { in: ACTIVE_STATUSES }, gameId },
      select: { id: true, taskType: true, scheduledFor: true, status: true, leaseUntil: true },
    })
    return rows.filter((row) => isScheduledType(row.taskType)).map((row) => ({
      id: row.id,
      taskType: row.taskType as ScheduledType,
      scheduledFor: row.scheduledFor,
      status: row.status,
      leaseUntil: row.leaseUntil,
    }))
  }

  /**
   * Work one game's outstanding runs, newest boundary first.
   *
   * One run at a time within a game, which is the real constraint — a game's
   * nightly and its competition sweep must not overlap. Across games there is
   * no such constraint, and `drain` runs several of these at once.
   */
  async function drainGame(
    gameId: string,
    runs: RunRow[],
    now: Date
  ): Promise<Omit<TickSummary, "materialized">> {
    let executed = 0
    let failed = 0
    let superseded = 0
    let deferred = 0
    let remaining = [...runs]
    /** Runs this game has already offered up, so a refresh cannot re-offer them. */
    const attempted = new Set<string>()

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
      attempted.add(run.id)
      remaining = remaining.filter((other) => other.id !== run.id)

      const token = await claim(run.id, at, { gameId, taskType: run.taskType })
      if (!token) {
        // Losing a claim is news about this game, not just about this run:
        // somebody else is working it. Carrying on against the snapshot is how
        // two instances ended up running a nightly and a sweep together - this
        // loop dropped the run it lost and then claimed the next one down a
        // plan that no longer had the blocker in it.
        //
        // So re-read. A run already attempted is dropped so the loop cannot
        // offer it again - *unless* somebody else now holds it, which is the
        // one case where it has to stay: it is the blocker, and a plan built
        // without it is the stale plan all over again.
        const live = await activeRunsFor(gameId)
        remaining = live.filter((other) => !attempted.has(other.id) || isLeaseLive(other, at))
        continue
      }

      // `attempt` after the claim incremented it: this run's attempt number.
      const claimed = await db.scheduledTaskRun.findUnique({
        where: { id: run.id },
        select: { attempt: true },
      })

      const outcome = await execute(run, gameId, token, claimed?.attempt ?? 1)
      if (outcome === "completed") executed++
      else if (outcome === "failed") failed++
    }

    return { executed, failed, superseded, deferred, gameErrors: 0 }
  }

  /** Claim and run what each game is ready for. */
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

    const totals = { executed: 0, failed: 0, superseded: 0, deferred: 0, gameErrors: 0 }

    // Games run concurrently, a few at a time. One game's half-hour nightly
    // used to delay every game queued behind it, which was a real limit rather
    // than an independence guarantee — the claim never assumed one game at a
    // time, only one run at a time within a game.
    //
    // Bounded rather than all at once: each concurrent nightly holds its own
    // aging cache and its own stream of transactions, so unbounded fan-out
    // would contend for the connection pool and make every game slower than
    // running them in turn. A worker pulls the next game off a shared cursor
    // as it finishes, so a slow game occupies one slot instead of stalling a
    // batch.
    const queue = [...byGame.entries()]
    let cursor = 0

    const workers = Array.from(
      { length: Math.min(maxConcurrentGames, queue.length) },
      async () => {
        for (;;) {
          const index = cursor++
          const next = queue[index]
          if (!next) return

          const [gameId, runs] = next
          try {
            const result = await drainGame(gameId, runs, now)
            totals.executed += result.executed
            totals.failed += result.failed
            totals.superseded += result.superseded
            totals.deferred += result.deferred
          } catch (error) {
            // A game that throws out here has already failed its own run
            // handling; this is the last net, and it exists so one game cannot
            // take the tick down for every other game.
            //
            // Caught, but not forgiven. The other games carry on, and this one
            // is counted and named - `/health` reporting `ok` while a run sat
            // PENDING for ever was how a missing column went unnoticed.
            console.error(`[scheduler] draining game ${gameId} failed:`, error)
            totals.gameErrors++
            health.gameErrorCount++
            health.lastGameError = {
              gameId,
              message: describeError(error),
              at: clock.now(),
            }
          }
        }
      }
    )

    await Promise.all(workers)

    return totals
  }


  
  /**
   * Reconcile the gameplay block with what is actually running.
   *
   * `execute` keeps this current for runs this process owns. This covers the
   * rest: a nightly on another instance, one already in flight when this
   * process started, and — because it takes the whole set rather than a
   * difference — one that stopped without anything clearing it.
   */
  async function syncMaintenance(): Promise<void> {
    const running = await db.scheduledTaskRun.findMany({
      where: { taskType: "NIGHTLY", status: "RUNNING" },
      select: { id: true, gameId: true, startedAt: true, claimedAt: true },
    })

    syncGameMaintenance(
      running.map((run) => ({
        gameId: run.gameId,
        runId: run.id,
        startedAt: run.startedAt ?? run.claimedAt ?? new Date(0),
      }))
    )

    // The same reconciliation, for the announcement. It catches the transitions
    // `execute` cannot: a worker that died before reaching its `finally`, and a
    // nightly that began on another instance while this one was down. Both
    // directions matter — whichever way it went, what a client is holding is
    // now the wrong answer.
    const current = new Set(running.map((run) => run.gameId))
    for (const gameId of current) {
      if (!seenRunning.has(gameId)) announce(gameId)
    }
    for (const gameId of seenRunning) {
      if (!current.has(gameId)) announce(gameId)
    }
    seenRunning = current
  }

  async function runTick(): Promise<TickSummary> {
    // Every tick, not only at boot. A game created or activated while the
    // server was already running would otherwise have no task rows until
    // somebody happened to restart it — and nothing would say so. Two queries
    // when there is nothing to add.
    await ensureTasks()
    await syncMaintenance()

    const now = clock.now()
    const schedules = await loadGameSchedules()

    if (schedules.size === 0) {
      return { materialized: 0, executed: 0, failed: 0, superseded: 0, deferred: 0, gameErrors: 0 }
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
        return { materialized: 0, executed: 0, failed: 0, superseded: 0, deferred: 0, gameErrors: 0 }
      })
      .finally(() => {
        inFlight = null
      })

    inFlight = started
    return started
  }

  /**
   * How long to wait before the next tick.
   *
   * A fixed one-minute heartbeat is the simplest thing that works and it has a
   * cost that only shows up on a bill: a managed Postgres that charges for the
   * time it is awake never gets to sleep, because something queries it every
   * sixty seconds forever whether or not anyone is playing. On Neon's
   * five-minute idle timeout that is the difference between paying for a few
   * hours a day and paying for all of them.
   *
   * So the tick asks how long it may sleep. The answer is the soonest of:
   *
   *   * the next boundary any task is waiting for — the thing it exists to be
   *     awake for;
   *   * the next lease expiry, so a run abandoned by a dead process is still
   *     reclaimed promptly rather than sitting until the next boundary, which
   *     for a nightly could be a day;
   *   * `MAX_IDLE_SLEEP_MS`, a ceiling so that nothing this query failed to
   *     anticipate — a task row created by another instance, a boundary moved
   *     by an administrator — waits longer than that to be noticed.
   *
   * Outstanding work short-circuits all of it: a PENDING or RETRYING run is
   * picked up by the *next tick*, so while any exists the cadence stays at the
   * normal interval and a retry is a minute away rather than fifteen.
   *
   * Never shorter than `tickIntervalMs`, so this can only ever slow the tick
   * down. Every timing guarantee in the planner is a lower bound.
   */
  async function nextWakeDelay(now: Date): Promise<number> {
    const waiting = await db.scheduledTaskRun.findFirst({
      where: { status: { in: ["PENDING", "RETRYING"] } },
      select: { id: true },
    })
    if (waiting) return tickIntervalMs

    const [nextTask, oldestLease] = await Promise.all([
      db.scheduledTask.findFirst({
        where: { enabled: true },
        orderBy: { nextRunAt: "asc" },
        select: { nextRunAt: true },
      }),
      db.scheduledTaskRun.findFirst({
        where: { status: "RUNNING", leaseUntil: { not: null } },
        orderBy: { leaseUntil: "asc" },
        select: { leaseUntil: true },
      }),
    ])

    const until = [MAX_IDLE_SLEEP_MS]
    if (nextTask) until.push(nextTask.nextRunAt.getTime() - now.getTime())
    if (oldestLease?.leaseUntil) until.push(oldestLease.leaseUntil.getTime() - now.getTime())

    return Math.max(tickIntervalMs, Math.min(...until))
  }

  /** Arm the next tick, and record when it is due. */
  function scheduleNext(delayMs: number): void {
    if (stopping) return

    health.nextWakeAt = new Date(clock.now().getTime() + delayMs)

    timer = setTimeout(() => {
      void (async () => {
        await tick()
        const delay = await nextWakeDelay(clock.now()).catch((error) => {
          // Falling back to the normal cadence rather than stopping: a
          // scheduler that cannot work out when to wake must still wake.
          console.error("[scheduler] could not work out the next wake; using the normal interval:", error)
          return tickIntervalMs
        })
        scheduleNext(delay)
      })()
    }, delayMs)
  }

  function start(): void {
    if (timer) return
    stopping = false

    void (async () => {
      try {
        await ensureTasks()
        health.started = true
        await tick()
      } catch (error) {
        // `started` is left false on purpose. `/health` reports the scheduler
        // as down, so a server that is serving pages while scheduling nothing
        // is something a deployment can actually detect.
        health.lastTickError = describeError(error)
        console.error("[scheduler] start failed:", error)
      }

      const delay = await nextWakeDelay(clock.now()).catch(() => tickIntervalMs)
      scheduleNext(delay)
    })()

    console.log(
      `[scheduler] database backend started as ${instanceId}, ticking every ${tickIntervalMs / 1000}s` +
        ` and sleeping up to ${MAX_IDLE_SLEEP_MS / 60_000}m when there is nothing due`
    )
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
      clearTimeout(timer)
      timer = null
    }
    health.nextWakeAt = null
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
