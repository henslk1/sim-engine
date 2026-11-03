import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * One action, one game.
 *
 * Every mutation here takes two or more ids, and each of them carries its own
 * game. Taking the lock from one and acting on another is not protection at
 * all: the write lands in a game nobody checked and nobody closed, which is
 * exactly the state the lock exists to prevent.
 *
 * Every case below was a real hole. Four were found by review after the first
 * conversion pass resolved the game from whichever id was nearest to hand -
 * usually the caller's account, which is the one id that says nothing about
 * what is being changed.
 */

const lockKeys: string[] = []

/** The game each entity belongs to. Anything named `b-*` lives in game B. */
const gameOf = (id: string) => (id.startsWith("b-") ? "game-b" : "game-a")

function entity(id: string) {
  return { id, gameId: gameOf(id) }
}

/**
 * A database where nothing is in maintenance at all.
 *
 * Deliberately: an updating game would have the middleware guard refuse these
 * before a resolver ran, and the test would pass without the check it is for
 * ever being reached. One of these did exactly that - it still passed with the
 * fix reverted. With both games open, the only thing left that can refuse is
 * the validation inside the locked transaction.
 */
const db: any = {
  scheduledTaskRun: { findFirst: async () => null },
  animal: {
    findUnique: async ({ where }: any) => entity(where.id),
    findUniqueOrThrow: async ({ where }: any) => entity(where.id),
    count: async ({ where }: any) =>
      (where.id?.in ?? []).filter((id: string) => gameOf(id) === where.gameId).length,
    update: async () => ({ id: "updated" }),
  },
  playerAccount: {
    findUnique: async ({ where }: any) => entity(where.id),
    findUniqueOrThrow: async ({ where }: any) => entity(where.id),
    // The tutorial guard runs just after the maintenance guard and refuses any
    // `playerAccountId` the caller does not own, so the accounts these tests
    // name have to exist and have finished the tutorial. These tests are about
    // the cross-game checks below that gate.
    findMany: async () => [
      { id: "payer", gameId: "game-a", seniority: { tutorialCompleted: true } },
      { id: "b-payer", gameId: "game-b", seniority: { tutorialCompleted: true } },
    ],
    count: async ({ where }: any) =>
      (where.id?.in ?? []).filter((id: string) => gameOf(id) === where.gameId).length,
  },
  animalTreatmentRecord: {
    findUniqueOrThrow: async ({ where }: any) => ({ animalId: where.id.replace("rec-", "") }),
    findUnique: async ({ where }: any) => ({ animalId: where.id.replace("rec-", "") }),
  },
  animalLongTermCareRecord: {
    findUniqueOrThrow: async ({ where }: any) => ({
      id: where.id,
      // `ltc-for-<animalId>`
      animalId: where.id.replace("ltc-for-", ""),
      longTermCareActionDef: { currencyAmount: 0, intervalCycles: 1 },
    }),
  },
  animalEquipment: {
    findUniqueOrThrow: async ({ where }: any) => ({
      animalId: where.id.replace("equip-for-", ""),
      itemDefId: "item",
    }),
  },
  storeListing: {
    findUniqueOrThrow: async ({ where }: any) => ({ gameId: gameOf(where.id), id: where.id }),
  },
  geneticMaterial: {
    findUniqueOrThrow: async ({ where }: any) => ({ gameId: gameOf(where.id), id: where.id }),
  },
  $executeRaw: async (strings: TemplateStringsArray) => {
    lockKeys.push(strings.join("?"))
    return 1
  },
  $executeRawUnsafe: async () => 1,
  $transaction: async (fn: any) => fn(db),
}
;(globalThis as any).prisma = db

const { router, baseContext } = await import("../src/trpc.ts")
const { vetRouter } = await import("../src/routers/vet.ts")
const { inventoryRouter } = await import("../src/routers/inventory.ts")
const { animalCareRouter } = await import("../src/routers/animal.care.ts")
const { breedingCoverRouter } = await import("../src/routers/breeding.cover.ts")
const { breedingMaterialRouter } = await import("../src/routers/breeding.material.ts")

const app = router({
  vet: vetRouter,
  inventory: inventoryRouter,
  care: animalCareRouter,
  cover: breedingCoverRouter,
  material: breedingMaterialRouter,
})
const caller = app.createCaller(baseContext("user"))

/** Refused for one of the two right reasons, and never quietly allowed. */
const refused = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  // Only the cross-game refusals count. A maintenance block or a tutorial
  // denial would mean the test never reached what it is testing.
  assert.match(message, /same game|different animal/, `expected a cross-game refusal, got: ${message}`)
  return true
}

test("treating an animal in another game is refused", async () => {
  // The treatment record belongs to an animal in game B; the account is in A.
  // Resolving from the account locked A - the quiet game - and treated B.
  await assert.rejects(
    caller.vet.administerTreatment({ treatmentRecordId: "rec-b-horse", playerAccountId: "payer" }),
    refused
  )
})

test("long-term care for another animal's record is refused", async () => {
  // The lock came from `animalId`; the record it then advanced was never
  // checked against it, so a record in game B could be advanced and charged for
  // while game A was the only one closed.
  await assert.rejects(
    caller.care.performLtc({ animalId: "horse", ltcRecordId: "ltc-for-b-horse" }),
    refused
  )
})

test("long-term care paid by an account in another game is refused", async () => {
  await assert.rejects(
    caller.care.performLtc({
      animalId: "horse",
      ltcRecordId: "ltc-for-horse",
      playerAccountId: "b-payer",
    }),
    refused
  )
})

test("unequipping from an animal in another game is refused", async () => {
  await assert.rejects(
    caller.inventory.unequip({ equipmentId: "equip-for-b-horse", playerAccountId: "payer" }),
    refused
  )
})

test("buying from another game's store listing is refused", async () => {
  await assert.rejects(
    caller.inventory.buy({ listingId: "b-listing", playerAccountId: "payer", quantity: 1 }),
    refused
  )
})

test("creating an embryo from another game's material is refused", async () => {
  await assert.rejects(
    caller.material.createEmbryo({ spermId: "b-sperm", eggId: "egg", playerAccountId: "payer" }),
    refused
  )
})

test("covering across two games is refused", async () => {
  // A cover names two animals and nothing had ever required them to share a
  // game - locking the sire's left the dam entirely unguarded.
  await assert.rejects(caller.cover.send({ sireId: "sire", damId: "b-dam", price: 0 }), refused)
})

test("a cross-game refusal happens inside the lock, not before it", async () => {
  lockKeys.length = 0
  await assert.rejects(
    caller.care.performLtc({ animalId: "horse", ltcRecordId: "ltc-for-b-horse" }),
    refused
  )
  assert.ok(
    lockKeys.some((sql) => sql.includes("pg_advisory_xact_lock_shared")),
    "the mutation should have taken the game's lock before deciding"
  )
})
