import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * Gameplay and a nightly, against a real database, at the same time.
 *
 * Everything else about this is tested structurally - that each mutation opens
 * through the lock, that its work stays on the transaction, that it refuses a
 * resource from another game. None of that proves the thing the lock exists
 * for: that two of these running at once produce the right outcome.
 *
 * Where it can, this goes through the real tRPC routers rather than imitating
 * what they do. A test that charges a balance by hand and throws proves the
 * database rolls back, which was never in doubt; it says nothing about whether
 * the mutation's own helpers stayed on the transaction that rolls back.
 *
 * ## Running it
 *
 *     pnpm test:concurrency:db
 *
 * It needs its own database, because it writes. By default that is the one
 * named in `DATABASE_URL` with the name replaced by `sim_engine_conc`; set
 * `CONCURRENCY_DATABASE_URL` to point somewhere else. `scratchpad/conc-db.sh`
 * builds it from a dev copy.
 */

const ENABLED = process.env["RUN_DATABASE_TESTS"] === "1"
const EXPECTED_DB = "sim_engine_conc"

/** The scratch URL: explicit if given, otherwise `DATABASE_URL` with the name swapped. */
function targetUrl(): string {
  const explicit = process.env["CONCURRENCY_DATABASE_URL"]
  if (explicit) return explicit

  const base = process.env["DATABASE_URL"]
  if (!base) throw new Error("neither CONCURRENCY_DATABASE_URL nor DATABASE_URL is set")

  const url = new URL(base)
  url.pathname = `/${EXPECTED_DB}`
  return url.toString()
}

/**
 * The database a URL actually names.
 *
 * Parsed rather than searched. Looking for the name anywhere in the string
 * would accept it in a username, a password or a query parameter while the
 * connection went somewhere else entirely - and this suite writes.
 */
function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "")
}

let db: PrismaClient
let URL_: string

/** Resolved in `before`, so a misconfiguration fails loudly rather than skipping. */
let fixture: {
  gameId: string
  animalId: string
  playerAccountId: string
  ltcRecordId: string
  currencyDefId: string
}
let userId: string
/** A care action configured to cost money, so the helper's own charging runs. */
let paidCareDefId: string
let paidCareOriginal: { costType: string; currencyAmount: number | null }

const skip = ENABLED ? false : "set RUN_DATABASE_TESTS=1 to run the concurrency suite"

function client(options: { max?: number } = {}) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: URL_, ...(options.max ? { max: options.max } : {}) }),
  })
}

before(async () => {
  if (!ENABLED) return

  URL_ = targetUrl()

  // Enabled but pointed somewhere else is an error, not a reason to skip. A
  // suite that quietly passes by doing nothing is the worst of both.
  const named = databaseName(URL_)
  assert.equal(
    named,
    EXPECTED_DB,
    `refusing to run against "${named}" - this suite writes and expects ${EXPECTED_DB}`
  )

  process.env["DATABASE_URL"] = URL_
  db = client()

  // And confirm it against the server, not the string we were handed.
  const [current] = await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
  assert.equal(current!.db, EXPECTED_DB, "connected to the wrong database")

  const game = await db.game.findFirstOrThrow({ select: { id: true } })
  // Owned-ness is filtered here rather than in the query: `not: null` on a
  // nullable scalar inside a relation filter is not something this client
  // accepts.
  const candidates = await db.animalLongTermCareRecord.findMany({
    where: {
      longTermCareActionDef: { currencyAmount: { gt: 0 } },
      animal: { gameId: game.id, status: "ALIVE" },
    },
    take: 50,
    select: { id: true, animalId: true, animal: { select: { playerAccountId: true } } },
  })
  const record = candidates.find((c) => c.animal.playerAccountId !== null)
  assert.ok(
    record,
    "no owned, living animal with a fee-bearing long-term care record - rebuild the test database"
  )
  const currency = await db.currencyDef.findFirstOrThrow({
    where: { gameId: game.id, currencyType: "BASE" },
    select: { id: true },
  })

  fixture = {
    gameId: game.id,
    animalId: record.animalId,
    playerAccountId: record.animal.playerAccountId!,
    ltcRecordId: record.id,
    currencyDefId: currency.id,
  }

  const owner = await db.playerAccount.findUniqueOrThrow({
    where: { id: fixture.playerAccountId },
    select: { userId: true },
  })
  assert.ok(owner.userId, "the fixture account needs a user to call routes as")
  userId = owner.userId

  // Every care action in the fixture data is FREE, so the helper's charging
  // path would never run. One is configured to cost money for the duration of
  // this suite and restored afterwards.
  const care = await db.careActionDef.findFirstOrThrow({
    where: { gameId: fixture.gameId },
    select: { id: true, costType: true, currencyAmount: true },
  })
  paidCareDefId = care.id
  paidCareOriginal = { costType: care.costType, currencyAmount: care.currencyAmount }
  await db.careActionDef.update({
    where: { id: care.id },
    data: { costType: "CURRENCY", currencyAmount: 40 },
  })

  // Enough to pay for anything this suite does.
  await db.playerBalance.upsert({
    where: {
      playerAccountId_currencyDefId: {
        playerAccountId: fixture.playerAccountId,
        currencyDefId: fixture.currencyDefId,
      },
    },
    create: {
      playerAccountId: fixture.playerAccountId,
      currencyDefId: fixture.currencyDefId,
      balance: 100_000,
    },
    update: { balance: 100_000 },
  })
})

after(async () => {
  if (!ENABLED) return
  await db.scheduledTaskRun.deleteMany({ where: { claimedBy: "concurrency-test" } })
  if (paidCareDefId) {
    await db.careActionDef.update({
      where: { id: paidCareDefId },
      data: paidCareOriginal as never,
    })
  }
  await db.$disconnect()
})

/** Mark a game as updating, the way a claimed nightly does. */
async function startNightly(gameId: string): Promise<string> {
  const task = await db.scheduledTask.findFirstOrThrow({
    where: { gameId, taskType: "NIGHTLY" },
    select: { id: true },
  })
  const run = await db.scheduledTaskRun.create({
    data: {
      taskId: task.id,
      gameId,
      taskType: "NIGHTLY",
      scheduledFor: new Date(),
      status: "RUNNING",
      claimedBy: "concurrency-test",
      startedAt: new Date(),
    },
    select: { id: true },
  })
  return run.id
}

const balanceOf = async (): Promise<number> =>
  (
    await db.playerBalance.findUniqueOrThrow({
      where: {
        playerAccountId_currencyDefId: {
          playerAccountId: fixture.playerAccountId,
          currencyDefId: fixture.currencyDefId,
        },
      },
      select: { balance: true },
    })
  ).balance

test("a real paid route is refused during maintenance, and charges nothing", { skip }, async () => {
  // The actual router action, not an imitation of one. `performLtc` charges
  // the care action's fee, so a charge escaping the refusal would show here.
  const { router, baseContext } = await import("../../trpc/src/trpc.ts")
  const { animalCareRouter } = await import("../../trpc/src/routers/animal.care.ts")
  const caller = router({ care: animalCareRouter }).createCaller(baseContext(userId))

  const before_ = await balanceOf()
  const runId = await startNightly(fixture.gameId)

  try {
    await assert.rejects(
      caller.care.performLtc({
        animalId: fixture.animalId,
        ltcRecordId: fixture.ltcRecordId,
        playerAccountId: fixture.playerAccountId,
      }),
      /GAME_UPDATE_IN_PROGRESS/
    )
  } finally {
    await db.scheduledTaskRun.delete({ where: { id: runId } })
  }

  assert.equal(await balanceOf(), before_, "a refused route must not have charged anything")

  // The in-memory hint refuses without a query for a few seconds after a run
  // ends - deliberately, since it may only refuse and never allow. A player
  // would retry and get in; the test revalidates instead of waiting it out,
  // which is also a check that revalidation clears the hint.
  const { readGameMaintenance } = await import("../../trpc/src/maintenance.ts")
  assert.equal(
    await readGameMaintenance(fixture.gameId, db as never),
    null,
    "with the run gone, the authoritative read should report the game open"
  )

  // And the same call succeeds, and does charge, once the update is over -
  // otherwise the assertion above would pass for a route that never charges.
  const fee = await db.animalLongTermCareRecord
    .findUniqueOrThrow({
      where: { id: fixture.ltcRecordId },
      select: { longTermCareActionDef: { select: { currencyAmount: true } } },
    })
    .then((r) => r.longTermCareActionDef.currencyAmount ?? 0)
  assert.ok(fee > 0, "the fixture record must carry a fee for this test to mean anything")

  await caller.care.performLtc({
    animalId: fixture.animalId,
    ltcRecordId: fixture.ltcRecordId,
    playerAccountId: fixture.playerAccountId,
  })
  assert.equal(await balanceOf(), before_ - fee, "the route should charge its fee when allowed")
})

test("the care helper's own charge rolls back with the action", { skip }, async () => {
  const { enterGameplay } = await import("../../trpc/src/maintenance.ts")
  const { applyCareActionTx } = await import("../../engine/src/index.ts")

  const animal = await db.animal.findUniqueOrThrow({
    where: { id: fixture.animalId },
    select: { ageInCycles: true },
  })

  // The success half below writes a care log and charges. Clear both first, or
  // this run's rollback assertion finds the previous run's log and fails.
  const careWhere = {
    animalId: fixture.animalId,
    cycleNumber: animal.ageInCycles,
    careActionDefId: paidCareDefId,
  }
  await db.careLog.deleteMany({ where: careWhere })
  const before_ = await balanceOf()

  // The helper charges this one itself - the test deducts nothing by hand, so
  // what rolls back is the helper's own write on the caller's transaction. If
  // it reached another connection the charge would survive.
  await assert.rejects(
    db.$transaction(
      async (tx) => {
        await enterGameplay(tx, fixture.gameId)
        await applyCareActionTx(tx, {
          animalId: fixture.animalId,
          careActionDefId: paidCareDefId,
          performedByPlayerId: fixture.playerAccountId,
          cycleNumber: animal.ageInCycles,
        })
        throw new Error("refused after the helper charged")
      },
      { timeout: 20_000 }
    ),
    /refused after the helper charged/
  )

  assert.equal(await balanceOf(), before_, "the helper's fee must have rolled back")

  const log = await db.careLog.findFirst({ where: careWhere, select: { id: true } })
  assert.equal(log, null, "the care the helper recorded must have rolled back too")

  // And it really does charge when it is allowed to, so the assertion above is
  // about a rollback rather than about a helper that never charges.
  await db.$transaction(
    async (tx) => {
      await enterGameplay(tx, fixture.gameId)
      await applyCareActionTx(tx, {
        animalId: fixture.animalId,
        careActionDefId: paidCareDefId,
        performedByPlayerId: fixture.playerAccountId,
        cycleNumber: animal.ageInCycles,
      })
    },
    { timeout: 20_000 }
  )
  assert.equal(await balanceOf(), before_ - 40, "the helper should charge when the action succeeds")

  // Leave nothing behind for the next run's rollback assertion to trip over.
  await db.careLog.deleteMany({ where: careWhere })
})

test("an action already underway finishes before a nightly takes the game", { skip }, async () => {
  const { enterGameplay, lockGameForMaintenance } = await import("../../trpc/src/maintenance.ts")
  const gameplay = client()
  const nightly = client()

  try {
    const order: string[] = []

    // Explicit signals rather than sleeps: one for "the lock is held", one to
    // let the action finish. Timing-based waits make the test flaky and, worse,
    // can make it pass without the thing it is waiting for having happened.
    let lockHeld: () => void
    const holdingLock = new Promise<void>((resolve) => { lockHeld = resolve })
    let release: () => void
    const released = new Promise<void>((resolve) => { release = resolve })

    const action = gameplay.$transaction(
      async (tx) => {
        await enterGameplay(tx, fixture.gameId)
        order.push("gameplay-holds-the-lock")
        lockHeld()
        await released
        order.push("gameplay-callback-returned")
      },
      { timeout: 30_000 }
    )

    await holdingLock

    let nightlyEntered: () => void
    const nightlyDone = new Promise<void>((resolve) => { nightlyEntered = resolve })
    const claim = nightly.$transaction(
      async (tx) => {
        await lockGameForMaintenance(tx, fixture.gameId, 25_000)
        order.push("nightly-took-the-game")
        nightlyEntered()
      },
      { timeout: 30_000 }
    )

    // Give the claim a chance to succeed if it is going to. There is no signal
    // for "has not happened", so this one wait is unavoidable - but it only
    // ever makes the test weaker, never falsely strict.
    await Promise.race([nightlyDone, new Promise((r) => setTimeout(r, 500))])
    assert.deepEqual(
      order,
      ["gameplay-holds-the-lock"],
      "the nightly must not take the game while an action still holds it"
    )

    release!()
    await action
    await claim

    assert.deepEqual(order, [
      "gameplay-holds-the-lock",
      // Named for what it observes: the callback returned. The commit itself
      // happens after that, inside Prisma, and is what actually frees the lock.
      "gameplay-callback-returned",
      "nightly-took-the-game",
    ])
  } finally {
    await gameplay.$disconnect()
    await nightly.$disconnect()
  }
})

test("a lapsed lease does not let gameplay back in", { skip }, async () => {
  const { enterGameplay } = await import("../../trpc/src/maintenance.ts")
  const runId = await startNightly(fixture.gameId)
  try {
    await db.scheduledTaskRun.update({
      where: { id: runId },
      data: { leaseUntil: new Date(Date.now() - 60_000) },
    })
    await assert.rejects(
      db.$transaction(async (tx) => enterGameplay(tx, fixture.gameId), { timeout: 15_000 }),
      /GAME_UPDATE_IN_PROGRESS/,
      "a dead worker means recovery is needed, not that the game is open"
    )
  } finally {
    await db.scheduledTaskRun.delete({ where: { id: runId } })
  }

  await assert.doesNotReject(
    db.$transaction(async (tx) => enterGameplay(tx, fixture.gameId), { timeout: 15_000 })
  )
})

test("concurrent actions overlap on a bounded pool", { skip }, async () => {
  const { enterGameplay } = await import("../../trpc/src/maintenance.ts")

  // An explicit, small pool. The question is whether holding the game's lock
  // for the length of each transaction serialises them; a large pool could hide
  // that behind sheer capacity.
  const POOL = 8
  const CONCURRENT = 16
  const pooled = client({ max: POOL })

  try {
    const started = Date.now()
    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, (_, i) =>
        pooled.$transaction(
          async (tx) => {
            await enterGameplay(tx, fixture.gameId)
            await tx.$executeRaw`SELECT pg_sleep(0.1)`
            return i
          },
          { timeout: 30_000 }
        )
      )
    )
    const elapsed = Date.now() - started

    assert.equal(results.length, CONCURRENT, "every action must complete")
    // Serialised, this is 16 x 100ms. Overlapping within a pool of 8, about a
    // quarter of that. The bound is deliberately loose - it is there to catch
    // serialisation, not to measure the database.
    assert.ok(
      elapsed < CONCURRENT * 100,
      `${CONCURRENT} actions over a pool of ${POOL} took ${elapsed}ms - serialised rather than overlapping`
    )
  } finally {
    await pooled.$disconnect()
  }
})

test("a nightly gives up rather than waiting for ever", { skip }, async () => {
  const { enterGameplay, lockGameForMaintenance, GameplayDrainTimeout } = await import(
    "../../trpc/src/maintenance.ts"
  )
  const gameplay = client()
  const nightly = client()

  try {
    let lockHeld: () => void
    const holdingLock = new Promise<void>((resolve) => { lockHeld = resolve })
    let release: () => void
    const released = new Promise<void>((resolve) => { release = resolve })

    const action = gameplay.$transaction(
      async (tx) => {
        await enterGameplay(tx, fixture.gameId)
        lockHeld()
        await released
      },
      { timeout: 30_000 }
    )
    await holdingLock

    await assert.rejects(
      nightly.$transaction(async (tx) => lockGameForMaintenance(tx, fixture.gameId, 500), {
        timeout: 15_000,
      }),
      (error: unknown) => {
        assert.ok(
          error instanceof GameplayDrainTimeout,
          `expected a drain timeout, got ${(error as Error)?.message}`
        )
        return true
      }
    )

    release!()
    await action
  } finally {
    await gameplay.$disconnect()
    await nightly.$disconnect()
  }
})

test("concurrent mare returns pay once and transfer ownership once", { skip }, async () => {
  // The duplicate-grant race, through the real router.
  //
  // `returnMare` guards against paying twice with a unique grant id, and
  // recovers by checking whether the grant exists. That check used to run on
  // the transaction the collision had already aborted, where Postgres refuses
  // every further statement - so the loser surfaced a database error instead of
  // quietly agreeing the work was done.
  const { router, baseContext } = await import("../../trpc/src/trpc.ts")
  const { tutorialRouter } = await import("../../trpc/src/routers/tutorial.ts")

  const account = await db.playerAccount.findUniqueOrThrow({
    where: { id: fixture.playerAccountId },
    select: { id: true, userId: true },
  })
  assert.ok(account.userId, "the test account needs a user")

  // The breeder has to be somebody else, or "ownership was transferred" is
  // satisfied by changing nothing.
  const breeder = await db.playerAccount.findFirstOrThrow({
    where: { gameId: fixture.gameId, NOT: { id: account.id } },
    select: { id: true },
  })

  const [mare, stallion, embryo] = await db.animal.findMany({
    where: { gameId: fixture.gameId, playerAccountId: account.id, status: "ALIVE" },
    take: 3,
    select: { id: true },
  })
  assert.ok(mare && stallion && embryo, "three owned animals are needed for the pairing")

  const grantId = `tutorial-return-mare:${account.id}`
  const restore = async () => {
    await db.tutorialAnimalPair.deleteMany({ where: { playerAccountId: account.id } })
    await db.transaction.deleteMany({ where: { id: grantId } })
    await db.animal.update({ where: { id: mare.id }, data: { playerAccountId: account.id } })
  }

  await restore()
  await db.animal.update({ where: { id: mare.id }, data: { breederId: breeder.id } })
  await db.tutorialAnimalPair.create({
    data: {
      playerAccountId: account.id,
      ancestorOneId: mare.id,
      ancestorTwoId: stallion.id,
      embryoId: embryo.id,
    },
  })

  const before_ = await balanceOf()

  try {
    const caller = router({ tutorial: tutorialRouter }).createCaller(baseContext(account.userId!))

    // Released together, so every contender reads before any of them commits.
    // Starting them in sequence let the first finish first, and the rest then
    // returned early on the existing grant without the collision path ever
    // being entered - the test passed with the recovery deliberately broken.
    let go: () => void
    const start = new Promise<void>((resolve) => { go = resolve })
    const attempts = Array.from({ length: 8 }, async () => {
      await start
      return caller.tutorial.returnMare({ gameId: fixture.gameId })
    })
    go!()
    const outcomes = await Promise.allSettled(attempts)

    // Every outcome has to be one of two things. Anything else - a database
    // error, a crash, an aborted transaction - is a failure, where before only
    // three message patterns were rejected and everything else passed.
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") continue
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      assert.match(
        message,
        /already been returned/,
        `a concurrent return failed for an unexpected reason: ${message}`
      )
    }
    assert.ok(
      outcomes.some((o) => o.status === "fulfilled"),
      "at least one return must have succeeded"
    )

    assert.equal(
      await db.transaction.count({ where: { id: grantId } }),
      1,
      "the mare's return must be recorded exactly once"
    )

    const RETURN_AMOUNT = 300
    assert.equal(
      await balanceOf(),
      before_ + RETURN_AMOUNT,
      "the player must be paid exactly once, whatever the contention"
    )

    const returned = await db.animal.findUniqueOrThrow({
      where: { id: mare.id },
      select: { playerAccountId: true },
    })
    assert.equal(returned.playerAccountId, breeder.id, "the mare must go back to her breeder")
  } finally {
    await restore()
  }
})

// ---------------------------------------------------------------------------
// Waiting on a transaction without waiting for ever
// ---------------------------------------------------------------------------

/**
 * Hold a promise nobody is awaiting *yet*.
 *
 * Node reports a rejection that has no handler at the moment it rejects, so a
 * background transaction that fails while the test is still setting up takes
 * the whole run down with `ERR_UNHANDLED_REJECTION` - before the assertion that
 * would have explained it. Attaching a handler now swallows nothing: the
 * original promise is what gets awaited later, and it still throws there.
 */
function background<T>(work: Promise<T>): Promise<T> {
  work.catch(() => {})
  return work
}

/**
 * Wait for a signal sent from inside a transaction, or fail with whatever
 * stopped it reaching the point it was meant to signal from.
 *
 * Each test below hands a resolver to a background transaction and then waits
 * to be told it got somewhere - past the lock, past the read. If that
 * transaction rejects on the way, nothing ever resolves the signal: the helper
 * under test throwing, which is the thing these tests exist to catch, instead
 * reads as a suite that hangs forever with no output. Racing the two reports
 * the real error at the real moment.
 *
 * A transaction that *returns* without signalling is also a failure, and one
 * worth naming rather than waiting out.
 */
async function reached<T>(
  signal: Promise<void>,
  transaction: Promise<T>,
  point: string
): Promise<void> {
  const guard = background(
    transaction.then(() => {
      throw new Error(`the transaction returned without reaching ${point}`)
    })
  )
  await Promise.race([signal, guard])
}

/**
 * Ownership against a transfer, both ways round.
 *
 * `assertOwnsAnimal` locks the animal row with `SELECT ... FOR UPDATE`, and the
 * property it is meant to have is not "refuse whenever a transfer is nearby" -
 * an action that took the lock first is entitled to finish, and failing it
 * would be a bug of its own. The property is that **no decision rests on a read
 * taken outside the lock**, which only shows up as two different outcomes in
 * two different orderings.
 *
 * The cross-game half of the same helper - an owner of record whose account
 * lives in another game - needs no concurrency and is covered by
 * `packages/trpc/test/authorization-ownership.test.ts`.
 */

/** A second account in the fixture's game, to transfer the animal to. */
async function otherAccount(): Promise<{ id: string }> {
  const other = await db.playerAccount.findFirst({
    where: { gameId: fixture.gameId, id: { not: fixture.playerAccountId } },
    select: { id: true },
  })
  assert.ok(other, "this suite needs a second account in the fixture game to transfer to")
  return other
}

test("a transfer that commits first decides it, not the earlier read", { skip }, async () => {
  const { enterGameplay } = await import("../../trpc/src/maintenance.ts")
  const { assertOwnsAnimal } = await import("../../trpc/src/authz.ts")
  const other = await otherAccount()
  const gameplay = client()

  let opened!: () => void
  const hasRead = new Promise<void>((resolve) => { opened = resolve })
  let transferred!: () => void
  const transferDone = new Promise<void>((resolve) => { transferred = resolve })

  const action = background(
    gameplay.$transaction(
      async (tx) => {
        await enterGameplay(tx, fixture.gameId)
        // The stale read: taken before the transfer, outside any row lock, and
        // saying the animal is still the caller's.
        const early = await tx.animal.findUniqueOrThrow({
          where: { id: fixture.animalId },
          select: { playerAccountId: true },
        })
        assert.equal(early.playerAccountId, fixture.playerAccountId)
        opened()
        await transferDone

        // And the authorization, taken under the lock, which must disagree.
        await assertOwnsAnimal(tx as never, userId, fixture.animalId)
      },
      { timeout: 30_000 }
    )
  )

  try {
    await reached(hasRead, action, "the stale read")
    await db.animal.update({
      where: { id: fixture.animalId },
      data: { playerAccountId: other.id },
    })
    transferred()

    await assert.rejects(action, /do not own this animal/)
  } finally {
    // Release whatever the transaction is still waiting on and let it end
    // before the row is touched again. Resolving a settled barrier is a no-op,
    // so this costs nothing on the path where the test passed.
    transferred()
    await action.catch(() => {})
    await db.animal.update({
      where: { id: fixture.animalId },
      data: { playerAccountId: fixture.playerAccountId },
    })
    await gameplay.$disconnect()
  }
})

test("an action that took the lock first finishes, and the transfer waits", { skip }, async () => {
  const { enterGameplay } = await import("../../trpc/src/maintenance.ts")
  const { assertOwnsAnimal } = await import("../../trpc/src/authz.ts")
  const other = await otherAccount()
  const gameplay = client()
  const transferrer = client()

  const order: string[] = []
  let locked!: () => void
  const holdingRow = new Promise<void>((resolve) => { locked = resolve })
  let release!: () => void
  const released = new Promise<void>((resolve) => { release = resolve })
  let transfer: Promise<unknown> = Promise.resolve()

  const action = background(
    gameplay.$transaction(
      async (tx) => {
        await enterGameplay(tx, fixture.gameId)
        await assertOwnsAnimal(tx as never, userId, fixture.animalId)
        order.push("action-holds-the-row")
        locked()
        await released
        order.push("action-callback-returned")
      },
      { timeout: 30_000 }
    )
  )

  try {
    await reached(holdingRow, action, "the row lock")

    let moved!: () => void
    const transferDone = new Promise<void>((resolve) => { moved = resolve })
    transfer = background(
      transferrer.$transaction(
        async (tx) => {
          await tx.animal.update({
            where: { id: fixture.animalId },
            data: { playerAccountId: other.id },
          })
          order.push("transfer-committed")
          moved()
        },
        { timeout: 30_000 }
      )
    )

    // No signal exists for "has not happened", so one bounded wait. It can only
    // ever make this weaker, never falsely strict.
    await Promise.race([transferDone, new Promise((r) => setTimeout(r, 500))])
    assert.deepEqual(
      order,
      ["action-holds-the-row"],
      "the transfer must not move an animal an authorized action is holding"
    )

    release()
    await action
    await transfer

    assert.deepEqual(order, [
      "action-holds-the-row",
      "action-callback-returned",
      "transfer-committed",
    ])
  } finally {
    // That assertion runs while this transaction is holding the animal row, so
    // a failure must not skip the release: the restore below writes the same
    // row and would queue behind it until the transaction timed out, turning a
    // readable failure into a stalled suite.
    release()
    await action.catch(() => {})
    await transfer.catch(() => {})
    await db.animal.update({
      where: { id: fixture.animalId },
      data: { playerAccountId: fixture.playerAccountId },
    })
    await gameplay.$disconnect()
    await transferrer.$disconnect()
  }
})

/**
 * A role change cannot land while a rank decision is in flight.
 *
 * `requireRankOver` calls `lockStaffSubjects` before it reads, and that helper
 * makes a claim worth proving rather than asserting in a comment: **`FOR
 * UPDATE` on the `User` row blocks a `StaffRole` insert that has not happened
 * yet.** It does so indirectly - inserting a referencing row takes `FOR KEY
 * SHARE` on the referenced one to enforce the foreign key, and `FOR UPDATE`
 * conflicts with that - and no lock on `StaffRole` itself can stop a row that
 * does not exist. The second statement, over the `StaffRole` rows, stops the
 * opposite move: a revocation of a row that does.
 *
 * Both halves matter and they stop different things, so both are checked.
 *
 * These own their subject rather than borrowing one. An earlier draft took the
 * first user holding no staff role, which worked until a failing run left a row
 * behind - after which there was no such user, and the next run failed for that
 * reason instead of the one under test. A test that can consume the fixture it
 * depends on fails in a way that looks like a different bug.
 */
const LOCK_TEST_EMAIL = "authz-lock-test@example.invalid"

/** A user who exists only for one of these tests, cleaned up either way. */
async function withSubject(run: (userId: string) => Promise<void>): Promise<void> {
  await db.staffRole.deleteMany({ where: { user: { email: LOCK_TEST_EMAIL } } })
  await db.user.deleteMany({ where: { email: LOCK_TEST_EMAIL } })
  const subject = await db.user.create({
    data: { email: LOCK_TEST_EMAIL, emailVerified: true },
    select: { id: true },
  })
  try {
    await run(subject.id)
  } finally {
    await db.staffRole.deleteMany({ where: { userId: subject.id } })
    await db.user.delete({ where: { id: subject.id } })
  }
}

/**
 * Hold the subject locks for the length of `body`, then let go.
 *
 * Three things have to hold for a failure in here to be readable:
 *
 *   - **The wait for the locks must fail when the lock fails.** If
 *     `lockStaffSubjects` throws, nothing resolves `holding`, so the bug under
 *     test would present as a suite that never finishes. `reached` races the
 *     two and reports the throw.
 *   - **The release must happen whatever `body` did.** A failed assertion that
 *     skipped it would leave a connection holding row locks until the pool was
 *     torn down, with every later test queued behind them.
 *   - **The release path must not rethrow.** `body`'s failure is the one worth
 *     reading, and awaiting the transaction from a `finally` would replace it
 *     with whatever the rollback said.
 */
async function whileHoldingRanks(
  c: PrismaClient,
  userIds: string[],
  body: () => Promise<void>
): Promise<void> {
  const { lockStaffSubjects } = await import("../../trpc/src/authz.ts")
  let held!: () => void
  const holding = new Promise<void>((resolve) => { held = resolve })
  let release!: () => void
  const released = new Promise<void>((resolve) => { release = resolve })

  const transaction = background(
    c.$transaction(
      async (tx) => {
        await lockStaffSubjects(tx as never, userIds)
        held()
        await released
      },
      { timeout: 30_000 }
    )
  )

  try {
    await reached(holding, transaction, "the subject locks")
    await body()
  } catch (error) {
    release()
    // Wait for the locks to actually go before letting the failure out, and
    // say nothing about how the rollback went.
    await transaction.catch(() => {})
    throw error
  }
  release()
  await transaction
}

test("a promotion cannot land while the ranks are held", { skip }, async () => {
  await withSubject(async (subjectId) => {
    const holder = client()
    const promoter = client()
    const order: string[] = []
    // Outside the `try`, because the cleanup has to wait for it.
    let promotion: Promise<void> | null = null
    try {
      await whileHoldingRanks(holder, [subjectId], async () => {
        order.push("ranks-held")
        let promoted!: () => void
        const done = new Promise<void>((resolve) => { promoted = resolve })
        promotion = background(
          promoter.$transaction(
            async (tx) => {
              await tx.staffRole.create({
                data: { userId: subjectId, gameId: fixture.gameId, role: "MODERATOR" },
              })
              order.push("promotion-committed")
              promoted()
            },
            { timeout: 30_000 }
          )
        )

        // No signal exists for "has not happened", so one bounded wait. It can
        // only ever make this weaker, never falsely strict.
        await Promise.race([done, new Promise((r) => setTimeout(r, 500))])
        assert.deepEqual(
          order,
          ["ranks-held"],
          "a new staff role must not appear while a decision about this user is in flight"
        )
      })

      await promotion
      assert.deepEqual(order, ["ranks-held", "promotion-committed"])
    } finally {
      // The locks are already released by here, so this only waits for a
      // promotion that was queued behind them to finish - before the subject
      // it references is deleted.
      await (promotion as Promise<void> | null)?.catch(() => {})
      await holder.$disconnect()
      await promoter.$disconnect()
    }
  })
})

test("a revocation cannot land while the ranks are held", { skip }, async () => {
  await withSubject(async (subjectId) => {
    const holder = client()
    const revoker = client()
    const existing = await db.staffRole.create({
      data: { userId: subjectId, gameId: fixture.gameId, role: "MODERATOR" },
      select: { id: true },
    })
    const order: string[] = []
    // Outside the `try`, because the cleanup has to wait for it.
    let revocation: Promise<void> | null = null
    try {
      await whileHoldingRanks(holder, [subjectId], async () => {
        order.push("ranks-held")
        let done_!: () => void
        const done = new Promise<void>((resolve) => { done_ = resolve })
        revocation = background(
          revoker.$transaction(
            async (tx) => {
              await tx.staffRole.delete({ where: { id: existing.id } })
              order.push("revocation-committed")
              done_()
            },
            { timeout: 30_000 }
          )
        )

        await Promise.race([done, new Promise((r) => setTimeout(r, 500))])
        assert.deepEqual(
          order,
          ["ranks-held"],
          "a staff role must not be removed while a decision about this user is in flight"
        )
      })

      await revocation
      assert.deepEqual(order, ["ranks-held", "revocation-committed"])
    } finally {
      await (revocation as Promise<void> | null)?.catch(() => {})
      await holder.$disconnect()
      await revoker.$disconnect()
    }
  })
})
