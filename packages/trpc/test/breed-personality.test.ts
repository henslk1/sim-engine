import { test } from "node:test"
import assert from "node:assert/strict"
import type { z } from "zod"
import { breedAdminRouter } from "../src/routers/admin.breed.ts"

// Exercise the actual input schemas for both write paths, without touching the database.
const single = breedAdminRouter._def.procedures.savePersonalityProfile._def.inputs[0] as z.ZodType
const batch = breedAdminRouter._def.procedures.saveAllPersonalityProfiles._def.inputs[0] as z.ZodType

test("both personality save paths reject a baseline outside its breed range", () => {
  for (const range of [
    { naturalMin: 20, naturalMax: 80, baseline: 10 },
    { naturalMin: 20, naturalMax: 80, baseline: 90 },
    { naturalMin: 80, naturalMax: 20, baseline: 50 },
  ]) {
    const profile = { traitDefId: "confidence", ...range }
    assert.equal(single.safeParse({ breedId: "breed", ...profile }).success, false)
    assert.equal(single.safeParse({ id: "existing", breedId: "breed", ...profile }).success, false)
    assert.equal(batch.safeParse({ breedId: "breed", profiles: [profile] }).success, false)
  }
})

test("fixed personality ranges and endpoint baselines can be saved", () => {
  for (const baseline of [20, 50, 80]) {
    const profile = { traitDefId: "confidence", naturalMin: 20, naturalMax: 80, baseline }
    assert.equal(single.safeParse({ breedId: "breed", ...profile }).success, true)
    assert.equal(batch.safeParse({ breedId: "breed", profiles: [profile] }).success, true)
  }
  const profile = { traitDefId: "confidence", naturalMin: 42, naturalMax: 42, baseline: 42 }
  assert.equal(single.safeParse({ breedId: "breed", ...profile }).success, true)
  assert.equal(batch.safeParse({ breedId: "breed", profiles: [profile] }).success, true)
})
