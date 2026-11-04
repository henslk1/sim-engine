import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createDailyVisitRunner,
  QUIET_MS,
  RETRY_DELAYS_MS,
  type DailyVisitRunner,
  type VisitReason,
} from "../src/lib/daily-visit.ts"

/**
 * When the client asks the server whether a new day has begun.
 *
 * Worth driving directly, because every case that matters is a sequence over
 * time: a tab focused the next morning, a request refused by a nightly that
 * then ends, two triggers landing in the same tick. None of them is reachable
 * by clicking, and all of them end the same way if they are wrong - a player
 * who is signed in, owed an allowance, and has nothing left that will ask.
 *
 * The clock and the timers are handed in, so the tests below move both by hand
 * and never wait for anything.
 */

/** Let every already-resolved promise run its continuations. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type Harness = {
  runner: DailyVisitRunner
  /** One entry per request made. */
  asked: number
  /** Answer the oldest unanswered request. */
  resolve: (value?: unknown) => void
  reject: (error?: unknown) => void
  results: unknown[]
  failures: unknown[]
  /** Move the clock, without firing timers. */
  advance: (ms: number) => void
  /** Fire every timer due at or before the current time. */
  fireTimers: () => void
  pendingTimers: number
}

function harness(): Harness {
  let clock = 1_000_000
  let nextTimerId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const waiting: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = []

  const state = {
    asked: 0,
    results: [] as unknown[],
    failures: [] as unknown[],
  }

  const runner = createDailyVisitRunner<unknown>({
    visit: () => {
      state.asked += 1
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }))
    },
    onResult: (result) => state.results.push(result),
    onFailure: (error) => state.failures.push(error),
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextTimerId++
      timers.set(id, { at: clock + ms, fn })
      return id
    },
    clearTimer: (handle) => {
      timers.delete(handle as number)
    },
  })

  return {
    runner,
    get asked() {
      return state.asked
    },
    get results() {
      return state.results
    },
    get failures() {
      return state.failures
    },
    get pendingTimers() {
      return timers.size
    },
    resolve: (value = { claimed: false }) => {
      const next = waiting.shift()
      assert.ok(next, "nothing was waiting for an answer")
      next.resolve(value)
    },
    reject: (error = new Error("GAME_UPDATE_IN_PROGRESS")) => {
      const next = waiting.shift()
      assert.ok(next, "nothing was waiting for an answer")
      next.reject(error)
    },
    advance: (ms) => {
      clock += ms
    },
    fireTimers: () => {
      for (const [id, timer] of [...timers]) {
        if (timer.at > clock) continue
        timers.delete(id)
        timer.fn()
      }
    },
  }
}

/** Open the game and let the first request be answered. */
async function opened(h: Harness, answer: unknown = { claimed: false }) {
  h.runner.trigger("opened")
  h.resolve(answer)
  await flush()
}

// --------------------------------------------------------------------------
// Asking at all.
// --------------------------------------------------------------------------

test("opening the game asks once", async () => {
  const h = harness()
  h.runner.trigger("opened")
  assert.equal(h.asked, 1)

  h.resolve({ claimed: true, granted: { currencies: [], items: [] } })
  await flush()
  assert.deepEqual(h.results, [{ claimed: true, granted: { currencies: [], items: [] } }])
})

test("two triggers in the same tick make one request", async () => {
  const h = harness()
  h.runner.trigger("opened")
  h.runner.trigger("focused")
  h.runner.trigger("navigated")

  assert.equal(h.asked, 1, "a request already in the air covers an ordinary trigger")
  h.resolve()
  await flush()
  assert.equal(h.asked, 1)
})

// --------------------------------------------------------------------------
// The three gaps this exists to close.
// --------------------------------------------------------------------------

test("a tab left open overnight asks again when it is focused", async () => {
  const h = harness()
  await opened(h)

  h.advance(14 * 60 * 60 * 1000)
  h.runner.trigger("focused")

  assert.equal(h.asked, 2, "the day changed while nobody was looking")
})

test("walking back from the nightly's waiting page asks again", async () => {
  const h = harness()
  await opened(h)

  // The player sat on /new-day while the update ran.
  h.advance(5 * 60 * 1000)
  h.runner.trigger("navigated")

  assert.equal(h.asked, 2)
})

test("a nightly ending asks at once, however recently we asked", async () => {
  const h = harness()
  await opened(h)

  // One second later - well inside the quiet window, which an ordinary trigger
  // would be dropped by.
  h.advance(1_000)
  h.runner.trigger("navigated")
  assert.equal(h.asked, 1, "ordinary triggers wait")

  h.runner.trigger("update-finished")
  assert.equal(h.asked, 2, "this one does not")
})

test("a nightly ending during a request is not lost", async () => {
  const h = harness()
  h.runner.trigger("opened")
  assert.equal(h.asked, 1)

  // That request is about to be refused by the update that is now ending.
  h.runner.trigger("update-finished")
  h.reject()
  await flush()

  assert.equal(h.asked, 2, "the refused request is followed by one that can succeed")
})

test("only one follow-up is queued, however many arrive mid-request", async () => {
  const h = harness()
  h.runner.trigger("opened")

  h.runner.trigger("update-finished")
  h.runner.trigger("update-finished")
  h.runner.trigger("focused")
  h.resolve()
  await flush()

  assert.equal(h.asked, 2)
})

// --------------------------------------------------------------------------
// Not becoming a poll.
// --------------------------------------------------------------------------

test("wandering around the game does not ask on every page", async () => {
  const h = harness()
  await opened(h)

  for (let i = 0; i < 9; i++) {
    h.advance(5_000)
    h.runner.trigger("navigated")
  }

  assert.equal(h.asked, 1, "nine navigations inside the quiet window are one visit")
})

test("and asks again once the quiet window has passed", async () => {
  const h = harness()
  await opened(h)

  h.advance(QUIET_MS - 1)
  h.runner.trigger("navigated")
  assert.equal(h.asked, 1)

  h.advance(2)
  h.runner.trigger("navigated")
  assert.equal(h.asked, 2)
})

test("nothing is scheduled while everything is working", async () => {
  const h = harness()
  await opened(h)
  assert.equal(h.pendingTimers, 0, "a timer here would be a poll")
})

// --------------------------------------------------------------------------
// Failing, and giving up at some point.
// --------------------------------------------------------------------------

test("a refused request is retried, on a widening delay, until it is answered", async () => {
  const h = harness()
  h.runner.trigger("opened")
  h.reject()
  await flush()

  assert.equal(h.asked, 1, "the retry is scheduled, not immediate")
  assert.equal(h.pendingTimers, 1)

  // Too early.
  h.advance(RETRY_DELAYS_MS[0]! - 1)
  h.fireTimers()
  assert.equal(h.asked, 1)

  h.advance(1)
  h.fireTimers()
  assert.equal(h.asked, 2)

  // And the retry is a real visit: its answer arrives, and the retrying stops.
  h.resolve({ claimed: true, granted: { currencies: [], items: [] } })
  await flush()
  assert.equal(h.results.length, 1)
  assert.equal(h.pendingTimers, 0)
})

test("the retries are bounded, and then it stops", async () => {
  const h = harness()
  h.runner.trigger("opened")

  for (const delay of RETRY_DELAYS_MS) {
    h.reject()
    await flush()
    h.advance(delay)
    h.fireTimers()
  }
  // The last retry is in the air; refuse that one too.
  assert.equal(h.asked, RETRY_DELAYS_MS.length + 1)
  h.reject()
  await flush()

  assert.equal(h.pendingTimers, 0, "a client that retried for ever would be the poll this avoids")
  assert.equal(h.failures.length, RETRY_DELAYS_MS.length + 1)
})

test("a later trigger starts a fresh budget", async () => {
  const h = harness()
  h.runner.trigger("opened")
  for (const delay of RETRY_DELAYS_MS) {
    h.reject()
    await flush()
    h.advance(delay)
    h.fireTimers()
  }
  h.reject()
  await flush()
  const spent = h.asked

  // An hour later the player comes back to the tab.
  h.advance(60 * 60 * 1000)
  h.runner.trigger("focused")
  assert.equal(h.asked, spent + 1)

  h.reject()
  await flush()
  assert.equal(h.pendingTimers, 1, "and it may retry again")
})

test("an insistent trigger supersedes a pending retry rather than racing it", async () => {
  const h = harness()
  h.runner.trigger("opened")
  h.reject()
  await flush()
  assert.equal(h.pendingTimers, 1)

  h.runner.trigger("update-finished")
  assert.equal(h.asked, 2)
  assert.equal(h.pendingTimers, 0, "the scheduled retry was cancelled, not left to fire as well")
})

// --------------------------------------------------------------------------
// Going away.
// --------------------------------------------------------------------------

test("a stopped runner asks nothing and fires nothing", async () => {
  const h = harness()
  h.runner.trigger("opened")
  h.reject()
  await flush()
  assert.equal(h.pendingTimers, 1)

  h.runner.stop()
  assert.equal(h.pendingTimers, 0)

  for (const reason of ["opened", "focused", "navigated", "update-finished"] as VisitReason[]) {
    h.runner.trigger(reason)
  }
  assert.equal(h.asked, 1, "nothing after stop")
})

test("an answer arriving after stop is not acted on", async () => {
  const h = harness()
  h.runner.trigger("opened")
  h.runner.stop()

  h.resolve({ claimed: true, granted: { currencies: [], items: [] } })
  await flush()

  assert.deepEqual(h.results, [], "the component is gone; showing it a banner would be a leak")
})
