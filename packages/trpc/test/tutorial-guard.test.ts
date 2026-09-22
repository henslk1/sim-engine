import { test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

// Substitute the database before loading the router. No test can reach a real
// account, including if a guard unexpectedly falls through.
const db = {
  playerAccount: { findMany: async () => [] as unknown[] },
  healthCertificateDef: { findUnique: async (_input: unknown) => null as unknown },
  animal: { findUnique: async (_input: unknown) => ({ disciplineDefId: "halter", secondaryDisciplineDefId: null }) },
  animalLongTermCareRecord: { findUnique: async (_input: unknown) => ({ animalId: "foal" }) },
  disciplineDef: { findUnique: async (_input: unknown) => ({ gameId: "game", name: "Weanling Halter", isConformation: true }) },
  disciplineEquipmentRequirement: { findMany: async (_input: unknown) => [] as unknown[] },
  storeListing: { findUnique: async (_input: unknown) => ({ gameId: "game", itemDefId: "medicine" }) },
  animalTreatmentRecord: { findFirst: async (_input: unknown) => ({ treatmentDef: { items: [{ itemDefId: "medicine" }] } }) },
  locus: { findUnique: async (_input: unknown) => ({ gameId: "game", panelEntries: [{ panelDef: { panelType: "COLOR" } }] }) },
  geneticPanelDef: { findUnique: async (_input: unknown) => ({ gameId: "game", panelType: "COLOR" }) },
  coverOffer: { findUnique: async (_input: unknown) => ({ sireId: "stallion", damId: "mare" }) },
  pregnancy: { findUnique: async (_input: unknown) => ({ animalId: "mare", offspring: [{ animalId: "foal" }] }) },
}
Object.assign(globalThis, { prisma: db })
const { guardTutorialMutation } = await import("../src/tutorial-guard.ts")
const { publicProcedure, router } = await import("../src/trpc.ts")

let step: number | null = 59
let completed = false
beforeEach(() => {
  step = 59
  completed = false
  mock.method(db.playerAccount, "findMany", async () => [{ id: "player", gameId: "game", seniority: { tutorialCompleted: completed, tutorialDriverStep: step }, tutorialAnimalPair: { ancestorOneId: "mare", ancestorTwoId: "stallion", embryoId: "foal" } }])
  mock.method(db.healthCertificateDef, "findUnique", async ({ where }: { where: { id: string } }) => ({ id: where.id, gameId: "game", name: `${where.id} Certificate`, requiredForCompetition: false }))
})
afterEach(() => mock.restoreAll())
const forbidden = { code: "FORBIDDEN" }

test("direct mutations require authentication even on public procedures", async () => {
  await assert.rejects(guardTutorialMutation(null, "training.perform", { animalId: "mare" }), { code: "UNAUTHORIZED" })
})
test("the active vet step permits only the player's mare and required certificates", async () => {
  await guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", playerAccountId: "player", certDefId: "Coggins" })
  await guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", playerAccountId: "player", certDefId: "Vaccination" })
  await assert.rejects(guardTutorialMutation("user", "vet.issueCert", { animalId: "other", certDefId: "Coggins" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", playerAccountId: "other", certDefId: "Coggins" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", certDefId: "Unrelated" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "training.perform", { animalId: "mare" }), forbidden)
})
test("missing state and info steps reject game actions", async () => {
  for (const index of [null, 10, 58, 61, 79]) {
    step = index
    await assert.rejects(guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", certDefId: "Coggins" }), forbidden)
  }
})
test("middleware protects new unlisted procedures before their resolver runs", async () => {
  let calls = 0
  const caller = router({ futureAction: publicProcedure.mutation(() => ++calls) }).createCaller({ userId: "user" })
  await assert.rejects(caller.futureAction(), forbidden)
  assert.equal(calls, 0)
  completed = true
  assert.equal(await caller.futureAction(), 1)
})

test("the OTC step permits only the active treatment's medication", async () => {
  step = 112
  await guardTutorialMutation("user", "inventory.buy", { playerAccountId: "player", listingId: "medicine-listing" })
  mock.method(db.storeListing, "findUnique", async () => ({ gameId: "game", itemDefId: "other" }))
  await assert.rejects(guardTutorialMutation("user", "inventory.buy", { playerAccountId: "player", listingId: "other-listing" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "inventory.buy", { playerAccountId: "player", listingId: "other-listing", quantity: 2 }), forbidden)
})

test("unguided foal-growth steps allow the foal's full diagnose-and-treat path", async () => {
  // The foal is not exempt from illness like the tutorial ancestors are, so these
  // otherwise-unscripted steps must still permit the vet flow if it strikes.
  step = 166
  await guardTutorialMutation("user", "vet.exam", { animalId: "foal", playerAccountId: "player" })
  await guardTutorialMutation("user", "vet.startTreatment", { animalId: "foal", playerAccountId: "player" })
  await guardTutorialMutation("user", "vet.administerTreatment", { animalId: "foal", playerAccountId: "player" })
  // OTC purchase is recognized by matching the animal's active treatment items —
  // not hardcoded to a single step index the way the mare's scripted flow is.
  await guardTutorialMutation("user", "inventory.buy", { playerAccountId: "player", listingId: "medicine-listing" })
  mock.method(db.storeListing, "findUnique", async () => ({ gameId: "game", itemDefId: "not-the-treatment-item" }))
  mock.method(db.disciplineEquipmentRequirement, "findMany", async () => [] as unknown[])
  await assert.rejects(guardTutorialMutation("user", "inventory.buy", { playerAccountId: "player", listingId: "other-listing" }), forbidden)
})

test("gap steps permit only color genetics on the tutorial mare", async () => {
  step = 156
  await guardTutorialMutation("user", "genetics.testLocus", { animalId: "mare", locusId: "color-locus" })
  await guardTutorialMutation("user", "genetics.testPanel", { animalId: "mare", panelDefId: "color-panel" })
  mock.method(db.locus, "findUnique", async () => ({ gameId: "game", panelEntries: [{ panelDef: { panelType: "HEALTH" } }] }))
  await assert.rejects(guardTutorialMutation("user", "genetics.testLocus", { animalId: "mare", locusId: "health-locus" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "genetics.testPanel", { animalId: "other", panelDefId: "color-panel" }), forbidden)
})

test("breeding and ultrasound actions are limited to the tutorial pair", async () => {
  step = 150
  await guardTutorialMutation("user", "breeding.cover.send", { sireId: "stallion", damId: "mare", price: 0, fromListing: true })
  await guardTutorialMutation("user", "breeding.cover.accept", { offerId: "offer" })
  await assert.rejects(guardTutorialMutation("user", "breeding.cover.send", { sireId: "other", damId: "mare", price: 0, fromListing: true }), forbidden)
  mock.method(db.coverOffer, "findUnique", async () => ({ sireId: "other", damId: "mare" }))
  await assert.rejects(guardTutorialMutation("user", "breeding.cover.accept", { offerId: "other-offer" }), forbidden)

  step = 157
  await guardTutorialMutation("user", "breeding.pregnancy.ultrasound", { pregnancyId: "pregnancy" })
  mock.method(db.pregnancy, "findUnique", async () => ({ animalId: "other" }))
  await assert.rejects(guardTutorialMutation("user", "breeding.pregnancy.ultrasound", { pregnancyId: "other-pregnancy" }), forbidden)
})

test("birth requires a real name for the tutorial embryo", async () => {
  step = 161
  await guardTutorialMutation("user", "breeding.pregnancy.birth", { pregnancyId: "pregnancy", names: [{ animalId: "foal", name: "Legacy" }] })
  await assert.rejects(guardTutorialMutation("user", "breeding.pregnancy.birth", { pregnancyId: "pregnancy" }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "breeding.pregnancy.birth", { pregnancyId: "pregnancy", names: [{ animalId: "foal", name: "  " }] }), forbidden)
  await assert.rejects(guardTutorialMutation("user", "breeding.pregnancy.birth", { pregnancyId: "pregnancy", names: [{ animalId: "other", name: "Legacy" }] }), forbidden)
})

test("post-birth mutations are limited to the exact tutorial foal", async () => {
  step = 166
  await guardTutorialMutation("user", "care.performLtc", { animalId: "foal", ltcRecordId: "ltc" })
  await assert.rejects(guardTutorialMutation("user", "care.performLtc", { animalId: "mare", ltcRecordId: "ltc" }), forbidden)

  step = 189
  await guardTutorialMutation("user", "genetics.testCompleteProfile", { animalId: "foal", panelType: "CONFORMATION" })
  await assert.rejects(guardTutorialMutation("user", "genetics.testCompleteProfile", { animalId: "foal", panelType: "COLOR" }), forbidden)

  step = 192
  await guardTutorialMutation("user", "animal.setDiscipline", { animalId: "foal", disciplineDefId: "halter" })
  mock.method(db.disciplineDef, "findUnique", async () => ({ gameId: "game", name: "Racing", isConformation: false }))
  await assert.rejects(guardTutorialMutation("user", "animal.setDiscipline", { animalId: "foal", disciplineDefId: "racing" }), forbidden)

  step = 193
  mock.method(db.healthCertificateDef, "findUnique", async () => ({ gameId: "game", name: "Show Certificate", requiredForCompetition: true }))
  await guardTutorialMutation("user", "vet.issueCert", { animalId: "foal", certDefId: "show" })
  await assert.rejects(guardTutorialMutation("user", "vet.issueCert", { animalId: "mare", certDefId: "show" }), forbidden)

  step = 211
  await guardTutorialMutation("user", "competition.enter", { animalId: "foal", playerAccountId: "player" })
  await assert.rejects(guardTutorialMutation("user", "competition.enter", { animalId: "other", playerAccountId: "player" }), forbidden)
})
