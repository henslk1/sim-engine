import { test } from "node:test"
import assert from "node:assert/strict"

// The sliding window on its own. No database, no actor — `now` is passed in, so
// these are about the counting rule rather than about the clock.
const { createSlidingWindow, retryWording } = await import("../src/messaging/rate-limit.ts")

test("the limit is reached, not exceeded", () => {
  const window = createSlidingWindow(3, 1000)
  assert.equal(window.check("a", 0).ok, true)
  assert.equal(window.check("a", 10).ok, true)
  assert.equal(window.check("a", 20).ok, true)
  assert.equal(window.check("a", 30).ok, false)
})

test("the window slides rather than resetting on a boundary", () => {
  // The reason this is not a fixed window. With buckets, three at 900ms and
  // three at 1100ms would both be allowed — six inside 200ms, twice the
  // intended rate at exactly the moment it matters.
  const window = createSlidingWindow(3, 1000)
  window.check("a", 900)
  window.check("a", 910)
  window.check("a", 920)
  assert.equal(window.check("a", 1100).ok, false)

  // Only once the first three have aged out does a fourth land.
  assert.equal(window.check("a", 1921).ok, true)
})

test("a refused attempt does not push the window forward", () => {
  // A client retrying in a tight loop would otherwise never be let back in:
  // every rejected try would become the newest hit and keep the window full.
  const window = createSlidingWindow(2, 1000)
  window.check("a", 0)
  window.check("a", 1)
  for (let t = 2; t < 900; t += 50) assert.equal(window.check("a", t).ok, false)

  // The two real hits aged out on schedule, unaffected by the hammering.
  assert.equal(window.check("a", 1001).ok, true)
})

test("the refusal says how long is left, and it shrinks as time passes", () => {
  const window = createSlidingWindow(1, 1000)
  window.check("a", 0)

  const early = window.check("a", 100)
  const late = window.check("a", 900)
  assert.equal(early.ok, false)
  assert.equal(late.ok, false)
  if (early.ok || late.ok) return
  assert.equal(early.retryAfterMs, 900)
  assert.equal(late.retryAfterMs, 100)
})

test("one player's flood does not spend another player's allowance", () => {
  const window = createSlidingWindow(2, 1000)
  window.check("noisy", 0)
  window.check("noisy", 1)
  assert.equal(window.check("noisy", 2).ok, false)
  assert.equal(window.check("quiet", 2).ok, true)
})

test("the countdown rounds up, because zero seconds is not a wait", () => {
  assert.equal(retryWording(1), "Try again in 1 second.")
  assert.equal(retryWording(1200), "Try again in 2 seconds.")
  assert.equal(retryWording(59_000), "Try again in 59 seconds.")
  assert.equal(retryWording(61_000), "Try again in 2 minutes.")
})
