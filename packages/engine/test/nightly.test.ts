import { test } from "node:test"
import assert from "node:assert/strict"

// The population summary a nightly writes afterwards. Takes its rows as
// arguments; no database.
//
// This file used to also cover `selectAnimalsForAging`, which matched living
// animals against `AnimalDailyLog` rows in Node. That function is gone: which
// animals are due is now a single indexed join in `selectEligibleAnimals`,
// against markers written by `markAnimalActive`. The bug those tests pinned —
// a `distinct` with no `orderBy` keeping an arbitrary log row per animal and
// silently skipping animals that had been cared for — cannot recur, because
// there is no longer a per-animal set of rows to pick the wrong one from.
const { summariseInnateTotals } = await import("../src/animal/nightly.ts")

test("no living animals means no summary to write", () => {
  assert.equal(summariseInnateTotals([]), null)
})

test("the summary is the highest and the mean", () => {
  assert.deepEqual(summariseInnateTotals([10, 20, 60]), { max: 60, average: 30 })
})

test("a large population does not blow the argument limit", () => {
  // `Math.max(...totals)` spreads the array into argument positions and throws
  // RangeError somewhere past 100,000 — a crash that would arrive on one
  // particular night, at a population the game had been heading towards for
  // months, and take the whole nightly with it.
  const totals = Array.from({ length: 200_000 }, (_, i) => i)
  assert.deepEqual(summariseInnateTotals(totals), {
    max: 199_999,
    average: (199_999 * 200_000) / 2 / 200_000,
  })
})
