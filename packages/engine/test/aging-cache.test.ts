import { test } from "node:test"
import assert from "node:assert/strict"

// The in-memory halves of the aging cache. `loadGameAgingCache` needs a client
// and is not covered here; these are the lookups that replaced per-animal
// queries, and the behaviour they have to keep.
const { genotypeKey, indexHealthRecords } = await import("../src/animal/aging-cache.ts")

const record = (conditionDefId: string, isActive: boolean, resolvedCycle: number | null = null) =>
  ({ conditionDefId, isActive, resolvedCycle })

test("the genotype key is the unique tuple the lookup replaced", () => {
  // ExpressionRule @@unique([locusId, alleleOneId, alleleTwoId]) — the same
  // three fields the per-genotype findUnique used, in the same order.
  assert.equal(
    genotypeKey({ locusId: "locus", alleleOneId: "one", alleleTwoId: "two" }),
    "locus:one:two"
  )
})

test("an allele pair is not interchangeable with its reverse", () => {
  // Allele ordering is canonical in this schema, so a reversed pair is a
  // different rule and must not collide with its sibling.
  assert.notEqual(
    genotypeKey({ locusId: "l", alleleOneId: "a", alleleTwoId: "b" }),
    genotypeKey({ locusId: "l", alleleOneId: "b", alleleTwoId: "a" })
  )
})

test("an active record answers both questions", () => {
  const index = indexHealthRecords([record("colic", true)])
  assert.equal(index.hasActive("colic"), true)
  assert.equal(index.hasAny("colic"), true)
})

test("a resolved record is history, not a current condition", () => {
  // The distinction an episodic condition turns on: it may recur, so only an
  // active record blocks it, while a one-time condition is blocked by any.
  const index = indexHealthRecords([record("colic", false, 12)])
  assert.equal(index.hasActive("colic"), false)
  assert.equal(index.hasAny("colic"), true)
})

test("a condition never recorded is unknown to all three", () => {
  const index = indexHealthRecords([])
  assert.equal(index.hasActive("colic"), false)
  assert.equal(index.hasAny("colic"), false)
  assert.equal(index.lastResolvedCycle("colic"), null)
})

test("the most recent resolution is the one the cooldown measures from", () => {
  const index = indexHealthRecords([
    record("colic", false, 4),
    record("colic", false, 19),
    record("colic", false, 11),
  ])
  assert.equal(index.lastResolvedCycle("colic"), 19)
})

test("a resolution with no cycle recorded wins, and waives the cooldown", () => {
  // Preserved quirk, not an accident. The query this replaced ordered by
  // `resolvedCycle` descending and took one row; Postgres sorts DESC with
  // NULLS FIRST, so a record with no resolved cycle was the row returned, and
  // being null it let the flare-up through. How often chronic conditions recur
  // is a balance decision, so changing it belongs with that decision.
  const index = indexHealthRecords([
    record("colic", false, 19),
    record("colic", false, null),
  ])
  assert.equal(index.lastResolvedCycle("colic"), null)
})

test("an active record does not count as a resolution", () => {
  const index = indexHealthRecords([record("colic", true), record("colic", false, 7)])
  assert.equal(index.lastResolvedCycle("colic"), 7)
})

test("a condition created this cycle is visible to the checks that follow", () => {
  // The queries this replaced ran fresh inside the loop, so an illness rolled
  // at the top of the cycle was already there when the genetic-onset checks
  // ran below it. Without this the same animal could be given one condition
  // twice in a night — once by the illness roll and once by a genotype.
  const index = indexHealthRecords([])
  assert.equal(index.hasActive("colic"), false)
  index.markActive("colic")
  assert.equal(index.hasActive("colic"), true)
  assert.equal(index.hasAny("colic"), true)
})

test("two genotypes pointing at one condition cannot both create it", () => {
  const index = indexHealthRecords([])
  const created: string[] = []
  for (const condition of ["hoofwall", "hoofwall"]) {
    if (index.hasAny(condition)) continue
    created.push(condition)
    index.markActive(condition)
  }
  assert.deepEqual(created, ["hoofwall"])
})
