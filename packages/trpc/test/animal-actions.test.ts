import { test, mock, afterEach } from "node:test"
import assert from "node:assert/strict"

const db = {
  playerAccount: { findMany: async () => [{ id: "player", gameId: "game", seniority: { tutorialCompleted: true } }] },
  // The maintenance guard reads the run table ahead of every mutation, so a
  // stub without it turns each refusal into an internal error. Nothing is
  // outstanding here; these tests are about the action guards.
  scheduledTaskRun: { findFirst: async (_input: unknown) => null as unknown },
  // ...and resolves the game from the animal when a mutation names one
  // rather than naming its game, so that a block applies to the game being
  // changed rather than to every game the caller happens to play in.
  animal: { findUnique: async (_input: unknown) => ({ gameId: "game" }) },
  subContainer: { updateMany: async (_input: any) => ({ count: 0 }) },

  /**
   * A transaction that actually runs its callback.
   *
   * It used to throw, which was fine while gameplay mutations talked to the
   * client directly. They now open a transaction, take the game's maintenance
   * lock on it and recheck through it, so a stub that refuses to run the body
   * tests nothing past the first line of every mutation.
   *
   * The transaction client is this same object plus the raw escape the lock
   * uses, so anything a mutation does on `tx` lands on the same stubs — and a
   * mutation that reaches for the global client instead is visible as an
   * unstubbed call rather than passing quietly.
   */
  $transaction: async (fn: any) => fn(txClient),
}

const lockCalls: string[] = []
const txClient: any = {
  ...db,
  $executeRaw: async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    lockCalls.push(strings.join("?"))
    return 1
  },
}
;(txClient as any).$transaction = db.$transaction

/**
 * A per-test transaction stub, plus what the maintenance lock needs.
 *
 * Each test supplies the rows its own assertion is about; this adds the shared
 * advisory lock and the run-status recheck that every gameplay mutation now
 * performs before it reads or writes anything. The test's own stubs win, so
 * wrapping changes nothing about what is being asserted - it only stops the
 * mutation failing on the lock before it reaches the behaviour under test.
 */
function withLock(tx: any): any {
  return {
    ...tx,
    $executeRaw:
      tx.$executeRaw ??
      (async (strings: TemplateStringsArray) => {
        lockCalls.push(strings.join("?"))
        return 1
      }),
    scheduledTaskRun: tx.scheduledTaskRun ?? { findFirst: async () => null },
    // Both forms: the guard resolves a game with `findUnique`, the gameplay
    // entry points with `findUniqueOrThrow`.
    animal: {
      findUnique: async () => ({ gameId: "game" }),
      findUniqueOrThrow: async () => ({ gameId: "game" }),
      ...(tx.animal ?? {}),
    },
    playerAccount: {
      findUnique: async () => ({ gameId: "game" }),
      findUniqueOrThrow: async () => ({ gameId: "game" }),
      ...(tx.playerAccount ?? {}),
    },
    coverOffer: {
      findUniqueOrThrow: async () => ({ gameId: "game" }),
      ...(tx.coverOffer ?? {}),
    },
  }
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
  mock.method(db, "$transaction", async (fn: any) => fn(withLock(tx)))
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
  mock.method(db, "$transaction", async (fn: any) => fn(withLock({ activityRestriction: { findFirst: async () => ({ id: "restriction" }) } })))
  for (const materialType of ["SPERM", "EGG"] as const) {
    await assert.rejects(caller.breeding.material.collectMaterial({ animalId: "a", materialType }), /restricted/)
  }
})
test("cover acceptance rechecks restrictions even when a cover was sent earlier", async () => {
  mock.method(db, "$transaction", async (fn: any) => fn(withLock({
    // `gameId` because acceptance now resolves the offer's game to take its lock.
    coverOffer: { findUniqueOrThrow: async () => ({ gameId: "game", status: "PENDING", sireId: "sire", damId: "dam" }) },
    animal: { findUnique: async () => ({ status: "ALIVE" }) },
    activityRestriction: { findFirst: async () => ({ id: "restriction" }) },
  })))
  await assert.rejects(caller.breeding.cover.accept({ offerId: "offer" }), /restricted/)
})
