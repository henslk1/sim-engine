import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * Recovery from a lost race runs on the main client, after the rollback.
 *
 * Two tutorial grants - the starting gold, and the fee for returning the mare -
 * are made idempotent by a unique id built from the player and the step. Two
 * tabs clicking at once collide on it, and the loser then has to tell "somebody
 * else already paid this" apart from "this failed", which means asking whether
 * the row is there.
 *
 * It cannot ask through `tx`. A unique-key violation aborts the transaction,
 * and Postgres refuses every further statement on an aborted one with 25P02, so
 * a recovery query written in the obvious place - the catch nearest the insert -
 * fails along with the thing it was recovering from, and the player sees an
 * error instead of their gold. Both mutations were written that way once.
 *
 * Neither of the other two checks covers this shape:
 *
 *   - the structural scan in `gameplay-scan.ts` finds `tx` used outside its
 *     transaction's extent, but a catch *inside* the callback is lexically
 *     where it belongs while still talking to a dead transaction;
 *   - the concurrency suite cannot force the collision. Whether two requests
 *     meet on the same insert depends on the pool and on timing, and it passed
 *     with the recovery deliberately broken.
 *
 * So the collision is injected here instead, and the transaction client poisons
 * itself exactly as Postgres does. That makes the placement decidable rather
 * than likely: a recovery on `tx` throws, and only a recovery on `db` answers.
 */

const GAME = "game-1"
const PLAYER = "player-1"
const BREEDER = "breeder-1"
const MARE = "mare-1"
const CURRENCY = "currency-base"

/** Every database call this test saw, in order, tagged with the client. */
const calls: string[] = []

const state = {
  /** The tutorial step the player is on. */
  step: 0,
  /** Whether the winner's grant row is there by the time recovery looks. */
  grantRowExists: true,
  /** Set by the insert that loses the race. */
  aborted: false,
  /** Committed, and as the open transaction has it. */
  balance: 0,
  pendingBalance: 0,
  mareOwner: PLAYER,
  pendingMareOwner: PLAYER,
}

/** What Prisma raises when two requests insert the same id. */
function duplicateKey(): Error {
  return Object.assign(new Error("Unique constraint failed on the fields: (id)"), {
    code: "P2002",
    meta: { target: ["id"] },
  })
}

/** What Postgres answers for the rest of an aborted transaction's life. */
function abortedTransaction(): Error {
  return Object.assign(
    new Error("current transaction is aborted, commands ignored until end of transaction block"),
    { code: "25P02" }
  )
}

type Methods = Record<string, (args: any) => Promise<unknown>>

/** A model on the transaction client: recorded, and refused once aborted. */
function onTx(model: string, methods: Methods): Methods {
  const out: Methods = {}
  for (const [name, fn] of Object.entries(methods)) {
    out[name] = async (args: any) => {
      calls.push(`tx.${model}.${name}`)
      if (state.aborted) throw abortedTransaction()
      return fn(args)
    }
  }
  return out
}

/** The same on the main client, which an aborted transaction does not touch. */
function onDb(model: string, methods: Methods): Methods {
  const out: Methods = {}
  for (const [name, fn] of Object.entries(methods)) {
    out[name] = async (args: any) => {
      calls.push(`db.${model}.${name}`)
      return fn(args)
    }
  }
  return out
}

const tx: any = {
  $executeRaw: async () => {
    calls.push("tx.$executeRaw")
    if (state.aborted) throw abortedTransaction()
    return 1
  },
  $executeRawUnsafe: async () => {
    calls.push("tx.$executeRawUnsafe")
    if (state.aborted) throw abortedTransaction()
    return 1
  },
  scheduledTaskRun: onTx("scheduledTaskRun", { findFirst: async () => null }),
  playerAccount: onTx("playerAccount", {
    findUnique: async () => ({ id: PLAYER, seniority: { tutorialDriverStep: state.step } }),
  }),
  tutorialAnimalPair: onTx("tutorialAnimalPair", {
    findUnique: async () => ({
      ancestorOneId: MARE,
      ancestorOne: { breederId: BREEDER, playerAccountId: state.mareOwner },
    }),
  }),
  currencyDef: onTx("currencyDef", { findFirst: async () => ({ id: CURRENCY }) }),
  transaction: onTx("transaction", {
    // Nothing yet, as far as this transaction can see. That is how the
    // collision happens at all: the winner commits after this read.
    findUnique: async () => null,
    count: async () => 0,
    create: async () => {
      state.aborted = true
      throw duplicateKey()
    },
  }),
  playerBalance: onTx("playerBalance", {
    upsert: async ({ create, update }: any) => {
      state.pendingBalance += update?.balance?.increment ?? create?.balance ?? 0
      return {}
    },
  }),
  animal: onTx("animal", {
    update: async ({ data }: any) => {
      state.pendingMareOwner = data.playerAccountId
      return {}
    },
  }),
}

const main: any = {
  scheduledTaskRun: onDb("scheduledTaskRun", { findFirst: async () => null }),
  playerAccount: onDb("playerAccount", {
    findMany: async () => [
      {
        id: PLAYER,
        gameId: GAME,
        seniority: { tutorialDriverStep: state.step, tutorialCompleted: false },
        tutorialAnimalPair: { ancestorOneId: MARE, ancestorTwoId: "sire-1", embryoId: "foal-1" },
      },
    ],
  }),
  transaction: onDb("transaction", {
    findUnique: async () => (state.grantRowExists ? { id: "the-winners-grant" } : null),
  }),
  $transaction: async (fn: any) => {
    state.aborted = false
    state.pendingBalance = state.balance
    state.pendingMareOwner = state.mareOwner
    try {
      const result = await fn(tx)
      state.balance = state.pendingBalance
      state.mareOwner = state.pendingMareOwner
      return result
    } catch (error) {
      // Rolled back: nothing the callback wrote survives it.
      state.pendingBalance = state.balance
      state.pendingMareOwner = state.mareOwner
      throw error
    }
  },
}
;(globalThis as any).prisma = main

const { router, baseContext } = await import("../src/trpc.ts")
const { tutorialRouter } = await import("../src/routers/tutorial.ts")
const { TUTORIAL_STEPS } = await import("../src/tutorial-policy.ts")

const app = router({ tutorial: tutorialRouter })
const caller = app.createCaller(baseContext("user-1"))

// Taken from the policy rather than written down, so renumbering the tutorial
// cannot quietly point these at a step that allows neither mutation.
const RETURN_STEP = TUTORIAL_STEPS.findIndex((step) => step.mutations?.includes("tutorial.returnMare"))
const GOLD_STEP = TUTORIAL_STEPS.findIndex((step) => step.gold !== undefined)
const GOLD_AMOUNT = TUTORIAL_STEPS[GOLD_STEP]?.gold ?? 0
assert.ok(RETURN_STEP >= 0 && GOLD_STEP >= 0, "the tutorial should still have both granting steps")

function begin(step: number, over: Partial<typeof state> = {}): void {
  calls.length = 0
  Object.assign(
    state,
    {
      step,
      grantRowExists: true,
      aborted: false,
      balance: 0,
      pendingBalance: 0,
      mareOwner: PLAYER,
      pendingMareOwner: PLAYER,
    },
    over
  )
}

/** Everything that happened after the insert aborted the transaction. */
function afterTheAbort(): string[] {
  const at = calls.indexOf("tx.transaction.create")
  assert.notEqual(at, -1, "the grant insert should have been attempted")
  return calls.slice(at + 1)
}

/**
 * The assertion this whole file exists for.
 *
 * Anything on `tx` after the abort is a statement Postgres would have refused.
 * A recovery read on `db` is the only one that can still answer.
 */
function recoveredOnTheMainClient(): void {
  const after = afterTheAbort()
  assert.deepEqual(
    after.filter((call) => call.startsWith("tx.")),
    [],
    "nothing may be asked of the transaction once the duplicate key has aborted it"
  )
  assert.ok(
    after.includes("db.transaction.findUnique"),
    "the recovery should look for the winner's grant on the main client"
  )
}

test("the transaction client refuses every statement once an insert has aborted it", async () => {
  // Proves the tests below have teeth: a recovery query left on `tx` meets
  // this, and the mutation it was recovering fails with it.
  begin(RETURN_STEP, { aborted: true })
  await assert.rejects(tx.transaction.findUnique({ where: { id: "x" } }), /transaction is aborted/)
  await assert.rejects(tx.$executeRaw`SELECT 1`, /transaction is aborted/)
})

test("returning the mare recovers on the main client after the rollback", async () => {
  begin(RETURN_STEP)
  // Resolving at all is half the point: the loser of the race has nothing to
  // report, because the player has been paid.
  await caller.tutorial.returnMare({ gameId: GAME })
  recoveredOnTheMainClient()
})

test("the loser of the mare race pays nothing and transfers nothing", async () => {
  begin(RETURN_STEP)
  await caller.tutorial.returnMare({ gameId: GAME })
  assert.equal(state.balance, 0, "the rolled-back grant must not be credited")
  assert.equal(state.mareOwner, PLAYER, "the rolled-back transfer must not stand")
})

test("a mare-return failure that is not a lost race is not swallowed", async () => {
  // The same duplicate key with no winner behind it - a real constraint
  // problem, which the recovery must not quietly report as success.
  begin(RETURN_STEP, { grantRowExists: false })
  await assert.rejects(caller.tutorial.returnMare({ gameId: GAME }), /Unique constraint/)
  assert.ok(afterTheAbort().includes("db.transaction.findUnique"), "it should still have looked")
})

test("the starting-gold grant recovers on the main client after the rollback", async () => {
  begin(GOLD_STEP)
  await caller.tutorial.grantStartingGold({ gameId: GAME, amount: GOLD_AMOUNT })
  recoveredOnTheMainClient()
  assert.equal(state.balance, 0, "the rolled-back grant must not be credited")
})

test("a starting-gold failure that is not a lost race is not swallowed", async () => {
  begin(GOLD_STEP, { grantRowExists: false })
  await assert.rejects(
    caller.tutorial.grantStartingGold({ gameId: GAME, amount: GOLD_AMOUNT }),
    /Unique constraint/
  )
})
