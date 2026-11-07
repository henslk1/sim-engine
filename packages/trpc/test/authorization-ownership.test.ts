import { test } from "node:test"
import assert from "node:assert/strict"
import { TRPCError } from "@trpc/server"
import { assertOwnsAnimal, assertOwnsAnimals, assertOwnsPlayerAccount } from "../src/authz.js"

/**
 * What the ownership helpers accept, and what they refuse.
 *
 * Against stubs rather than a database, because the decisions here are about
 * which rows are compared with which - not about locking, which only a real
 * Postgres can prove and which `gameplay-concurrency.integration.test.ts`
 * covers.
 *
 * The case worth the file is the one these helpers got wrong first: **nothing
 * in the schema ties `Animal.gameId` to its owner's `gameId`.** They are two
 * independent columns, so a game A account attached to a game B animal was
 * accepted as its owner, and every game-scoped rule around the write would then
 * have been evaluated against the wrong game - including the maintenance lock,
 * which `enterGameplayForAnimal` takes on `animal.gameId`.
 */

type Row = { id: string; gameId: string; playerAccountId: string; status: string }
type Account = { id: string; userId: string; gameId: string; username: string }

/** One raw statement a helper issued: its text, and the ids it named. */
type Statement = { sql: string; ids: string[] }

/**
 * The calls the helpers make, and a record of how they were made.
 *
 * The statement text is kept, not just the ids, because one of these helpers
 * documented a `FOR UPDATE` it was not taking - it read the row with
 * `findUnique` and said in its own comment that it locked it. A stub cannot
 * prove a lock works, but it can prove the statement that claims one is still
 * being issued, which is the half that silently rotted.
 */
function stub(animals: Row[], accounts: Account[]) {
  const statements: Statement[] = []
  const client = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // The helpers interpolate exactly one value: an id, or an array of them.
      const sql = strings.join(" ? ")
      const ids = values.flatMap((v) => (Array.isArray(v) ? (v as string[]) : [v as string]))
      statements.push({ sql, ids })
      const rows: { id: string }[] = sql.includes('FROM "PlayerAccount"') ? accounts : animals
      return rows.filter((r) => ids.includes(r.id)).sort((a, b) => a.id.localeCompare(b.id))
    },
    playerAccount: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        accounts.find((a) => a.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        accounts.filter((a) => where.id.in.includes(a.id)),
    },
  }
  return { client: client as never, statements }
}

const ALICE: Account = { id: "acct-alice", userId: "user-alice", gameId: "game-a", username: "Alice" }
const BOB: Account = { id: "acct-bob", userId: "user-bob", gameId: "game-a", username: "Bob" }
/** Alice again, but her account in the other game. */
const ALICE_B: Account = { id: "acct-alice-b", userId: "user-alice", gameId: "game-b", username: "Alice" }

const animal = (id: string, gameId: string, owner: Account): Row => ({
  id,
  gameId,
  playerAccountId: owner.id,
  status: "ALIVE",
})

async function refusal(run: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await run()
  } catch (error) {
    assert.ok(error instanceof TRPCError, `expected a TRPCError, got ${String(error)}`)
    return error
  }
  throw new assert.AssertionError({ message: "expected a refusal, the call succeeded" })
}

// ---------------------------------------------------------------------------
// assertOwnsAnimal
// ---------------------------------------------------------------------------

test("the caller's own animal, in their own game, is accepted", async () => {
  const { client } = stub([animal("a1", "game-a", ALICE)], [ALICE])
  const { animal: row, player } = await assertOwnsAnimal(client, "user-alice", "a1")
  assert.equal(row.id, "a1")
  assert.equal(player.id, ALICE.id)
})

test("an animal owned by an account in another game is refused", async () => {
  // The owner of record *is* the caller. The account is simply not in the
  // animal's game, and the schema does not stop that pairing existing.
  const { client } = stub([animal("a1", "game-b", ALICE)], [ALICE])
  const error = await refusal(() => assertOwnsAnimal(client, "user-alice", "a1"))
  assert.equal(error.code, "FORBIDDEN")
})

test("somebody else's animal is refused", async () => {
  const { client } = stub([animal("a1", "game-a", BOB)], [BOB])
  const error = await refusal(() => assertOwnsAnimal(client, "user-alice", "a1"))
  assert.equal(error.code, "FORBIDDEN")
})

test("an animal that does not exist is a not-found, not a forbidden", async () => {
  const { client } = stub([], [ALICE])
  const error = await refusal(() => assertOwnsAnimal(client, "user-alice", "missing"))
  assert.equal(error.code, "NOT_FOUND")
})

test("an animal whose owning account has gone is refused rather than accepted", async () => {
  const { client } = stub([animal("a1", "game-a", ALICE)], [])
  const error = await refusal(() => assertOwnsAnimal(client, "user-alice", "a1"))
  assert.equal(error.code, "FORBIDDEN")
})

// ---------------------------------------------------------------------------
// assertOwnsAnimals
// ---------------------------------------------------------------------------

test("a pair the caller owns in one game is accepted", async () => {
  const { client } = stub(
    [animal("sire", "game-a", ALICE), animal("dam", "game-a", ALICE)],
    [ALICE]
  )
  const { animals, player } = await assertOwnsAnimals(client, "user-alice", ["dam", "sire"])
  assert.deepEqual([...animals.keys()].sort(), ["dam", "sire"])
  assert.equal(player.id, ALICE.id)
})

test("a pair with one animal in another game is refused", async () => {
  // Both the caller's, by two of the caller's own accounts. The pair still
  // spans two games, which is the mutation `assertParticipantsInGame` exists
  // to stop arriving from the other direction.
  const { client } = stub(
    [animal("sire", "game-a", ALICE), animal("dam", "game-b", ALICE_B)],
    [ALICE, ALICE_B]
  )
  const error = await refusal(() => assertOwnsAnimals(client, "user-alice", ["sire", "dam"]))
  assert.equal(error.code, "FORBIDDEN")
})

test("a pair owned by one account but living in two games is refused", async () => {
  const { client } = stub(
    [animal("sire", "game-a", ALICE), animal("dam", "game-b", ALICE)],
    [ALICE]
  )
  const error = await refusal(() => assertOwnsAnimals(client, "user-alice", ["sire", "dam"]))
  assert.equal(error.code, "FORBIDDEN")
})

test("a pair with one animal belonging to somebody else is refused", async () => {
  const { client } = stub(
    [animal("sire", "game-a", BOB), animal("dam", "game-a", ALICE)],
    [ALICE, BOB]
  )
  const error = await refusal(() => assertOwnsAnimals(client, "user-alice", ["sire", "dam"]))
  assert.equal(error.code, "FORBIDDEN")
})

test("a pair where one animal does not exist is a not-found", async () => {
  const { client } = stub([animal("sire", "game-a", ALICE)], [ALICE])
  const error = await refusal(() => assertOwnsAnimals(client, "user-alice", ["sire", "missing"]))
  assert.equal(error.code, "NOT_FOUND")
})

test("the pair is locked in id order, whichever order it was named in", async () => {
  // Two mutations naming the same pair the opposite way round must queue rather
  // than deadlock, and that only holds if both ask for the rows in one order.
  const rows = [animal("aaa", "game-a", ALICE), animal("zzz", "game-a", ALICE)]
  const forwards = stub(rows, [ALICE])
  const backwards = stub(rows, [ALICE])
  await assertOwnsAnimals(forwards.client, "user-alice", ["aaa", "zzz"])
  await assertOwnsAnimals(backwards.client, "user-alice", ["zzz", "aaa"])
  assert.deepEqual(forwards.statements[0]?.ids, ["aaa", "zzz"])
  assert.deepEqual(backwards.statements[0]?.ids, ["aaa", "zzz"])
})

test("a repeated id is locked once", async () => {
  const { client, statements } = stub([animal("a1", "game-a", ALICE)], [ALICE])
  const { animals } = await assertOwnsAnimals(client, "user-alice", ["a1", "a1"])
  assert.deepEqual(statements[0]?.ids, ["a1"])
  assert.equal(animals.size, 1)
})

// ---------------------------------------------------------------------------
// assertOwnsPlayerAccount
// ---------------------------------------------------------------------------

test("an account the caller holds is accepted, and one they do not is refused", async () => {
  const { client } = stub([], [ALICE, BOB])
  assert.equal((await assertOwnsPlayerAccount(client, "user-alice", "acct-alice")).id, "acct-alice")

  const wrongUser = await refusal(() => assertOwnsPlayerAccount(client, "user-alice", "acct-bob"))
  assert.equal(wrongUser.code, "FORBIDDEN")

  const missing = await refusal(() => assertOwnsPlayerAccount(client, "user-alice", "acct-gone"))
  assert.equal(missing.code, "NOT_FOUND")
})

// ---------------------------------------------------------------------------
// The claim each of them makes in its own comment
// ---------------------------------------------------------------------------

test("every helper that documents a row lock still issues one", async () => {
  // Not proof that the lock does its job - only Postgres can show that, and
  // `packages/db/test/gameplay-concurrency.integration.test.ts` does. This is
  // the cheaper regression: a helper that goes back to reading the row with
  // `findUnique` while its comment still promises `FOR UPDATE`, which is the
  // state `assertOwnsPlayerAccount` was found in.
  const locks = /FOR UPDATE/

  const one = stub([animal("a1", "game-a", ALICE)], [ALICE])
  await assertOwnsAnimal(one.client, "user-alice", "a1")
  assert.match(one.statements[0]?.sql ?? "", locks, "assertOwnsAnimal must lock the animal row")

  const pair = stub([animal("a1", "game-a", ALICE)], [ALICE])
  await assertOwnsAnimals(pair.client, "user-alice", ["a1"])
  assert.match(pair.statements[0]?.sql ?? "", locks, "assertOwnsAnimals must lock the animal rows")

  const account = stub([], [ALICE])
  await assertOwnsPlayerAccount(account.client, "user-alice", "acct-alice")
  assert.match(
    account.statements[0]?.sql ?? "",
    locks,
    "assertOwnsPlayerAccount must lock the account row"
  )
})
