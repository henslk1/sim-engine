import { test, mock, afterEach } from "node:test"
import assert from "node:assert/strict"

const db = {
  playerAccount: { findMany: async () => [{ id: "player", gameId: "game", seniority: { tutorialCompleted: true } }] },
  subContainer: { updateMany: async (_input: any) => ({ count: 0 }) },
  $transaction: async (_fn: any) => { throw new Error("unmocked transaction") },
}
;(globalThis as any).prisma = db
const { router, baseContext } = await import("../src/trpc.ts")
const { playerRouter } = await import("../src/routers/player.ts")
const { breedingMaterialRouter } = await import("../src/routers/breeding.material.ts")
const { breedingCoverRouter } = await import("../src/routers/breeding.cover.ts")
const app = router({ player: playerRouter, breeding: router({ material: breedingMaterialRouter, cover: breedingCoverRouter }) })
const caller = app.createCaller(baseContext("user"))
afterEach(() => mock.restoreAll())

test("paddock preferences require sign-in and cannot write another user's paddock", async () => {
  const input = { id: "paddock", sortDefault: "oldest" as const, filterConfig: {} }
  await assert.rejects(app.createCaller(baseContext(null)).player.saveSubContainerPreferences(input), { code: "UNAUTHORIZED" })
  const save = mock.method(db.subContainer, "updateMany", async ({ where, data }: any) => {
    assert.deepEqual(where, { id: "paddock", playerAccount: { userId: "user" } })
    assert.equal(data.filterConfig.careDue, false)
    return { count: 0 }
  })
  await assert.rejects(caller.player.saveSubContainerPreferences(input), { code: "NOT_FOUND" })
  assert.equal(save.mock.callCount(), 1)
  save.mock.mockImplementation(async () => ({ count: 1 }))
  assert.equal((await caller.player.saveSubContainerPreferences(input)).sortDefault, "oldest")
})

function implantTx(canSurrogate = true, restricted = false) {
  const pregnancies: any[] = []
  const writes: string[] = []
  const surrogate = { sex: "FEMALE", status: "ALIVE", isCastrated: false, gameId: "game", ageInCycles: 20, lifeStage: { canSurrogate, canBreed: !canSurrogate }, playerAccountId: "owner" }
  const tx = {
    geneticMaterial: {
      findUniqueOrThrow: async () => ({ id: "embryo", animalId: "dam", gameId: "game", materialType: "EMBRYO", isUsed: false, producedByBreedingRecordId: "breeding", offspringSnapshot: [{ animalId: "foal" }] }),
      update: async () => { writes.push("consume") },
    },
    animal: { findUniqueOrThrow: async () => surrogate, findUnique: async () => surrogate, updateMany: async () => { writes.push("transfer") } },
    activityRestriction: { findFirst: async () => restricted ? { id: "restriction" } : null },
    pregnancy: { count: async () => 0, create: async ({ data }: any) => { pregnancies.push(data); return { id: "pregnancy" } } },
    gameConfig: { findUnique: async () => ({ gestationCycles: 12 }) },
    vetServiceDef: { findFirst: async () => null },
    breedingRecord: { findUnique: async () => ({ sire: { name: "sire" }, dam: { name: "dam" } }) },
    surrogacyRecord: { create: async () => {} },
    pregnancyOffspring: { createMany: async () => {} },
    animalCycleActivity: { upsert: async () => {} },
    animalDailyLog: { create: async () => {} },
  }
  mock.method(db, "$transaction", async (fn: any) => fn(tx))
  return { pregnancies, writes }
}
test("surrogate-only life stage can implant and pregnancy is flagged as surrogate", async () => {
  const result = implantTx()
  await caller.breeding.material.implant({ embryoId: "embryo", surrogateAnimalId: "surrogate" })
  assert.deepEqual(result.pregnancies, [{ animalId: "surrogate", breedingRecordId: "breeding", requiredCycles: 12, isSurrogate: true }])
  assert.ok(result.writes.includes("consume"))
})
test("canBreed alone does not permit implantation", async () => {
  const result = implantTx(false)
  await assert.rejects(caller.breeding.material.implant({ embryoId: "embryo", surrogateAnimalId: "surrogate" }), /Surrogacy is not available/)
  assert.deepEqual(result.writes, [])
  assert.deepEqual(result.pregnancies, [])
})
test("treatment prevents implantation before material is consumed", async () => {
  const result = implantTx(true, true)
  await assert.rejects(caller.breeding.material.implant({ embryoId: "embryo", surrogateAnimalId: "surrogate" }), /restricted/)
  assert.deepEqual(result.writes, [])
  assert.deepEqual(result.pregnancies, [])
})
test("treatment prevents sperm and egg collection before any other action", async () => {
  mock.method(db, "$transaction", async (fn: any) => fn({ activityRestriction: { findFirst: async () => ({ id: "restriction" }) } }))
  for (const materialType of ["SPERM", "EGG"] as const) {
    await assert.rejects(caller.breeding.material.collectMaterial({ animalId: "a", materialType }), /restricted/)
  }
})
test("cover acceptance rechecks restrictions even when a cover was sent earlier", async () => {
  mock.method(db, "$transaction", async (fn: any) => fn({
    coverOffer: { findUniqueOrThrow: async () => ({ status: "PENDING", sireId: "sire", damId: "dam" }) },
    animal: { findUnique: async () => ({ status: "ALIVE" }) },
    activityRestriction: { findFirst: async () => ({ id: "restriction" }) },
  }))
  await assert.rejects(caller.breeding.cover.accept({ offerId: "offer" }), /restricted/)
})
