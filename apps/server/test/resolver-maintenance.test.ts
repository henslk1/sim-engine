import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

/**
 * The competition resolver, against a game that is updating.
 *
 * The resolver is the one writer that is not a player request and not the
 * nightly, so it is the one that was never part of either's coordination. It
 * ran on its own timer with a status check in front of it, and that check was
 * narrower than the gameplay guard twice over - RUNNING only, and only with a
 * live lease - so it went on writing placements into games the guard was
 * refusing every mutation in.
 *
 * Narrowness was only half of it. A chunk is claimed in one moment and worked
 * over the next several seconds; a nightly starting in between took the game
 * while a resolution was halfway through it, and nothing made it wait. So each
 * resolution now opens through `enterGameplay` like any other write, and the
 * recheck under that lock is what these tests are about.
 *
 * A deferral is not a failure. The claim increments `attempt`, so handing an
 * item back has to undo that too - three closed games would otherwise retire a
 * competition as abandoned without it having been tried once.
 */

const GAME = "game-1"

type Work = {
  id: string
  competitionId: string
  gameId: string
  attempt: number
  status: string
  claimedBy: string | null
  startedAt: Date | null
  leaseUntil: Date | null
  completedAt: Date | null
  errorMessage: string | null
  createdAt: Date
}

const items: Work[] = []

/** Nightly runs, as the resolver's two different questions will see them. */
const state = {
  /** What `gamesInNightly` is told, per call, so a nightly can start mid-drain. */
  nightlyPerCall: [] as string[][],
  /** What the recheck inside the resolution transaction finds. */
  blocking: null as { id: string; startedAt: Date } | null,
}

let gamesInNightlyCalls = 0
let resolutionsAttempted = 0

function item(over: Partial<Work> & { id: string }): Work {
  return {
    competitionId: `competition-${over.id}`,
    gameId: GAME,
    attempt: 0,
    status: "PENDING",
    claimedBy: null,
    startedAt: null,
    leaseUntil: null,
    completedAt: null,
    errorMessage: null,
    createdAt: new Date("2026-11-02T03:00:00Z"),
    ...over,
  }
}

/** Only what the resolver asks: statuses, lease comparisons and id sets. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [field, condition] of Object.entries(where)) {
    if (field === "OR") {
      const branches = condition as Array<Record<string, unknown>>
      if (!branches.some((branch) => matches(row, branch))) return false
      continue
    }
    const value = row[field]
    if (condition === null) {
      if (value !== null) return false
    } else if (condition instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== condition.getTime()) return false
    } else if (typeof condition === "object") {
      const test = condition as Record<string, unknown>
      if ("in" in test) {
        if (!(test["in"] as unknown[]).includes(value)) return false
      } else if ("notIn" in test) {
        if ((test["notIn"] as unknown[]).includes(value)) return false
      } else if ("gte" in test) {
        if ((value as number) < (test["gte"] as number)) return false
      } else if ("lte" in test) {
        const limit = test["lte"] as Date
        if (!(value instanceof Date) || value.getTime() > limit.getTime()) return false
      } else {
        throw new Error(`unsupported condition on ${field}: ${JSON.stringify(condition)}`)
      }
    } else if (value !== condition) {
      return false
    }
  }
  return true
}

function applyData(row: Record<string, unknown>, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const change = value as Record<string, number>
      if ("increment" in change) {
        row[field] = (row[field] as number) + change["increment"]!
        continue
      }
      if ("decrement" in change) {
        row[field] = (row[field] as number) - change["decrement"]!
        continue
      }
    }
    row[field] = value
  }
}

const work = {
  findMany: async ({ where, take }: any) => {
    const found = items.filter((row) => matches(row as unknown as Record<string, unknown>, where))
    return (take ? found.slice(0, take) : found).map((row) => ({ ...row }))
  },
  updateMany: async ({ where, data }: any) => {
    const found = items.filter((row) => matches(row as unknown as Record<string, unknown>, where))
    for (const row of found) applyData(row as unknown as Record<string, unknown>, data)
    return { count: found.length }
  },
  updateManyAndReturn: async ({ where, data }: any) => {
    const found = items.filter((row) => matches(row as unknown as Record<string, unknown>, where))
    for (const row of found) applyData(row as unknown as Record<string, unknown>, data)
    return found.map((row) => ({ ...row }))
  },
}

const tx = {
  $executeRaw: async () => 1,
  $executeRawUnsafe: async () => 1,
  scheduledTaskRun: {
    // The recheck inside the resolution's own transaction.
    findFirst: async () =>
      state.blocking
        ? { id: state.blocking.id, startedAt: state.blocking.startedAt, claimedAt: null, scheduledFor: state.blocking.startedAt }
        : null,
  },
  competition: { findUnique: async () => ({ status: "OPEN" }) },
}

const db: any = {
  competitionResolutionWork: work,
  scheduledTaskRun: {
    // `gamesInNightly`.
    findMany: async () => {
      const call = gamesInNightlyCalls++
      const games = state.nightlyPerCall[Math.min(call, state.nightlyPerCall.length - 1)] ?? []
      return games.map((gameId) => ({ gameId }))
    },
    findFirst: tx.scheduledTaskRun.findFirst,
  },
  competition: { findUnique: async () => ({ status: "OPEN" }) },
  $transaction: async (fn: any) => {
    resolutionsAttempted++
    return fn(tx)
  },
}
Object.assign(globalThis, { prisma: db })

const { createResolver } = await import("../src/scheduler/resolver.ts")
const { gamesInNightly } = await import("../src/scheduler/competition-work.ts")

const NOW = new Date("2026-11-02T03:05:00Z")
const clock = { now: () => NOW }

beforeEach(() => {
  items.length = 0
  state.nightlyPerCall = [[]]
  state.blocking = null
  gamesInNightlyCalls = 0
  resolutionsAttempted = 0
})

test("a retrying nightly counts as an update in progress", async () => {
  // It was RUNNING-only, and a RETRYING nightly closes the game just as a
  // RUNNING one does - the work is incomplete and will be picked up again.
  state.blocking = null
  db.scheduledTaskRun.findMany = async ({ where }: any) => {
    assert.deepEqual(
      [...(where.status.in as string[])].sort(),
      ["RETRYING", "RUNNING"],
      "the resolver must hold back for exactly the statuses the guard refuses on"
    )
    return [{ gameId: GAME }]
  }
  try {
    assert.deepEqual(await gamesInNightly(NOW), [GAME])
  } finally {
    db.scheduledTaskRun.findMany = async () => {
      const call = gamesInNightlyCalls++
      const games = state.nightlyPerCall[Math.min(call, state.nightlyPerCall.length - 1)] ?? []
      return games.map((gameId) => ({ gameId }))
    }
  }
})

test("nothing in an updating game is claimed at all", async () => {
  items.push(item({ id: "w1" }))
  state.nightlyPerCall = [[GAME]]

  const totals = await createResolver({ instanceId: "test", clock }).drain()

  assert.deepEqual(totals, { resolved: 0, reconciled: 0, cancelled: 0, failed: 0, deferred: 0 })
  assert.equal(resolutionsAttempted, 0, "no resolution should have been opened")
  assert.equal(items[0]?.status, "PENDING")
  assert.equal(items[0]?.attempt, 0)
})

test("a nightly that starts after the claim defers the work rather than failing it", async () => {
  items.push(item({ id: "w1" }))
  // Clear at claim time, blocking by the time the resolution opens: the gap
  // the status check alone could never cover. The second pass sees it, which
  // is what stops the drain claiming it straight back.
  state.nightlyPerCall = [[], [GAME]]
  state.blocking = { id: "run-nightly", startedAt: NOW }

  const totals = await createResolver({ instanceId: "test", clock }).drain()

  assert.equal(totals.deferred, 1)
  assert.equal(totals.failed, 0, "a game being shut is not the competition's fault")
  assert.equal(resolutionsAttempted, 1, "it was claimed and opened before being refused")

  // Back exactly as it was. `attempt` especially: the claim incremented it, and
  // three closed games would otherwise retire a competition nobody ever tried.
  assert.equal(items[0]?.status, "PENDING")
  assert.equal(items[0]?.attempt, 0)
  assert.equal(items[0]?.claimedBy, null)
  assert.equal(items[0]?.leaseUntil, null)
  assert.equal(items[0]?.errorMessage, null)
})

test("deferring a competition that had already failed keeps its retry history", async () => {
  // The same interruption, on the item most likely to meet it: one that has
  // failed once and is waiting for another go. Everything the first version
  // put back was right, and everything it put back was also *too much* — it
  // sent this back as PENDING with no error, so an item that had already
  // failed came back looking as though it never had.
  items.push(
    item({
      id: "w1",
      status: "RETRYING",
      attempt: 1,
      errorMessage: "venue has no surface configured",
    })
  )
  state.nightlyPerCall = [[], [GAME]]
  state.blocking = { id: "run-nightly", startedAt: NOW }

  const totals = await createResolver({ instanceId: "test", clock }).drain()

  assert.equal(totals.deferred, 1)
  assert.equal(totals.failed, 0)

  assert.equal(items[0]?.status, "RETRYING", "it has failed before, and still has")
  assert.equal(items[0]?.attempt, 1, "the interrupted claim must not count as an attempt")
  assert.equal(
    items[0]?.errorMessage,
    "venue has no surface configured",
    "the reason the last real attempt failed is the one thing worth keeping"
  )
  assert.equal(items[0]?.claimedBy, null)
  assert.equal(items[0]?.leaseUntil, null)
})
