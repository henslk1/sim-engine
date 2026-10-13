import { test } from "node:test"
import assert from "node:assert/strict"
import { initialImmunity, sampleBreedPersonality, isValidPersonalityRange } from "../src/animal/creationValues.ts"

test("personality draws stay bounded and cluster around an off-center baseline", () => {
  const profile = { naturalMin: 0, naturalMax: 100, baseline: 80 }
  const bins = Array<number>(10).fill(0)
  let total = 0
  for (let i = 0; i < 10000; i++) {
    const value = sampleBreedPersonality(profile, () => (i + 0.5) / 10000)
    assert.ok(value >= 0 && value <= 100)
    bins[Math.min(9, Math.floor(value / 10))]!++
    total += value
  }
  // A uniform distribution would have mean 50 and equally sized bins.
  assert.ok(Math.abs(total / 10000 - 60) < 0.01)
  assert.equal(bins.indexOf(Math.max(...bins)), 7)
  assert.ok(bins[7]! > bins[4]!)
})

test("fixed ranges and baselines at either endpoint are valid", () => {
  assert.equal(sampleBreedPersonality({ naturalMin: 42, naturalMax: 42, baseline: 42 }, () => { throw new Error("unnecessary random draw") }), 42)
  assert.equal(sampleBreedPersonality({ naturalMin: 0, naturalMax: 100, baseline: 0 }, () => 0), 0)
  assert.equal(sampleBreedPersonality({ naturalMin: 0, naturalMax: 100, baseline: 100 }, () => 1), 100)
})

test("invalid personality ranges fail instead of silently ignoring the baseline", () => {
  for (const profile of [
    { naturalMin: 70, naturalMax: 50, baseline: 60 },
    { naturalMin: 20, naturalMax: 80, baseline: 90 },
    { naturalMin: 20, naturalMax: 80, baseline: 10 },
    { naturalMin: 0, naturalMax: 100, baseline: NaN },
  ]) {
    assert.equal(isValidPersonalityRange(profile), false)
    assert.throws(() => sampleBreedPersonality(profile), /baseline/)
  }
})

test("creation immunity prefers breed, then game, then the legacy default", () => {
  assert.deepEqual(initialImmunity(20, 80, 90, () => 0.5), { innateMax: 80, value: 50 })
  assert.deepEqual(initialImmunity(20, null, 90, () => 0.5), { innateMax: 90, value: 55 })
  assert.deepEqual(initialImmunity(null, null, null, () => 0.5), { innateMax: 100, value: 80 })
  assert.deepEqual(initialImmunity(null, null, 40, () => 0.5), { innateMax: 40, value: 40 })
  assert.deepEqual(initialImmunity(null, 0, 90), { innateMax: 0, value: 0 })
  assert.throws(() => initialImmunity(70, null, 50), /minimum/)
})

// Stub the database before importing creation paths. No test touches live rows.
let rows: Record<string, Record<string, unknown>[]> = {}
const rule = {
  locusId: "coat", alleleOneId: "black", alleleTwoId: "black", phenotype: "black_base",
  numericModifier: 0.1, ruleConditions: [], climateModifiers: [], terrainModifiers: [],
}
const profile = { traitDefId: "confidence", naturalMin: 0, naturalMax: 100, baseline: 80 }
const pick = (row: Record<string, unknown>, select?: Record<string, boolean>) => select
  ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, row[k]])) : row
const fake: Record<string, any> = {
  expressionRule: {
    findMany: async ({ select }: any) => [pick(rule, select)],
    findUnique: async () => rule,
  },
  breed: { findUnique: async () => ({ name: "Breed" }) },
  gameShopBreedConfig: { findMany: async () => [{
    id: "stock", breedId: "breed", targetStock: 1, _count: { shopAnimals: 0 },
    breed: { name: "Breed", immunityMin: 20, immunityMax: null, lifeExpectancyBaseline: 100, statProfile: [], personalityProfiles: [profile] },
  }] },
  lifeStageDef: { findFirst: async () => ({ id: "adult", minCycle: 20 }) },
  playerAccount: { findFirst: async () => ({ id: "owner" }) },
  longTermCareActionDef: { findMany: async () => [] },
  gameConfig: { findUnique: async ({ select }: any) => pick({ immunityMax: 90, defaultInnateRatio: 0.5, lifeExpectancyBaseline: 100 }, select) },
  gameInnateMax: { findFirst: async () => null },
  breedAlleleFrequency: { findMany: async () => [{ frequency: 1, allele: { id: "black", symbol: "E", locusId: "coat" } }] },
  locus: { findMany: async () => [] },
}
for (const table of ["animal", "animalEnergy", "animalMood", "animalCondition", "animalImmunity", "animalCareScore", "animalBreedComposition", "animalStat", "animalPersonality", "animalGenotype", "gameShopAnimal"]) {
  fake[table] = { create: async ({ data }: any) => {
    (rows[table] ??= []).push(data)
    return { id: "horse" }
  } }
}
fake.$transaction = async (fn: (tx: typeof fake) => Promise<unknown>) => fn(fake)
;(globalThis as any).prisma = fake
const { generateFromTemplate } = await import("../src/animal/generateFromTemplate.ts")
const { restockShop } = await import("../src/shop/restock.ts")

function options(): Parameters<typeof generateFromTemplate>[1] {
  return {
    template: {
      breedId: "breed", breedName: null, sex: "FEMALE", name: null, fertility: 1, startingAgeInCycles: 20,
      statMode: "EXACT", statFloor: null, personalityMode: "RANDOM", personalityMin: null, personalityMax: null,
      stats: [], compTiers: [], genotype: [],
    },
    gameId: "game", ownerPlayerAccountId: "owner", isTutorialAnimal: false, breederId: null,
    byLocus: new Map([["coat", [{ id: "black", symbol: "E", frequency: 1 }]]]),
    breedWeights: [], defaultInnateRatio: 0.5, gameInnateMax: null, breedPersonalityProfiles: [profile],
    immunityMin: 20, immunityMax: null, gameConfigImmunityMax: 90,
    lifeExpectancyBaseline: 100, gameConfigLifeExpectancyBaseline: null,
    ltcDefs: [], lifeStages: [{ id: "adult", minCycle: 20, stageIndex: 3 }], compTierLookup: new Map(),
  }
}

function verifyCreation() {
  assert.equal(rows.animal?.[0]?.phenotypeDescription, "Black")
  assert.equal(rows.animalGenotype?.[0]?.phenotypeCode, "black_base")
  assert.equal(rows.animal?.[0]?.lifeExpectancy, 110)
  assert.deepEqual(rows.animalImmunity, [{ animalId: "horse", innateMax: 90, value: 55 }])
  assert.ok(Math.abs(Number(rows.animalPersonality?.[0]?.value) - 63.2455532) < 0.00001)
}

test("template generation persists coat codes, baseline sampling and game immunity fallback", async t => {
  rows = {}
  t.mock.method(Math, "random", () => 0.5)
  await generateFromTemplate(fake as any, options())
  verifyCreation()
})

test("shop generation persists the same derived values without another phenotype query", async t => {
  rows = {}
  t.mock.method(Math, "random", () => 0.5)
  const query = t.mock.method(fake.expressionRule, "findMany")
  assert.equal(await restockShop("game"), 1)
  verifyCreation()
  assert.equal(query.mock.callCount(), 1)
})

test("explicit template personality values and ranges override breed sampling", async t => {
  t.mock.method(Math, "random", () => 0.5)
  const opts = options()
  opts.template.personalityMode = "RANGE"
  opts.template.personalityMin = 20
  opts.template.personalityMax = 30
  opts.template.personalityValues = [{ traitDefId: "confidence", value: 97 }]
  rows = {}
  await generateFromTemplate(fake as any, opts)
  assert.equal(rows.animalPersonality?.[0]?.value, 97)
  opts.template.personalityValues = []
  rows = {}
  await generateFromTemplate(fake as any, opts)
  assert.equal(rows.animalPersonality?.[0]?.value, 25)
})
