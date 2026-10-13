import { test } from "node:test"
import assert from "node:assert/strict"
import { runConformationInspection } from "../src/animal/conformation.ts"

// Exercise the persisted inspection result, not a second copy of the formula.
async function inspect(coatWeight: number, coat: string, disqualified = false) {
  const scores: Record<string, unknown>[] = []
  const sections: Record<string, unknown>[] = []
  const animal = {
    gameId: "game", breedId: "breed", status: "ALIVE", ageInCycles: 20,
    lifeStage: { canCompete: true, name: "Adult" },
    breedComposition: [{ breedId: "breed" }], conformationScores: [],
    phenotypeDescription: coat,
    genotypes: [
      { locusId: "head", alleleOneId: "a", alleleTwoId: "a", phenotypeCode: null },
      { locusId: "legs", alleleOneId: "b", alleleTwoId: "b", phenotypeCode: null },
      { locusId: "coat", alleleOneId: "c", alleleTwoId: "c", phenotypeCode: "splash_minimal" },
    ],
  }
  const tx = {
    animal: { findUniqueOrThrow: async () => animal },
    conformationSection: { findMany: async () => [
      { id: "structure", entries: [{ locusId: "head" }, { locusId: "legs" }] },
    ] },
    breedConformationStandard: { findMany: async () => [
      { locusId: "head", idealExpressionLabel: "Ideal", weight: 1 },
      { locusId: "legs", idealExpressionLabel: "Ideal", weight: 1 },
    ] },
    breed: { findUnique: async () => ({
      coatWeight, coatSelections: [{ expression: "black_base", colorRole: "BASE" }],
      coatDqSelections: disqualified ? [{ expression: "splash_minimal" }] : [],
      dqTraits: disqualified ? [{ locusId: "legs", expression: "Other" }] : [],
    }) },
    expressionRule: { findMany: async () => [
      { locusId: "head", alleleOneId: "a", alleleTwoId: "a", phenotype: "Ideal" },
      { locusId: "legs", alleleOneId: "b", alleleTwoId: "b", phenotype: "Other" },
    ] },
    animalCycleActivity: { upsert: async () => ({}) },
    animalConformationScore: { create: async ({ data }: { data: Record<string, unknown> }) => { scores.push(data) } },
    animalConformationSectionScore: { create: async ({ data }: { data: Record<string, unknown> }) => { sections.push(data) } },
  }
  const client = { $transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx) }
  await runConformationInspection(client as unknown as Parameters<typeof runConformationInspection>[0], "horse")
  assert.equal(scores.length, 1)
  assert.deepEqual(sections, [{ animalId: "horse", breedId: "breed", sectionId: "structure", score: 50 }])
  return scores[0]!
}

test("accepted coat contributes its configured weight to the saved overall score", async () => {
  assert.equal((await inspect(2, "Black")).score, 75)
})

test("unaccepted coat contributes weight without earning points", async () => {
  assert.equal((await inspect(2, "Chestnut")).score, 25)
})

test("zero coat weight leaves the structural total unchanged", async () => {
  assert.equal((await inspect(0, "Black")).score, 50)
})

test("coat and trait disqualification remain separate from the weighted score", async () => {
  const score = await inspect(2, "Black", true)
  assert.equal(score.score, 75)
  assert.equal(score.isCoatDq, true)
  assert.equal(score.isTraitDq, true)
})
