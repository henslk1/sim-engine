import { test } from "node:test"
import assert from "node:assert/strict"
import { readStablePreferences, stableFiltersSchema, stableSortSchema } from "../src/stable-preferences.ts"
import { pedigreeLayout, pedigreeRow } from "../../../apps/web/src/lib/pedigree-layout.ts"

test("missing, legacy and invalid paddock preferences have usable defaults", () => {
  assert.deepEqual(readStablePreferences(), readStablePreferences({ sortDefault: "bogus", filterConfig: null }))
  const saved = readStablePreferences({ sortDefault: "oldest", filterConfig: { pregnant: true } })
  assert.equal(saved.sortDefault, "oldest")
  assert.equal(saved.filterConfig.pregnant, true)
  assert.equal(saved.filterConfig.careDue, false)
  assert.equal(stableSortSchema.safeParse("DROP TABLE").success, false)
  assert.equal(stableFiltersSchema.safeParse({ pregnant: "yes" }).success, false)
  assert.equal(stableFiltersSchema.safeParse({ extra: true }).success, false)
})
test("pedigree defaults to three generations and deeper columns fit the row grid", () => {
  assert.equal(pedigreeLayout(undefined).depth, 3)
  for (const depth of [1, 3, 4, 6]) {
    const layout = pedigreeLayout(depth)
    assert.equal(layout.columns.length, depth)
    for (const column of layout.columns) {
      let next = 1
      for (const position of column) {
        const row = pedigreeRow(position, layout.rows)
        assert.equal(row.start, next)
        next += row.span
      }
      assert.equal(next, layout.rows + 1)
    }
  }
  assert.equal(pedigreeLayout(100).depth, 6)
})
