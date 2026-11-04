/**
 * The first time a player opens a game each day.
 *
 * Two things are owed on that visit and nowhere else: an active day on their
 * seniority record, and the game's configured daily allowance. Both have been
 * configurable and displayable for a long time without anything granting them -
 * the admin screen writes `DailyAllowanceCurrency` and `DailyAllowanceItem`,
 * the profile reads `activeDaysPlayed`, and in between there was nothing.
 *
 * What "each day" means is the subject of `currentGameDayStart` below, and it
 * is not the clock.
 *
 * ## Why one function and not two
 *
 * They are the same event. A day is "played" exactly when the player turns up
 * in it, and the allowance is what turning up earns, so a design where the two
 * are decided separately is a design where they can disagree - a player with
 * four active days and five allowances, or the reverse, and no way to tell
 * which number is wrong. Here there is one decision, taken once, and the
 * allowance is granted only on the visit that claimed the day.
 *
 * ## Why the claim is an UPDATE and not a read
 *
 * A player refreshes. A player opens three tabs. A request times out on the
 * client and is retried while the first one is still running. None of those may
 * pay twice, and checking `lastActiveDateAt` and then writing it would let all
 * three: under READ COMMITTED every one of them reads the old value.
 *
 * So the claim is a conditional UPDATE - `lastActiveDateAt` is both the thing
 * being read and the thing being written, in one statement. Postgres locks the
 * row, and re-evaluates the `where` after any wait, so the second tab's update
 * matches nothing and reports zero rows. That is the duplicate protection, and
 * it lives in the database rather than in this file.
 *
 * Everything after it runs on the same transaction, so an allowance that fails
 * to be granted takes the claim down with it and the day is still there to be
 * claimed.
 */

import type { Prisma } from "@sim-engine/db"

type Tx = Prisma.TransactionClient

/** What a visit handed over, for the player to be shown. */
export type DailyAllowanceGrant = {
  currencies: { currencyDefId: string; name: string; symbol: string | null; amount: number }[]
  items: { itemDefId: string; name: string; quantity: number }[]
}

export type DailyVisitResult = {
  /** True only on the visit that claimed today. Every later one is false. */
  claimed: boolean
  /** After this visit, whether or not it claimed. */
  activeDaysPlayed: number
  /** Empty unless `claimed`. */
  granted: DailyAllowanceGrant
}

const NOTHING: DailyAllowanceGrant = { currencies: [], items: [] }

/**
 * When the game day the player is standing in began.
 *
 * Not the configured nightly time. That time is when the run falls *due*, and
 * a due time is a promise rather than an event: the tick that materializes it
 * can be a minute late, the run can queue behind another game's, it can take
 * half an hour, and it can fail and be retried. Reading the day off the clock
 * declared a new one the moment the configured minute passed, so a player who
 * visited in the gap collected tomorrow's allowance against today's unaged
 * world - and then had nothing left to claim when the nightly actually ran.
 *
 * So a day is identified by the run that produced it: the most recent NIGHTLY
 * run this game has **completed**. COMPLETED is the runner's word for "the
 * handler returned and none of its work failed". A run that is PENDING,
 * RUNNING or RETRYING has not produced a day yet, and one that is FAILED or
 * CANCELLED never will - which is why the status is in the `where` and not
 * just the timestamp, because `completedAt` is stamped on those two as well.
 *
 * `completedAt` rather than `scheduledFor` because the question a visit is
 * asking is "has a nightly finished since I was last here", and because a
 * nightly that overruns its own next boundary produces two completions in
 * quick succession - two nights of aging, and so two days. Comparing
 * boundaries instead would quietly drop the second.
 */
export async function currentGameDayStart(tx: Tx, gameId: string, now: Date): Promise<Date> {
  const completed = await tx.scheduledTaskRun.findFirst({
    where: {
      gameId,
      taskType: "NIGHTLY",
      status: "COMPLETED",
      // A range rather than `not: null`, which this client rejects outright on
      // a nullable column. It earns its place twice over: it also keeps a
      // completion stamped ahead of this visit - a clock that disagrees with
      // itself across processes - from moving the day.
      completedAt: { lte: now },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  })
  if (completed?.completedAt) return completed.completedAt

  // The initial day, stated rather than left to fall out of something else. A
  // game that has never completed a nightly is in its first day, and that day
  // began when the game did. The alternative - no completed run, so no day -
  // would deny every player of a new game their first allowance until its
  // first night had run.
  const game = await tx.game.findUniqueOrThrow({
    where: { id: gameId },
    select: { createdAt: true },
  })
  return game.createdAt
}

/**
 * Whether the player's subscription is paying out right now.
 *
 * Paused is deliberately not active. A paused subscription is one the player is
 * not being charged for, and an allowance it kept paying would be a free
 * subscription for anybody who worked out how to pause one.
 */
async function isSubscribed(tx: Tx, playerAccountId: string, now: Date): Promise<boolean> {
  const active = await tx.playerSubscription.findFirst({
    where: { playerAccountId, isActive: true, pausedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  })
  return active !== null
}

/**
 * Claim today for this player, and grant what today is worth.
 *
 * Safe to call on every page load: all but the first call of each game day
 * change nothing and return `claimed: false`.
 *
 * `now` is a parameter so that a test can hand it any instant, including the
 * two minutes a year the clocks change.
 */
export async function recordDailyVisitTx(
  tx: Tx,
  input: { playerAccountId: string; gameId: string },
  now: Date = new Date()
): Promise<DailyVisitResult> {
  const { playerAccountId, gameId } = input

  // The game's own day, not the server's. A player in Sydney and a player in
  // Chicago are in the same game day as each other and as the nightly that
  // aged their animals, because all three are on the far side of one run
  // finishing. Time zones do not come into it: this is one instant compared
  // with another.
  const dayStart = await currentGameDayStart(tx, gameId, now)

  // The claim. `lastActiveDateAt` before the start of the current game day
  // means this day has not been claimed; null means the player has never
  // visited. Writing `now` is what closes the door behind this visit.
  const claimed = await tx.playerSeniority.updateManyAndReturn({
    where: {
      playerAccountId,
      OR: [{ lastActiveDateAt: null }, { lastActiveDateAt: { lt: dayStart } }],
    },
    data: { activeDaysPlayed: { increment: 1 }, lastActiveDateAt: now },
    select: { activeDaysPlayed: true },
  })

  if (claimed.length !== 1) {
    const seniority = await tx.playerSeniority.findUnique({
      where: { playerAccountId },
      select: { activeDaysPlayed: true },
    })
    // Zero rows normally means today is already claimed. It can also mean the
    // player has no seniority record at all, which `player.create` makes in the
    // same transaction as the account - so it is a broken account rather than a
    // quiet day, and silently never paying an allowance again is the one
    // outcome that must not be the default.
    if (!seniority) {
      throw new Error(`Player account ${playerAccountId} has no seniority record`)
    }
    return { claimed: false, activeDaysPlayed: seniority.activeDaysPlayed, granted: NOTHING }
  }

  const activeDaysPlayed = claimed[0]!.activeDaysPlayed

  // Subscriber rows are *additional*, as the admin screen says: a subscriber
  // receives the open rows and the subscriber-only rows both. So the filter is
  // on who may see a row, not on which set to take.
  const subscribed = await isSubscribed(tx, playerAccountId, now)
  const onlyOpenRows = subscribed ? {} : { subscriberOnly: false }

  const [currencyRows, itemRows] = await Promise.all([
    tx.dailyAllowanceCurrency.findMany({
      where: { gameId, ...onlyOpenRows },
      select: {
        currencyDefId: true,
        amount: true,
        currencyDef: { select: { name: true, symbol: true } },
      },
    }),
    tx.dailyAllowanceItem.findMany({
      where: { gameId, ...onlyOpenRows },
      select: { itemDefId: true, quantity: true, itemDef: { select: { name: true } } },
    }),
  ])

  const currencies = new Map<string, DailyAllowanceGrant["currencies"][number]>()
  for (const row of currencyRows) {
    // A row configured at zero is a row an administrator has turned off. Paying
    // it would write a transaction recording that nothing happened.
    if (row.amount <= 0) continue

    await tx.playerBalance.upsert({
      where: { playerAccountId_currencyDefId: { playerAccountId, currencyDefId: row.currencyDefId } },
      create: { playerAccountId, currencyDefId: row.currencyDefId, balance: row.amount },
      update: { balance: { increment: row.amount } },
    })
    // One transaction per configured row rather than one per currency, so the
    // ledger shows the open allowance and the subscriber's separately. What the
    // player is *told* is the total, which is the next few lines.
    await tx.transaction.create({
      data: {
        gameId,
        toPlayerAccountId: playerAccountId,
        currencyDefId: row.currencyDefId,
        amount: row.amount,
        txnType: "DAILY_ALLOWANCE",
      },
    })

    const shown = currencies.get(row.currencyDefId)
    if (shown) {
      shown.amount += row.amount
    } else {
      currencies.set(row.currencyDefId, {
        currencyDefId: row.currencyDefId,
        name: row.currencyDef.name,
        symbol: row.currencyDef.symbol,
        amount: row.amount,
      })
    }
  }

  const items = new Map<string, DailyAllowanceGrant["items"][number]>()
  for (const row of itemRows) {
    if (row.quantity <= 0) continue

    await tx.playerInventory.upsert({
      where: { playerAccountId_itemDefId: { playerAccountId, itemDefId: row.itemDefId } },
      create: { playerAccountId, itemDefId: row.itemDefId, quantity: row.quantity },
      update: { quantity: { increment: row.quantity } },
    })

    const shown = items.get(row.itemDefId)
    if (shown) {
      shown.quantity += row.quantity
    } else {
      items.set(row.itemDefId, {
        itemDefId: row.itemDefId,
        name: row.itemDef.name,
        quantity: row.quantity,
      })
    }
  }

  return {
    claimed: true,
    activeDaysPlayed,
    granted: { currencies: [...currencies.values()], items: [...items.values()] },
  }
}
