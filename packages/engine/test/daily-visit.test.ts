import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { currentGameDayStart, recordDailyVisitTx } from "../src/player/dailyVisit.ts"

/**
 * One active day, and one allowance, per player per game day.
 *
 * Two separate things have to hold. The first is what a game day *is*: it runs
 * from one completed nightly to the next, so a player and the nightly that
 * aged their animals always agree about which day it is. Not from one
 * configured nightly *time* to the next - that was the original rule, and it
 * handed out a day the moment the clock passed the configured minute, whether
 * or not anything had run.
 *
 * The second is that the day is claimed exactly once however many times the
 * player asks. That half is a conditional UPDATE, and the double below really
 * evaluates it against a real row - a double that just said "yes" would pass
 * whether or not the condition was there at all.
 */

const GAME = "game-1"
const PLAYER = "player-1"
const GOLD = "currency-gold"
const GEMS = "currency-gems"
const FEED = "item-feed"

/** A UTC instant, written the way the tests below think about them. */
const at = (iso: string) => new Date(iso)

/** Long before anything else here happens. */
const GAME_CREATED = at("2026-01-01T00:00:00Z")

type Run = {
  gameId: string
  taskType: string
  status: string
  completedAt: Date | null
}

type World = {
  seniority: { playerAccountId: string; activeDaysPlayed: number; lastActiveDateAt: Date | null } | null
  gameCreatedAt: Date
  runs: Run[]
  subscription: { isActive: boolean; pausedAt: Date | null; expiresAt: Date } | null
  currencyRows: { currencyDefId: string; amount: number; subscriberOnly: boolean; name: string; symbol: string | null }[]
  itemRows: { itemDefId: string; quantity: number; subscriberOnly: boolean; name: string }[]
  balances: { currencyDefId: string; balance: number }[]
  inventory: { itemDefId: string; quantity: number }[]
  transactions: { currencyDefId: string; amount: number; txnType: string; toPlayerAccountId: string }[]
}

let world: World

beforeEach(() => {
  world = {
    seniority: { playerAccountId: PLAYER, activeDaysPlayed: 3, lastActiveDateAt: null },
    gameCreatedAt: GAME_CREATED,
    runs: [],
    subscription: null,
    currencyRows: [{ currencyDefId: GOLD, amount: 100, subscriberOnly: false, name: "Gold", symbol: "G" }],
    itemRows: [],
    balances: [],
    inventory: [],
    transactions: [],
  }
})

/** The nightly finishes, which is the event that makes a new day. */
function nightlyCompleted(iso: string) {
  world.runs.push({ gameId: GAME, taskType: "NIGHTLY", status: "COMPLETED", completedAt: at(iso) })
}

/**
 * Only the queries `recordDailyVisitTx` actually makes.
 *
 * Two of them are applied rather than answered. The run lookup really filters
 * on game, task type and status and really sorts, because every one of those
 * is load-bearing and a double that returned the first row it had would pass
 * with any of them missing. The claim really evaluates the `where` it is handed
 * against the row, the way Postgres would.
 */
const tx = {
  scheduledTaskRun: {
    findFirst: async ({ where, orderBy }: any) => {
      // An absent key matches everything, as it would in a real query, so a
      // filter dropped from the source widens these results rather than
      // emptying them.
      const ceiling = where.completedAt ? (where.completedAt.lte as Date).getTime() : null
      const matches = world.runs.filter(
        (run) =>
          (where.gameId === undefined || run.gameId === where.gameId) &&
          (where.taskType === undefined || run.taskType === where.taskType) &&
          (where.status === undefined || run.status === where.status) &&
          run.completedAt !== null &&
          (ceiling === null || run.completedAt.getTime() <= ceiling)
      )
      const direction = orderBy?.completedAt === "asc" ? 1 : -1
      matches.sort((a, b) => direction * (a.completedAt!.getTime() - b.completedAt!.getTime()))
      return matches[0] ? { completedAt: matches[0].completedAt } : null
    },
  },
  game: {
    findUniqueOrThrow: async ({ where }: any) => {
      if (where.id !== GAME) throw new Error(`no game ${where.id}`)
      return { createdAt: world.gameCreatedAt }
    },
  },
  playerSeniority: {
    updateManyAndReturn: async ({ where, data }: any) => {
      const row = world.seniority
      if (!row || row.playerAccountId !== where.playerAccountId) return []

      const matches = (where.OR as any[]).some((clause) => {
        if (clause.lastActiveDateAt === null) return row.lastActiveDateAt === null
        const before = clause.lastActiveDateAt?.lt as Date | undefined
        if (before === undefined || row.lastActiveDateAt === null) return false
        return row.lastActiveDateAt.getTime() < before.getTime()
      })
      if (!matches) return []

      row.activeDaysPlayed += data.activeDaysPlayed.increment as number
      row.lastActiveDateAt = data.lastActiveDateAt as Date
      return [{ activeDaysPlayed: row.activeDaysPlayed }]
    },
    findUnique: async () =>
      world.seniority ? { activeDaysPlayed: world.seniority.activeDaysPlayed } : null,
  },
  playerSubscription: {
    findFirst: async ({ where }: any) => {
      const sub = world.subscription
      if (!sub) return null
      if (where.isActive && !sub.isActive) return null
      if (where.pausedAt === null && sub.pausedAt !== null) return null
      if (sub.expiresAt.getTime() <= (where.expiresAt.gt as Date).getTime()) return null
      return { id: "subscription-1" }
    },
  },
  dailyAllowanceCurrency: {
    findMany: async ({ where }: any) =>
      world.currencyRows
        .filter((r) => !("subscriberOnly" in where) || r.subscriberOnly === where.subscriberOnly)
        .map((r) => ({
          currencyDefId: r.currencyDefId,
          amount: r.amount,
          currencyDef: { name: r.name, symbol: r.symbol },
        })),
  },
  dailyAllowanceItem: {
    findMany: async ({ where }: any) =>
      world.itemRows
        .filter((r) => !("subscriberOnly" in where) || r.subscriberOnly === where.subscriberOnly)
        .map((r) => ({ itemDefId: r.itemDefId, quantity: r.quantity, itemDef: { name: r.name } })),
  },
  playerBalance: {
    upsert: async ({ where, create, update }: any) => {
      const id = where.playerAccountId_currencyDefId.currencyDefId as string
      const row = world.balances.find((b) => b.currencyDefId === id)
      if (row) row.balance += update.balance.increment as number
      else world.balances.push({ currencyDefId: id, balance: create.balance as number })
      return {}
    },
  },
  playerInventory: {
    upsert: async ({ where, create, update }: any) => {
      const id = where.playerAccountId_itemDefId.itemDefId as string
      const row = world.inventory.find((i) => i.itemDefId === id)
      if (row) row.quantity += update.quantity.increment as number
      else world.inventory.push({ itemDefId: id, quantity: create.quantity as number })
      return {}
    },
  },
  transaction: {
    create: async ({ data }: any) => {
      world.transactions.push(data)
      return data
    },
  },
}

type Tx = Parameters<typeof recordDailyVisitTx>[0]

const visit = (now: Date) =>
  recordDailyVisitTx(tx as unknown as Tx, { playerAccountId: PLAYER, gameId: GAME }, now)

const dayStart = (now: Date) => currentGameDayStart(tx as unknown as Tx, GAME, now)

// --------------------------------------------------------------------------
// What a game day is.
// --------------------------------------------------------------------------

test("the day begins when the nightly finished, not when it was due", async () => {
  // The run was due at 08:00 and finished at 08:13, which is the ordinary
  // case: the tick notices a boundary a little late, and the work takes time.
  nightlyCompleted("2026-01-15T08:13:00Z")

  assert.equal(
    (await dayStart(at("2026-01-15T08:05:00Z"))).toISOString(),
    GAME_CREATED.toISOString(),
    "at 08:05 the run had not finished, so the previous day was still running"
  )
  assert.equal(
    (await dayStart(at("2026-01-15T08:20:00Z"))).toISOString(),
    "2026-01-15T08:13:00.000Z"
  )
})

test("a nightly that is late, running, retrying or failed has not begun a day", async () => {
  // Every status a run can be in that is not COMPLETED, including the two that
  // stamp `completedAt` anyway. FAILED is the dangerous one: the game reopens
  // to players with nothing having aged.
  for (const status of ["PENDING", "RUNNING", "RETRYING", "FAILED", "CANCELLED"]) {
    world.runs = [{ gameId: GAME, taskType: "NIGHTLY", status, completedAt: at("2026-01-15T08:13:00Z") }]
    assert.equal(
      (await dayStart(at("2026-01-15T09:00:00Z"))).toISOString(),
      GAME_CREATED.toISOString(),
      `a ${status} run started a day`
    )
  }

  // And a game whose nightly simply has not been materialized yet - no row at
  // all, which is what the configured minute passing actually looks like.
  world.runs = []
  assert.equal(
    (await dayStart(at("2026-01-15T09:00:00Z"))).toISOString(),
    GAME_CREATED.toISOString()
  )
})

test("some other task completing is not a nightly", async () => {
  world.runs = [
    { gameId: GAME, taskType: "COMPETITION_SWEEP", status: "COMPLETED", completedAt: at("2026-01-15T09:00:00Z") },
    { gameId: GAME, taskType: "SHOP_ROTATION", status: "COMPLETED", completedAt: at("2026-01-15T10:00:00Z") },
  ]

  assert.equal(
    (await dayStart(at("2026-01-15T11:00:00Z"))).toISOString(),
    GAME_CREATED.toISOString(),
    "sweeps run hourly; a day each would be a dozen allowances"
  )
})

test("another game's nightly is another game's day", async () => {
  world.runs = [
    { gameId: "game-2", taskType: "NIGHTLY", status: "COMPLETED", completedAt: at("2026-01-15T08:00:00Z") },
  ]

  assert.equal(
    (await dayStart(at("2026-01-15T09:00:00Z"))).toISOString(),
    GAME_CREATED.toISOString()
  )
})

test("the newest completion is the one that counts", async () => {
  // Written oldest first, so returning whatever came to hand would be right by
  // accident; and a catch-up can put two completions minutes apart.
  nightlyCompleted("2026-01-13T08:02:00Z")
  nightlyCompleted("2026-01-15T08:04:00Z")
  nightlyCompleted("2026-01-14T08:11:00Z")

  assert.equal(
    (await dayStart(at("2026-01-15T12:00:00Z"))).toISOString(),
    "2026-01-15T08:04:00.000Z"
  )
})

test("a completion stamped after this visit does not move the day", async () => {
  // Two processes, two clocks. A run recorded a few seconds ahead of the one
  // this visit was given must not retire a day the player has not finished.
  nightlyCompleted("2026-01-14T08:00:00Z")
  nightlyCompleted("2026-01-15T08:00:00Z")

  assert.equal(
    (await dayStart(at("2026-01-15T07:59:59Z"))).toISOString(),
    "2026-01-14T08:00:00.000Z"
  )
})

test("a game that has never completed a nightly is in its first day", async () => {
  // The explicit initial-day rule. Without it a new game would owe nobody
  // anything until its first night ran, which for a game created in the
  // morning is most of a day.
  world.gameCreatedAt = at("2026-01-15T10:00:00Z")

  assert.equal(
    (await dayStart(at("2026-01-15T10:30:00Z"))).toISOString(),
    "2026-01-15T10:00:00.000Z"
  )

  const first = await visit(at("2026-01-15T10:30:00Z"))
  assert.equal(first.claimed, true, "the first players of a new game are owed their first day")

  const second = await visit(at("2026-01-15T22:00:00Z"))
  assert.equal(second.claimed, false, "and only one, until a nightly has run")
})

// --------------------------------------------------------------------------
// Claiming the day. Once.
// --------------------------------------------------------------------------

test("a player who has never visited claims their first day", async () => {
  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.equal(result.claimed, true)
  assert.equal(result.activeDaysPlayed, 4)
  assert.deepEqual(world.balances, [{ currencyDefId: GOLD, balance: 100 }])
})

test("a second visit the same day claims nothing and grants nothing", async () => {
  await visit(at("2026-01-15T12:00:00Z"))
  const again = await visit(at("2026-01-15T23:00:00Z"))

  assert.equal(again.claimed, false)
  assert.equal(again.activeDaysPlayed, 4, "the count is reported, not advanced")
  assert.deepEqual(again.granted, { currencies: [], items: [] })
  assert.deepEqual(world.balances, [{ currencyDefId: GOLD, balance: 100 }], "paid once")
  assert.equal(world.transactions.length, 1)
})

test("a refresh a second later is a second visit, and is refused the same way", async () => {
  const first = await visit(at("2026-01-15T12:00:00Z"))
  const refresh = await visit(at("2026-01-15T12:00:01Z"))

  assert.equal(first.claimed, true)
  assert.equal(refresh.claimed, false)
  assert.equal(world.balances[0]!.balance, 100)
})

test("the configured time passing is not a new day; the nightly finishing is", async () => {
  // The reproduction, in claim terms. A player who was here yesterday evening
  // comes back the next morning. The nightly was due at 08:00 and the
  // scheduler has not run it yet.
  await visit(at("2026-01-14T20:00:00Z"))
  assert.equal(world.balances[0]!.balance, 100)

  const early = await visit(at("2026-01-15T08:05:00Z"))
  assert.equal(early.claimed, false, "nothing has aged, so there is no new day to claim")
  assert.equal(world.balances[0]!.balance, 100)
  assert.equal(world.transactions.length, 1)

  // It runs at 08:13.
  nightlyCompleted("2026-01-15T08:13:00Z")

  const after = await visit(at("2026-01-15T08:15:00Z"))
  assert.equal(after.claimed, true)
  assert.equal(after.activeDaysPlayed, 5)
  assert.equal(world.balances[0]!.balance, 200, "one grant, on the first visit after the run")

  const again = await visit(at("2026-01-15T08:16:00Z"))
  assert.equal(again.claimed, false, "and only one")
  assert.equal(world.balances[0]!.balance, 200)
})

test("a visit that claims nothing leaves the marker where it was", async () => {
  // It has to: writing `now` on a refused visit would push the player's last
  // active date forward past the completion that was about to pay them.
  await visit(at("2026-01-14T20:00:00Z"))
  await visit(at("2026-01-15T08:05:00Z"))

  assert.deepEqual(world.seniority!.lastActiveDateAt, at("2026-01-14T20:00:00Z"))
})

test("a nightly that failed and then succeeded pays for one day, not two", async () => {
  await visit(at("2026-01-14T20:00:00Z"))

  world.runs.push({
    gameId: GAME,
    taskType: "NIGHTLY",
    status: "FAILED",
    completedAt: at("2026-01-15T08:10:00Z"),
  })
  assert.equal((await visit(at("2026-01-15T08:11:00Z"))).claimed, false)

  nightlyCompleted("2026-01-15T08:40:00Z")
  assert.equal((await visit(at("2026-01-15T08:41:00Z"))).claimed, true)
  assert.equal((await visit(at("2026-01-15T08:42:00Z"))).claimed, false)

  assert.equal(world.balances[0]!.balance, 200)
})

test("two nightlies in quick succession are two days", async () => {
  // A nightly that overran its own next boundary. Two nights of aging happened,
  // minutes apart, and a player who was there for both played both.
  await visit(at("2026-01-14T20:00:00Z"))

  nightlyCompleted("2026-01-15T09:00:00Z")
  assert.equal((await visit(at("2026-01-15T09:05:00Z"))).claimed, true)

  nightlyCompleted("2026-01-15T09:30:00Z")
  assert.equal((await visit(at("2026-01-15T09:35:00Z"))).claimed, true)

  assert.equal(world.balances[0]!.balance, 300)
})

test("a player with no seniority record is a fault, not a quiet day", async () => {
  world.seniority = null
  await assert.rejects(
    () => visit(at("2026-01-15T12:00:00Z")),
    /has no seniority record/,
    "returning `claimed: false` would deny this account its allowance for ever, silently"
  )
})

// --------------------------------------------------------------------------
// What the day is worth.
// --------------------------------------------------------------------------

test("currencies and items are both granted, and the ledger records the currency", async () => {
  world.itemRows = [{ itemDefId: FEED, quantity: 2, subscriberOnly: false, name: "Feed" }]

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.deepEqual(world.balances, [{ currencyDefId: GOLD, balance: 100 }])
  assert.deepEqual(world.inventory, [{ itemDefId: FEED, quantity: 2 }])
  assert.deepEqual(world.transactions, [
    { gameId: GAME, toPlayerAccountId: PLAYER, currencyDefId: GOLD, amount: 100, txnType: "DAILY_ALLOWANCE" },
  ])
  assert.deepEqual(result.granted.items, [{ itemDefId: FEED, name: "Feed", quantity: 2 }])
})

test("a row configured at zero is a row that is switched off", async () => {
  world.currencyRows = [{ currencyDefId: GOLD, amount: 0, subscriberOnly: false, name: "Gold", symbol: "G" }]
  world.itemRows = [{ itemDefId: FEED, quantity: 0, subscriberOnly: false, name: "Feed" }]

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.equal(result.claimed, true, "the day is still played")
  assert.deepEqual(world.balances, [])
  assert.deepEqual(world.transactions, [], "a transaction recording nothing is worse than none")
  assert.deepEqual(result.granted, { currencies: [], items: [] })
})

test("a game that configures no allowance still counts the day", async () => {
  world.currencyRows = []

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.equal(result.claimed, true)
  assert.equal(result.activeDaysPlayed, 4)
  assert.deepEqual(result.granted, { currencies: [], items: [] })
})

// --------------------------------------------------------------------------
// Subscribers.
// --------------------------------------------------------------------------

test("a subscriber-only row is invisible to everybody else", async () => {
  world.currencyRows.push({ currencyDefId: GEMS, amount: 5, subscriberOnly: true, name: "Gems", symbol: null })

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.deepEqual(world.balances, [{ currencyDefId: GOLD, balance: 100 }])
  assert.deepEqual(result.granted.currencies.map((c) => c.name), ["Gold"])
})

test("a subscriber receives the open rows as well as their own", async () => {
  world.subscription = { isActive: true, pausedAt: null, expiresAt: at("2027-01-01T00:00:00Z") }
  world.currencyRows.push({ currencyDefId: GEMS, amount: 5, subscriberOnly: true, name: "Gems", symbol: null })

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.deepEqual(world.balances, [
    { currencyDefId: GOLD, balance: 100 },
    { currencyDefId: GEMS, balance: 5 },
  ])
  assert.deepEqual(result.granted.currencies.map((c) => c.name), ["Gold", "Gems"])
})

test("two rows for one currency are paid separately and shown as one", async () => {
  // A subscriber bonus on a currency the open allowance already pays. The
  // ledger keeps them apart, because they are two pieces of configuration; the
  // player is told what their balance actually did.
  world.subscription = { isActive: true, pausedAt: null, expiresAt: at("2027-01-01T00:00:00Z") }
  world.currencyRows.push({ currencyDefId: GOLD, amount: 50, subscriberOnly: true, name: "Gold", symbol: "G" })

  const result = await visit(at("2026-01-15T12:00:00Z"))

  assert.deepEqual(world.balances, [{ currencyDefId: GOLD, balance: 150 }])
  assert.deepEqual(world.transactions.map((t) => t.amount), [100, 50])
  assert.deepEqual(result.granted.currencies, [
    { currencyDefId: GOLD, name: "Gold", symbol: "G", amount: 150 },
  ])
})

test("an expired or paused subscription is not a subscription", async () => {
  world.currencyRows.push({ currencyDefId: GEMS, amount: 5, subscriberOnly: true, name: "Gems", symbol: null })

  world.subscription = { isActive: true, pausedAt: null, expiresAt: at("2026-01-01T00:00:00Z") }
  assert.deepEqual((await visit(at("2026-01-15T12:00:00Z"))).granted.currencies.map((c) => c.name), ["Gold"])

  nightlyCompleted("2026-01-16T08:00:00Z")
  world.subscription = { isActive: true, pausedAt: at("2026-01-10T00:00:00Z"), expiresAt: at("2027-01-01T00:00:00Z") }
  assert.deepEqual((await visit(at("2026-01-16T12:00:00Z"))).granted.currencies.map((c) => c.name), ["Gold"])

  nightlyCompleted("2026-01-17T08:00:00Z")
  world.subscription = { isActive: false, pausedAt: null, expiresAt: at("2027-01-01T00:00:00Z") }
  assert.deepEqual((await visit(at("2026-01-17T12:00:00Z"))).granted.currencies.map((c) => c.name), ["Gold"])
})
