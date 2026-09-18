import { test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

// Substitute the database before loading the router. No test can reach a real
// account, including if a guard unexpectedly falls through.
const db = {
  playerAccount: { findMany: async () => [] as unknown[] },
  healthCertificateDef: { findUnique: async (_input: unknown) => null as unknown },
}
Object.assign(globalThis, { prisma: db })
const { guardTutorialMutation } = await import("../src/tutorial-guard.ts")
const { publicProcedure, router } = await import("../src/trpc.ts")

let step: number | null = 59
let completed = false
beforeEach(() => {
  step = 59
  completed = false
  mock.method(db.playerAccount, "findMany", async () => [{ id: "player", gameId: "game", seniority: { tutorialCompleted: completed, tutorialDriverStep: step }, tutorialAnimalPair: { ancestorOneId: "mare" } }])
  mock.method(db.healthCertificateDef, "findUnique", async ({ where }: { where: { id: string } }) => ({ id: where.id, gameId: "game", name: `${where.id} Certificate` }))
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
