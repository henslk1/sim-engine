import { test } from "node:test"
import assert from "node:assert/strict"
import { applyCareAction } from "../src/care/apply.ts"
import { applyTrainingAction } from "../src/training/apply.ts"
import { enterCompetition } from "../src/competition/enter.ts"
import { requireBreedingAllowed } from "../src/animal/actionGuards.ts"
import { loadMaterialInheritanceWeights } from "../src/breeding/materialWeights.ts"

// Missing delegates deliberately fail if a rejected action reaches a cost/write.
function clientFor(animal: Record<string, unknown>, discipline = {}) {
  const tx = {
    animal: { findUniqueOrThrow: async () => animal },
    careActionDef: { findUniqueOrThrow: async () => ({ gameId: "game", costType: "CURRENCY", currencyAmount: 50 }) },
    trainingActionDef: { findUniqueOrThrow: async () => ({ gameId: "game" }) },
    intensityTierDef: { findUniqueOrThrow: async () => ({ minMood: null, minCondition: null }) },
    activityRestriction: { findMany: async () => [] },
    competition: { findUniqueOrThrow: async () => ({ gameId: "game", disciplineDef: discipline }) },
  }
  return { $transaction: async (fn: (tx: typeof tx) => unknown) => fn(tx) } as unknown as Parameters<typeof applyCareAction>[0]
}
const actions = [
  (client: ReturnType<typeof clientFor>) => applyCareAction(client, { animalId: "a", careActionDefId: "care", cycleNumber: 1, performedByPlayerId: "p" }),
  (client: ReturnType<typeof clientFor>) => applyTrainingAction(client, { animalId: "a", trainingActionDefId: "train", intensityTierDefId: "tier", cycleNumber: 1, performedByPlayerId: "p" }),
  (client: ReturnType<typeof clientFor>) => enterCompetition(client, { animalId: "a", competitionId: "c", playerAccountId: "p" }),
]
test("care, training and competition reject dead animals before charging or writing", async () => {
  for (const action of actions) await assert.rejects(action(clientFor({ status: "DECEASED", lifeStage: {} })), /must be alive/)
})
test("care, training and competition enforce their life-stage flags", async () => {
  for (const action of actions) await assert.rejects(action(clientFor({ status: "ALIVE", lifeStage: {} })), /life stage/)
})
test("competition enforces both bounds of a discipline's stage range", async () => {
  for (const stageIndex of [1, 5]) await assert.rejects(actions[2]!(clientFor({
    status: "ALIVE", gameId: "game", lifeStage: { canCompete: true, stageIndex },
  }, { minLifeStageIndex: 2, maxLifeStageIndex: 4 })), /life-stage range/)
})
test("breeding restrictions cover either parent, but ignore inactive or unrelated restrictions", async () => {
  for (const restrictionType of ["BREEDING", "ALL", "CARE_ACTION", "TRAINING"]) {
    for (const isActive of [true, false]) {
      const tx = { activityRestriction: { findFirst: async ({ where }: any) =>
        where.animalId.in.includes("dam") && where.isActive === isActive && where.restrictionType.in.includes(restrictionType) ? { id: "r" } : null } }
      const result = requireBreedingAllowed(tx as any, ["sire", "dam"])
      if (isActive && ["BREEDING", "ALL"].includes(restrictionType)) await assert.rejects(result, /restricted/)
      else await result
    }
  }
})
test("stored material reads exact game-scoped weights, including zero, without changing snapshots", async () => {
  const snapshot = Object.freeze([{ locusId: "hidden", alleleOneId: "a" }, { locusId: "zero", alleleOneId: "b" }])
  const tx = { locus: { findMany: async ({ where }: any) => {
    assert.equal(where.gameId, "game")
    assert.deepEqual(where.id.in, ["hidden", "zero"])
    return [{ id: "hidden", inheritanceWeight: 0.37 }, { id: "zero", inheritanceWeight: 0 }]
  } } }
  const weights = await loadMaterialInheritanceWeights(tx as any, "game", [...snapshot.map(g => g.locusId), "hidden"])
  assert.equal(weights.get("hidden"), 0.37)
  assert.equal(weights.get("zero"), 0)
  assert.equal(snapshot[0]!.alleleOneId, "a")
  await assert.rejects(loadMaterialInheritanceWeights({ locus: { findMany: async () => [] } } as any, "game", ["missing"]), /missing/)
})
