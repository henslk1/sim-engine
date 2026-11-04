import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * One active day and one allowance per player per game day, however hard the
 * player tries.
 *
 * The formula - which day it is, what a day is worth, who counts as a
 * subscriber - is settled in `packages/engine/test/daily-visit.test.ts` without
 * a database anywhere near it. What cannot be settled there is the claim
 * itself. It is a conditional UPDATE, and the thing that makes it safe is that
 * Postgres locks the row and re-evaluates the `where` after the wait, so the
 * second of two simultaneous visits matches nothing. A test double has no lock
 * and cannot be wrong about this; only a database can.
 *
 * So this runs the real route, eight times at once, and checks that one day was
 * claimed and one allowance paid.
 *
 * The second thing only a database can settle is which day it is, because that
 * is now a question about `ScheduledTaskRun` rows: a day begins when a nightly
 * run *completes*, not when the configured minute passes. The last test here
 * walks one night through being late, running, failing and finally succeeding,
 * and checks that exactly one grant comes out of it - at the end.
 *
 * ## Running it
 *
 *     pnpm test:visit:db
 *
 * It needs its own database, because it writes. By default that is the one
 * named in `DATABASE_URL` with the name replaced by `sim_engine_conc` - the
 * same scratch copy the other database suites use - and `VISIT_DATABASE_URL`
 * points it somewhere else.
 */

const ENABLED = process.env["RUN_DATABASE_TESTS"] === "1"
const EXPECTED_DB = "sim_engine_conc"

function targetUrl(): string {
  const explicit = process.env["VISIT_DATABASE_URL"]
  if (explicit) return explicit

  const base = process.env["DATABASE_URL"]
  if (!base) throw new Error("neither VISIT_DATABASE_URL nor DATABASE_URL is set")

  const url = new URL(base)
  url.pathname = `/${EXPECTED_DB}`
  return url.toString()
}

/** Parsed rather than searched: the name could sit in a password, and this writes. */
function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "")
}

let db: PrismaClient
let URL_: string

const skip = ENABLED ? false : "set RUN_DATABASE_TESTS=1 to run the daily visit suite"

/** Names are unique enough to find again, and are how cleanup knows what is ours. */
const MARK = "daily-visit-integration-test"

/** How many visits arrive at once. One is the point; eight is the proof. */
const CONTENDERS = 8

let fixture: {
  gameId: string
  playerAccountId: string
  userId: string
  /** The subscriber-only row the player must not receive. */
  subscriberCurrencyRowId: string
  subscriberCurrencyDefId: string
  /** Its amount before this suite raised it, or null if this suite created it. */
  subscriberCurrencyWas: number | null
  /** The open item row this suite adds, so there is always something to grant. */
  itemRowId: string
  itemDefId: string
  /** The game's NIGHTLY task, which the run rows below have to hang off. */
  nightlyTaskId: string
  /** True if this suite created that task row, and so owns deleting it. */
  nightlyTaskCreated: boolean
  before: {
    activeDaysPlayed: number
    lastActiveDateAt: Date | null
    nightlyRunHour: number
    nightlyRunMinute: number
    balances: { currencyDefId: string; balance: number }[]
    inventory: { itemDefId: string; quantity: number } | null
    transactionIds: string[]
  }
}

before(async () => {
  if (!ENABLED) return

  URL_ = targetUrl()

  // Enabled but pointed somewhere else is an error, not a reason to skip.
  const named = databaseName(URL_)
  assert.equal(
    named,
    EXPECTED_DB,
    `refusing to run against "${named}" - this suite writes and expects ${EXPECTED_DB}`
  )

  process.env["DATABASE_URL"] = URL_
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_ }) })

  const [current] = await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
  assert.equal(current!.db, EXPECTED_DB, "connected to the wrong database")

  const game = await db.game.findFirstOrThrow({ select: { id: true } })
  const account = await db.playerAccount.findFirstOrThrow({
    where: { gameId: game.id, seniority: { isNot: null } },
    select: {
      id: true,
      userId: true,
      seniority: { select: { activeDaysPlayed: true, lastActiveDateAt: true } },
    },
  })
  assert.ok(account.userId, "the test account needs a user to call the route as")

  // A currency nobody here subscribes for, and an item, both configured by this
  // suite. The item is so that there is always something to grant even in a
  // game with no currency allowance; the subscriber row is so that the filter
  // is tested against a real row rather than against its absence.
  const currencies = await db.currencyDef.findMany({
    where: { gameId: game.id },
    take: 1,
    select: { id: true },
  })
  const item = await db.itemDef.findFirstOrThrow({ where: { gameId: game.id }, select: { id: true } })

  // A conspicuous amount on a subscriber-only row, so that a filter which let
  // it through would be unmissable in the balance. Raised for the length of the
  // suite and put back in `after` if it was already configured - a test that
  // tidies away somebody else's configuration is worse than one that leaves a
  // mess, because the mess is at least visible.
  const SUBSCRIBER_ONLY_AMOUNT = 999
  const existingSubscriberRow = await db.dailyAllowanceCurrency.findUnique({
    where: {
      gameId_currencyDefId_subscriberOnly: {
        gameId: game.id,
        currencyDefId: currencies[0]!.id,
        subscriberOnly: true,
      },
    },
    select: { id: true, amount: true },
  })
  const subscriberRow = existingSubscriberRow
    ? await db.dailyAllowanceCurrency.update({
        where: { id: existingSubscriberRow.id },
        data: { amount: SUBSCRIBER_ONLY_AMOUNT },
        select: { id: true },
      })
    : await db.dailyAllowanceCurrency.create({
        data: {
          gameId: game.id,
          currencyDefId: currencies[0]!.id,
          amount: SUBSCRIBER_ONLY_AMOUNT,
          subscriberOnly: true,
        },
        select: { id: true },
      })

  const itemRow = await db.dailyAllowanceItem.create({
    data: { gameId: game.id, itemDefId: item.id, quantity: 3, subscriberOnly: false },
    select: { id: true },
  })

  // Nobody in this scratch copy subscribes, and the subscriber row above only
  // means anything if that stays true for the length of the suite.
  assert.equal(
    await db.playerSubscription.count({ where: { playerAccountId: account.id, isActive: true } }),
    0,
    "this suite assumes the test account is not a subscriber"
  )

  // The run rows this suite writes are all within the last few minutes, and
  // they are only the newest completion if nothing else already is.
  const recentNightly = await db.scheduledTaskRun.findFirst({
    where: {
      gameId: game.id,
      taskType: "NIGHTLY",
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - 60 * 60_000) },
    },
    select: { completedAt: true },
  })
  assert.equal(
    recentNightly,
    null,
    "this suite writes its own nightly history for the last hour, and something else is already in it"
  )

  const existingTask = await db.scheduledTask.findUnique({
    where: { gameId_taskType: { gameId: game.id, taskType: "NIGHTLY" } },
    select: { id: true },
  })
  const nightlyTask =
    existingTask ??
    (await db.scheduledTask.create({
      data: { gameId: game.id, taskType: "NIGHTLY", nextRunAt: new Date(), enabled: false },
      select: { id: true },
    }))

  const schedule = await db.gameConfig.findUniqueOrThrow({
    where: { gameId: game.id },
    select: { nightlyRunHour: true, nightlyRunMinute: true },
  })

  fixture = {
    gameId: game.id,
    playerAccountId: account.id,
    userId: account.userId!,
    nightlyTaskId: nightlyTask.id,
    nightlyTaskCreated: existingTask === null,
    subscriberCurrencyRowId: subscriberRow.id,
    subscriberCurrencyDefId: currencies[0]!.id,
    subscriberCurrencyWas: existingSubscriberRow?.amount ?? null,
    itemRowId: itemRow.id,
    itemDefId: item.id,
    before: {
      activeDaysPlayed: account.seniority!.activeDaysPlayed,
      lastActiveDateAt: account.seniority!.lastActiveDateAt,
      nightlyRunHour: schedule.nightlyRunHour,
      nightlyRunMinute: schedule.nightlyRunMinute,
      balances: await db.playerBalance.findMany({
        where: { playerAccountId: account.id },
        select: { currencyDefId: true, balance: true },
      }),
      inventory: await db.playerInventory.findUnique({
        where: { playerAccountId_itemDefId: { playerAccountId: account.id, itemDefId: item.id } },
        select: { itemDefId: true, quantity: true },
      }),
      transactionIds: (
        await db.transaction.findMany({
          where: { toPlayerAccountId: account.id, txnType: "DAILY_ALLOWANCE" },
          select: { id: true },
        })
      ).map((t) => t.id),
    },
  }
})

after(async () => {
  if (!ENABLED || !fixture) {
    if (db) await db.$disconnect()
    return
  }

  // The item row was created here, so it goes. The subscriber row may not have
  // been, in which case only its amount was borrowed.
  await db.dailyAllowanceItem.delete({ where: { id: fixture.itemRowId } })
  if (fixture.subscriberCurrencyWas === null) {
    await db.dailyAllowanceCurrency.delete({ where: { id: fixture.subscriberCurrencyRowId } })
  } else {
    await db.dailyAllowanceCurrency.update({
      where: { id: fixture.subscriberCurrencyRowId },
      data: { amount: fixture.subscriberCurrencyWas },
    })
  }

  await db.transaction.deleteMany({
    where: {
      toPlayerAccountId: fixture.playerAccountId,
      txnType: "DAILY_ALLOWANCE",
      ...(fixture.before.transactionIds.length > 0
        ? { id: { notIn: fixture.before.transactionIds } }
        : {}),
    },
  })

  for (const balance of fixture.before.balances) {
    await db.playerBalance.update({
      where: {
        playerAccountId_currencyDefId: {
          playerAccountId: fixture.playerAccountId,
          currencyDefId: balance.currencyDefId,
        },
      },
      data: { balance: balance.balance },
    })
  }

  if (fixture.before.inventory) {
    await db.playerInventory.update({
      where: {
        playerAccountId_itemDefId: {
          playerAccountId: fixture.playerAccountId,
          itemDefId: fixture.itemDefId,
        },
      },
      data: { quantity: fixture.before.inventory.quantity },
    })
  } else {
    await db.playerInventory.deleteMany({
      where: { playerAccountId: fixture.playerAccountId, itemDefId: fixture.itemDefId },
    })
  }

  await db.playerSeniority.update({
    where: { playerAccountId: fixture.playerAccountId },
    data: {
      activeDaysPlayed: fixture.before.activeDaysPlayed,
      lastActiveDateAt: fixture.before.lastActiveDateAt,
    },
  })

  // The nightly history this suite invented, and the configured time it moved
  // to make the point. Both go back before anything else looks at this game.
  if (createdRunIds.length > 0) {
    await db.scheduledTaskRun.deleteMany({ where: { id: { in: createdRunIds } } })
  }
  if (fixture.nightlyTaskCreated) {
    await db.scheduledTask.delete({ where: { id: fixture.nightlyTaskId } })
  }
  await db.gameConfig.update({
    where: { gameId: fixture.gameId },
    data: {
      nightlyRunHour: fixture.before.nightlyRunHour,
      nightlyRunMinute: fixture.before.nightlyRunMinute,
    },
  })

  await db.$disconnect()
})

/** Run rows this suite invented, so `after` can take them away again. */
const createdRunIds: string[] = []

/**
 * One nightly run for this game, in whatever state the test needs it.
 *
 * `scheduledFor` is what the boundary was; `completedAt` is what the day
 * actually turns on. They are different arguments here because the whole point
 * of the test below is that they are different instants.
 */
async function nightlyRun(input: {
  scheduledFor: Date
  status: "RUNNING" | "RETRYING" | "FAILED" | "COMPLETED"
  completedAt?: Date
}): Promise<string> {
  const run = await db.scheduledTaskRun.create({
    data: {
      taskId: fixture.nightlyTaskId,
      gameId: fixture.gameId,
      taskType: "NIGHTLY",
      scheduledFor: input.scheduledFor,
      status: input.status,
      claimedBy: MARK,
      claimedAt: input.scheduledFor,
      startedAt: input.scheduledFor,
      completedAt: input.completedAt ?? null,
    },
    select: { id: true },
  })
  createdRunIds.push(run.id)
  return run.id
}

/**
 * Configure this game's nightly for the wall-clock minute `instant` falls on,
 * in the game's own zone.
 *
 * Used to put the configured time a few minutes in the past, which is the
 * input to the bug: the minute passes, and under the old rule that alone was a
 * new day.
 */
async function setNightlyTimeTo(instant: Date) {
  const { gameTimeZone } = await db.gameConfig.findUniqueOrThrow({
    where: { gameId: fixture.gameId },
    select: { gameTimeZone: true },
  })
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: gameTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant)
  const read = (type: string) => Number(parts.find((p) => p.type === type)!.value)

  await db.gameConfig.update({
    where: { gameId: fixture.gameId },
    // `hour12: false` reports midnight as 24 in some ICU builds.
    data: { nightlyRunHour: read("hour") % 24, nightlyRunMinute: read("minute") },
  })
}

/**
 * The other half of a nightly ending: tell this process the game is open.
 *
 * The runner does exactly this in its `finally`, and it has to, because the
 * guard answers a hint less than ten seconds old without asking the database.
 * A test that only writes the run row has ended the nightly in the database
 * and not in the process reading it.
 */
async function reopenGameplay() {
  const { setGameMaintenance } = await import("../../trpc/src/maintenance.ts")
  setGameMaintenance(fixture.gameId, null)
}

/** The route, called as the player. */
async function caller() {
  const { router, baseContext } = await import("../../trpc/src/trpc.ts")
  const { playerRouter } = await import("../../trpc/src/routers/player.ts")
  return router({ player: playerRouter }).createCaller(baseContext(fixture.userId))
}

/** What a non-subscriber is owed today, read straight from the configuration. */
async function owed() {
  const [currencies, items] = await Promise.all([
    db.dailyAllowanceCurrency.findMany({
      where: { gameId: fixture.gameId, subscriberOnly: false },
      select: { currencyDefId: true, amount: true },
    }),
    db.dailyAllowanceItem.findMany({
      where: { gameId: fixture.gameId, subscriberOnly: false },
      select: { itemDefId: true, quantity: true },
    }),
  ])

  const byCurrency = new Map<string, number>()
  for (const row of currencies) {
    if (row.amount <= 0) continue
    byCurrency.set(row.currencyDefId, (byCurrency.get(row.currencyDefId) ?? 0) + row.amount)
  }
  const byItem = new Map<string, number>()
  for (const row of items) {
    if (row.quantity <= 0) continue
    byItem.set(row.itemDefId, (byItem.get(row.itemDefId) ?? 0) + row.quantity)
  }
  return { byCurrency, byItem, currencyRows: currencies.filter((c) => c.amount > 0).length }
}

const seniority = async () =>
  db.playerSeniority.findUniqueOrThrow({
    where: { playerAccountId: fixture.playerAccountId },
    select: { activeDaysPlayed: true, lastActiveDateAt: true },
  })

const balanceOf = async (currencyDefId: string): Promise<number> =>
  (
    await db.playerBalance.findUnique({
      where: {
        playerAccountId_currencyDefId: { playerAccountId: fixture.playerAccountId, currencyDefId },
      },
      select: { balance: true },
    })
  )?.balance ?? 0

const quantityOf = async (itemDefId: string): Promise<number> =>
  (
    await db.playerInventory.findUnique({
      where: {
        playerAccountId_itemDefId: { playerAccountId: fixture.playerAccountId, itemDefId },
      },
      select: { quantity: true },
    })
  )?.quantity ?? 0

const allowanceTransactions = async (): Promise<number> =>
  db.transaction.count({
    where: {
      toPlayerAccountId: fixture.playerAccountId,
      txnType: "DAILY_ALLOWANCE",
      ...(fixture.before.transactionIds.length > 0
        ? { id: { notIn: fixture.before.transactionIds } }
        : {}),
    },
  })

test("eight simultaneous visits claim one day between them", { skip }, async () => {
  // Start from a player who has not been seen today.
  await db.playerSeniority.update({
    where: { playerAccountId: fixture.playerAccountId },
    data: { activeDaysPlayed: 0, lastActiveDateAt: null },
  })

  const expected = await owed()
  assert.ok(
    expected.byCurrency.size > 0 || expected.byItem.size > 0,
    "the game must owe something for this test to be about anything"
  )

  const startingBalances = new Map<string, number>()
  for (const currencyDefId of expected.byCurrency.keys()) {
    startingBalances.set(currencyDefId, await balanceOf(currencyDefId))
  }
  const startingItems = new Map<string, number>()
  for (const itemDefId of expected.byItem.keys()) {
    startingItems.set(itemDefId, await quantityOf(itemDefId))
  }

  const route = await caller()

  // Released together, so every contender reads before any of them commits.
  // Starting them in sequence would let the first finish first and the rest
  // return early on a claim that was already visible - which is the behaviour
  // being tested, examined after the fact instead of during.
  let go: () => void
  const start = new Promise<void>((resolve) => { go = resolve })
  const attempts = Array.from({ length: CONTENDERS }, async () => {
    await start
    return route.player.visit({ gameId: fixture.gameId })
  })
  go!()
  const outcomes = await Promise.allSettled(attempts)

  // Every outcome has to be a result. A rejection here would mean the losers
  // surface a database error instead of quietly agreeing the day was claimed.
  for (const outcome of outcomes) {
    assert.equal(
      outcome.status,
      "fulfilled",
      `a concurrent visit failed: ${outcome.status === "rejected" ? String(outcome.reason) : ""}`
    )
  }

  const claims = outcomes.filter(
    (o) => o.status === "fulfilled" && o.value !== null && o.value.claimed
  )
  assert.equal(claims.length, 1, "exactly one of eight simultaneous visits may claim the day")

  const after_ = await seniority()
  assert.equal(after_.activeDaysPlayed, 1, "one day played, whatever the contention")
  assert.ok(after_.lastActiveDateAt, "the claim has to record when it happened")

  for (const [currencyDefId, amount] of expected.byCurrency) {
    assert.equal(
      await balanceOf(currencyDefId),
      startingBalances.get(currencyDefId)! + amount,
      "the allowance must be paid exactly once"
    )
  }
  for (const [itemDefId, quantity] of expected.byItem) {
    assert.equal(
      await quantityOf(itemDefId),
      startingItems.get(itemDefId)! + quantity,
      "the items must be handed over exactly once"
    )
  }
  assert.equal(
    await allowanceTransactions(),
    expected.currencyRows,
    "one ledger entry per configured row, and no more"
  )

  // The subscriber-only row is configured at 999 on a currency this player has
  // no subscription for. If the filter were on the row rather than on who may
  // see it, that would be unmissable in the balance above - this names it.
  const subscriberOnly = await db.transaction.count({
    where: {
      toPlayerAccountId: fixture.playerAccountId,
      txnType: "DAILY_ALLOWANCE",
      amount: 999,
    },
  })
  assert.equal(subscriberOnly, 0, "a non-subscriber was paid a subscriber-only allowance")
})

test("a visit later the same day changes nothing", { skip }, async () => {
  const before_ = await seniority()
  const expected = await owed()
  const startingBalances = new Map<string, number>()
  for (const currencyDefId of expected.byCurrency.keys()) {
    startingBalances.set(currencyDefId, await balanceOf(currencyDefId))
  }

  const route = await caller()
  const result = await route.player.visit({ gameId: fixture.gameId })

  assert.equal(result?.claimed, false)
  assert.deepEqual(result?.granted, { currencies: [], items: [] })

  const after_ = await seniority()
  assert.equal(after_.activeDaysPlayed, before_.activeDaysPlayed)
  assert.deepEqual(
    after_.lastActiveDateAt,
    before_.lastActiveDateAt,
    "a visit that claims nothing must not move the marker either, or it would push the day out for ever"
  )
  for (const [currencyDefId] of expected.byCurrency) {
    assert.equal(await balanceOf(currencyDefId), startingBalances.get(currencyDefId)!)
  }
})

test("the day turns over when the nightly completes, not when it was due", { skip }, async () => {
  // The reproduction. The configured time came round, the scheduler was late,
  // and the allowance was handed out anyway - against a world that had not
  // aged, leaving nothing to claim once the nightly actually ran.
  //
  // Everything below is one night, walked through in the order it happened.
  const now = Date.now()
  const ago = (minutes: number) => new Date(now - minutes * 60_000)

  // Last night finished at 02:00-ish and the player has been in since.
  await nightlyRun({ scheduledFor: ago(20), status: "COMPLETED", completedAt: ago(10) })
  await db.playerSeniority.update({
    where: { playerAccountId: fixture.playerAccountId },
    data: { lastActiveDateAt: ago(9) },
  })

  // Tonight's configured time is now five minutes in the past - after the
  // player's last visit, which is exactly what the old rule read as a new day.
  await setNightlyTimeTo(ago(5))

  const before_ = await seniority()
  const expected = await owed()
  assert.ok(
    expected.byCurrency.size > 0 || expected.byItem.size > 0,
    "the game must owe something for this test to be about anything"
  )
  const startingBalances = new Map<string, number>()
  for (const currencyDefId of expected.byCurrency.keys()) {
    startingBalances.set(currencyDefId, await balanceOf(currencyDefId))
  }

  const route = await caller()

  const unchanged = async (why: string) => {
    const after_ = await seniority()
    assert.equal(after_.activeDaysPlayed, before_.activeDaysPlayed, why)
    assert.deepEqual(after_.lastActiveDateAt, before_.lastActiveDateAt, why)
    for (const [currencyDefId] of expected.byCurrency) {
      assert.equal(await balanceOf(currencyDefId), startingBalances.get(currencyDefId)!, why)
    }
  }

  // 1. Late. The minute has passed and nothing has been materialized yet,
  //    which is what the player sees as "the update hasn't started".
  const late = await route.player.visit({ gameId: fixture.gameId })
  assert.equal(late?.claimed, false, "the configured minute passed, but no night has been had")
  await unchanged("a day was granted before the nightly ran")

  // 2. Running. The game is shut, and the visit is refused rather than
  //    answered - the same refusal every other mutation gets.
  const run = await nightlyRun({ scheduledFor: ago(5), status: "RUNNING" })
  await assert.rejects(
    () => route.player.visit({ gameId: fixture.gameId }),
    /GAME_UPDATE_IN_PROGRESS/,
    "a visit during the update has to be refused, not quietly granted"
  )
  await unchanged("a day was granted during the nightly")

  // 3. Failed. The game is open again and nothing aged, which is the state
  //    most likely to be mistaken for a new day.
  await db.scheduledTaskRun.update({
    where: { id: run },
    data: { status: "FAILED", completedAt: ago(3), errorMessage: MARK },
  })
  await reopenGameplay()
  const failed = await route.player.visit({ gameId: fixture.gameId })
  assert.equal(failed?.claimed, false, "a nightly that gave up did not produce a day")
  await unchanged("a day was granted by a failed nightly")

  // 4. Completed, on the retry. Now there is a new day.
  await nightlyRun({ scheduledFor: ago(2), status: "COMPLETED", completedAt: ago(1) })

  const granted = await route.player.visit({ gameId: fixture.gameId })
  assert.equal(granted?.claimed, true, "the first visit after the run is the one that pays")
  assert.equal((await seniority()).activeDaysPlayed, before_.activeDaysPlayed + 1)
  for (const [currencyDefId, amount] of expected.byCurrency) {
    assert.equal(await balanceOf(currencyDefId), startingBalances.get(currencyDefId)! + amount)
  }

  // And one grant, not one per visit.
  const again = await route.player.visit({ gameId: fixture.gameId })
  assert.equal(again?.claimed, false)
  assert.equal((await seniority()).activeDaysPlayed, before_.activeDaysPlayed + 1)
  for (const [currencyDefId, amount] of expected.byCurrency) {
    assert.equal(await balanceOf(currencyDefId), startingBalances.get(currencyDefId)! + amount)
  }
})
