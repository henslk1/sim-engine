import { test } from "node:test"
import assert from "node:assert/strict"

// Which animals a nightly picks up, and the population summary it writes
// afterwards. No database: both take their rows as arguments.
const { selectAnimalsForAging, summariseInnateTotals } = await import("../src/animal/nightly.ts")

const animal = (id: string, ageInCycles: number) => ({ id, ageInCycles })

test("an animal interacted with during its current cycle is aged", () => {
  const picked = selectAnimalsForAging(
    [animal("a", 6)],
    [{ animalId: "a", cycleNumber: 6 }]
  )
  assert.deepEqual(picked.map(a => a.id), ["a"])
})

test("an animal whose only interaction was a previous cycle is left alone", () => {
  const picked = selectAnimalsForAging(
    [animal("a", 6)],
    [{ animalId: "a", cycleNumber: 5 }]
  )
  assert.deepEqual(picked, [])
})

test("an animal nobody touched is left alone", () => {
  assert.deepEqual(selectAnimalsForAging([animal("a", 6)], []), [])
})

test("a stale log alongside a current one does not hide the current one", () => {
  // The regression this function exists for. The query it replaced asked for
  // `distinct: ["animalId"]` with no `orderBy`, so it kept one arbitrary row
  // per animal and compared that single row against the animal's age. An
  // animal with yesterday's log and today's log could have yesterday's kept —
  // and was then skipped for the night despite having been cared for.
  const picked = selectAnimalsForAging(
    [animal("a", 6)],
    [
      { animalId: "a", cycleNumber: 5 },
      { animalId: "a", cycleNumber: 6 },
    ]
  )
  assert.deepEqual(picked.map(a => a.id), ["a"])
})

test("cycles are matched per animal, not against a shared world cycle", () => {
  // There is no global cycle: `cycleNumber` is the age that animal was at the
  // time. Two animals at different ages are each judged against their own.
  const picked = selectAnimalsForAging(
    [animal("young", 2), animal("old", 40)],
    [
      { animalId: "young", cycleNumber: 40 },
      { animalId: "old", cycleNumber: 40 },
    ]
  )
  assert.deepEqual(picked.map(a => a.id), ["old"])
})

test("a log for an animal not in the candidate set is ignored", () => {
  assert.deepEqual(
    selectAnimalsForAging([animal("a", 6)], [{ animalId: "ghost", cycleNumber: 6 }]),
    []
  )
})

test("the candidate objects come back whole", () => {
  // The worker reads lifeStageId off the result afterwards to count stage
  // transitions, so this returns the rows it was given rather than ids.
  const candidates = [{ id: "a", ageInCycles: 6, lifeStageId: "foal" }]
  const picked = selectAnimalsForAging(candidates, [{ animalId: "a", cycleNumber: 6 }])
  assert.deepEqual(picked, candidates)
})

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
