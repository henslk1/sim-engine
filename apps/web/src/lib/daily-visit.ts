/**
 * When to tell the server the player is here.
 *
 * `player.visit` claims the game day and pays the allowance, and the server
 * decides whether any given call is the first of a new day - a conditional
 * UPDATE that the second caller loses. So the client's only job is to ask at
 * the moments a new day could have begun, and not to ask continuously.
 *
 * Asking once per page load is not enough, and all three failures are ordinary:
 *
 *   - A player signed in across the nightly. The layout never unmounts, so the
 *     new day arrives and nothing asks about it.
 *   - A first request that failed. During the nightly every gameplay write is
 *     refused, and the refusal is the likeliest first answer of all - the
 *     player was sent to the waiting page by the same update.
 *   - A tab left open overnight. It is focused the next morning into yesterday.
 *
 * So the triggers are events rather than a poll: opened, focused, navigated,
 * and the update finishing. What keeps that from becoming a poll by accident is
 * the quiet window - a trigger nothing insisted on is dropped if the last
 * attempt was recent, so wandering around the stable for a minute sends one
 * request and not nine.
 *
 * Two reasons insist, and skip the window: opening the game, and a nightly
 * ending. Both are moments at which the day genuinely may have changed.
 *
 * Nothing here protects against double payment. That is the server's conditional
 * UPDATE, and it has to be, because two tabs are two of these.
 */

export type VisitReason = "opened" | "focused" | "navigated" | "update-finished"

/** Reasons that will not wait for the quiet window. */
const INSISTENT: ReadonlySet<VisitReason> = new Set<VisitReason>(["opened", "update-finished"])

/** The shortest gap between two attempts that nothing insisted on. */
export const QUIET_MS = 60_000

/**
 * How long to wait before each retry, and - by its length - how many there are.
 *
 * Bounded on purpose. The common failure is the nightly refusing every write,
 * which can last minutes, and a client that kept retrying through it would be
 * the poll this design is avoiding. Three attempts cover a blip; the nightly
 * ending is an insistent trigger and covers the rest.
 */
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 30_000]

export type TimerHandle = unknown

export type DailyVisitOptions<T> = {
  /** One request. Resolving means answered, rejecting means try again. */
  visit: () => Promise<T>
  onResult: (result: T) => void
  /** `attemptsLeft` is how many retries remain in this budget. */
  onFailure?: (error: unknown, attemptsLeft: number) => void
  /** Injected so tests can drive the clock and the timers by hand. */
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
}

export type DailyVisitRunner = {
  /** Ask, unless we asked recently and this reason does not insist. */
  trigger(reason: VisitReason): void
  /** The component is going away: cancel everything and ignore further triggers. */
  stop(): void
}

export function createDailyVisitRunner<T>(options: DailyVisitOptions<T>): DailyVisitRunner {
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never))

  let inFlight = false
  let stopped = false
  let lastAttemptAt = Number.NEGATIVE_INFINITY
  let retriesUsed = 0
  let retryHandle: TimerHandle | null = null

  /** A trigger that arrived mid-request and insisted, so it gets one follow-up. */
  let queued: VisitReason | null = null

  function cancelRetry() {
    if (retryHandle === null) return
    clearTimer(retryHandle)
    retryHandle = null
  }

  function run() {
    cancelRetry()
    inFlight = true
    lastAttemptAt = now()

    options
      .visit()
      .then(
        (result) => {
          if (!stopped) options.onResult(result)
        },
        (error) => {
          const attemptsLeft = RETRY_DELAYS_MS.length - retriesUsed
          if (!stopped) options.onFailure?.(error, attemptsLeft)
          if (stopped || attemptsLeft <= 0) return

          const delay = RETRY_DELAYS_MS[retriesUsed]!
          retriesUsed += 1
          retryHandle = setTimer(() => {
            retryHandle = null
            // Straight to `run`, not through `trigger`: a retry is the previous
            // attempt finishing, not a new reason to ask, so the quiet window
            // does not apply to it.
            if (!stopped) run()
          }, delay)
        }
      )
      .finally(() => {
        inFlight = false
        const follow = queued
        queued = null
        if (follow !== null && !stopped) trigger(follow)
      })
  }

  function trigger(reason: VisitReason) {
    if (stopped) return

    if (inFlight) {
      // One follow-up at most, and only for something that insisted - an
      // in-flight request already covers an ordinary trigger. The nightly
      // ending while a request is in the air is the case this exists for: that
      // request is about to be refused by the update that has just ended.
      if (INSISTENT.has(reason)) queued = reason
      return
    }

    if (!INSISTENT.has(reason) && now() - lastAttemptAt < QUIET_MS) return

    // A fresh reason to ask restores the retry budget, so a tab that gave up an
    // hour ago tries again when it is focused. This is the only place the
    // budget is restored: every attempt that is not itself a retry arrives
    // here, so the success path has nothing to say about it.
    retriesUsed = 0
    run()
  }

  return {
    trigger,
    stop() {
      stopped = true
      queued = null
      cancelRetry()
    },
  }
}
