import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

/**
 * What one tick does: which runs it starts, and who it tells.
 *
 * Two things are held here. The first is isolation - one game, one run at a
 * time, across instances and not merely within one - which the planner cannot
 * guarantee on its own because every instance plans from its own snapshot.
 *
 * The second is the announcement. Everything that *decides* anything reads the
 * run row - the middleware guard, the advisory lock, the banner's query - so
 * the announcement is only the thing that shortens the wait before somebody
 * reads it again, which is why those tests are about when one is sent and
 * never about what it contains.
 *
 * The three announcement properties worth holding:
 *
 *   - it is sent at both ends of a nightly, and the start is sent *after* the
 *     run is RUNNING in the database. Announcing first would send every client
 *     to ask a question whose answer is still "open", and the answer they got
 *     would be the one they kept until the next poll - which is the whole
 *     problem the event was meant to solve;
 *   - a tick announces a transition this process did not cause, and does not
 *     re-announce the one it did. A nightly on another instance, or one whose
 *     worker died without reaching its `finally`, is otherwise invisible until
 *     somebody polls;
 *   - an announcement that fails cannot fail the run. Aging ten thousand
 *     animals must not be recorded as a failure because a socket was not
 *     listening.
 *
 * The scheduler is driven through its real `tick`, against an in-memory stand-in
 * for the three tables it touches. The handler is injected, so this is the
 * claiming, leasing and finishing path without a nightly attached to it.
 */

const GAME = "game-1"
const OTHER_GAME = "game-2"

type Run = {
  id: string
  taskId: string
  gameId: string
  taskType: string
  scheduledFor: Date
  status: string
  claimedBy: string | null
  claimedAt: Date | null
  startedAt: Date | null
  heartbeatAt: Date | null
  leaseUntil: Date | null
  completedAt: Date | null
  errorMessage: string | null
  attempt: number
}

const runs: Run[] = []
const tasks: Array<{ id: string; gameId: string; taskType: string; enabled: boolean; nextRunAt: Date }> = []
const games: string[] = []
/** Pre-claim snapshots, served in order to the next per-game reads. */
let staleRuns: Run[][] = []

function makeRun(over: Partial<Run> & { id: string; gameId: string }): Run {
  return {
    taskId: `task-${over.gameId}`,
    taskType: "NIGHTLY",
    scheduledFor: new Date("2026-11-02T03:00:00Z"),
    status: "PENDING",
    claimedBy: null,
    claimedAt: null,
    startedAt: null,
    heartbeatAt: null,
    leaseUntil: null,
    completedAt: null,
    errorMessage: null,
    attempt: 0,
    ...over,
  }
}

/**
 * Enough of Prisma's `where` to answer what the scheduler actually asks.
 *
 * Narrow on purpose: `claimableWhere` is an OR of three status-and-lease
 * shapes, and the claim and the finish are both compare-and-swaps. Anything
 * this does not understand throws rather than matching, so a query that grows
 * a new condition fails loudly here instead of quietly matching everything.
 */
function matches(run: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [field, condition] of Object.entries(where)) {
    if (field === "OR") {
      const branches = condition as Array<Record<string, unknown>>
      if (!branches.some((branch) => matches(run, branch))) return false
      continue
    }

    const value = run[field]
    if (condition === null) {
      if (value !== null) return false
    } else if (condition instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== condition.getTime()) return false
    } else if (typeof condition === "object") {
      const test = condition as Record<string, unknown>
      if ("in" in test) {
        if (!(test["in"] as unknown[]).includes(value)) return false
      } else if ("not" in test) {
        if (value === test["not"]) return false
      } else if ("lte" in test) {
        const limit = test["lte"] as Date
        if (!(value instanceof Date) || value.getTime() > limit.getTime()) return false
      } else if ("gt" in test) {
        const limit = test["gt"] as Date
        if (!(value instanceof Date) || value.getTime() <= limit.getTime()) return false
      } else {
        throw new Error(`unsupported condition on ${field}: ${JSON.stringify(condition)}`)
      }
    } else if (value !== condition) {
      return false
    }
  }
  return true
}

function applyData(run: Record<string, unknown>, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !(value instanceof Date) && "increment" in value) {
      run[field] = (run[field] as number) + (value as { increment: number }).increment
      continue
    }
    run[field] = value
  }
}

const db = {
  game: {
    findMany: async () => games.map((id) => ({ id, gameConfig: config })),
  },
  scheduledTask: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      // Two callers, told apart by the one condition only the due query carries.
      "nextRunAt" in where ? [] : tasks,
    create: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  scheduledTaskRun: {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      // A game's working set, served from a snapshot taken before another
      // instance claimed. That is the only way to reproduce two schedulers
      // planning from the same stale view of one game - the race the per-game
      // claim lock exists for. Queued rather than flagged, so a test can
      // choose whether the *refresh* after a lost claim is stale as well.
      //
      // Only the per-game reads: `syncMaintenance` names a task type and no
      // game, and must always see the truth.
      const stale = "gameId" in where ? staleRuns.shift() : undefined
      return (stale ?? runs).filter((run) => matches(run as unknown as Record<string, unknown>, where))
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      runs.find((run) => matches(run as unknown as Record<string, unknown>, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) =>
      runs.find((run) => run.id === where.id) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const found = runs.filter((run) => matches(run as unknown as Record<string, unknown>, where))
      for (const run of found) applyData(run as unknown as Record<string, unknown>, data)
      return { count: found.length }
    },
    create: async () => ({}),
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
}

// The claim's transaction client. The advisory lock is a raw statement, and
// nothing in these tests contends for it.
const tx = {
  $executeRaw: async () => 1,
  $executeRawUnsafe: async () => 1,
  scheduledTaskRun: db.scheduledTaskRun,
}

Object.assign(globalThis, { prisma: db })

const config = {
  nightlyRunHour: 3,
  nightlyRunMinute: 0,
  gameTimeZone: "UTC",
  competitionSweepMinutes: 30,
  shopRotationMinutes: 60,
}

const { createScheduler } = await import("../src/scheduler/runner.ts")
const { syncGameMaintenance } = await import("@sim-engine/trpc")

const NOW = new Date("2026-11-02T03:05:00Z")
const clock = { now: () => NOW }

/** Every announcement, with the run status the database held at the time. */
let announced: Array<{ gameId: string; statusInDatabase: string | null }> = []

function announceMaintenance(gameId: string): void {
  announced.push({
    gameId,
    statusInDatabase: runs.find((run) => run.gameId === gameId)?.status ?? null,
  })
}

/**
 * A scheduler with nothing real underneath it.
 *
 * `handlers` is what makes that true - the nightly never runs - while the
 * claim, the lease, the finish and the reconciliation are the production path.
 */
function scheduler(
  over: {
    announceMaintenance?: (gameId: string) => void
    instanceId?: string
    nightly?: () => Promise<Record<string, number>>
    sweep?: () => Promise<Record<string, number>>
  } = {}
) {
  return createScheduler({
    clock,
    instanceId: over.instanceId ?? "test-instance",
    announceMaintenance: over.announceMaintenance ?? announceMaintenance,
    handlers: {
      NIGHTLY: over.nightly ?? (async () => ({ processedCount: 1, succeededCount: 1 })),
      COMPETITION_SWEEP: over.sweep ?? (async () => ({})),
      SHOP_ROTATION: async () => ({}),
    },
  })
}

/**
 * How long any of these may wait for the scheduler to get somewhere.
 *
 * Every wait here is for something that happens in milliseconds against an
 * in-memory store, so this is slack rather than a budget. It exists because
 * node's test runner has no timeout of its own by default: a handler that is
 * never reached used to mean the file sat there for ten minutes until
 * something outside killed it, with nothing said about what it had been
 * waiting for.
 */
const WAIT_MS = 5_000

/** Fail promptly, and say what never happened. */
function within<T>(promise: Promise<T>, what: string, ms = WAIT_MS): Promise<T> {
  let timer: NodeJS.Timeout
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms waiting for: ${what}`)), ms)
    // The test process must not be held open by a wait that is going to fail.
    timer.unref()
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}

/** A handler that stops where the test wants it and waits to be let go. */
function gate(what: string) {
  let reached = () => {}
  const arrived = new Promise<void>((resolve) => { reached = resolve })
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  return {
    /** Resolves when the handler is reached, and rejects if it never is. */
    arrived: within(arrived, `the ${what} handler to start`),
    release: () => release(),
    handler: async () => {
      reached()
      await held
      return { processedCount: 1, succeededCount: 1 }
    },
  }
}

/**
 * A backstop under every test in this file.
 *
 * `within` above names what a known wait was waiting for, which is the useful
 * message. This is for everything else: node's runner has no timeout of its
 * own by default, so anything that hangs for a reason nobody anticipated hangs
 * for ever. Generous enough that a slow machine never trips it.
 */
const TEST_OPTIONS = { timeout: 30_000 }

beforeEach(() => {
  runs.length = 0
  tasks.length = 0
  games.length = 0
  staleRuns = []
  announced = []
  // The hint map is module state in `@sim-engine/trpc`, shared by every test
  // in this process. An entry left by one would refuse gameplay in the next.
  syncGameMaintenance([])

  games.push(GAME)
  tasks.push({ id: `task-${GAME}`, gameId: GAME, taskType: "NIGHTLY", enabled: true, nextRunAt: new Date("2026-11-03T03:00:00Z") })
})

/**
 * The reproduction, step for step.
 *
 * Instance A and instance B both read the game's runs - a nightly and a
 * competition sweep, both PENDING - before either claimed anything. A claims
 * the nightly. B's claim of the nightly then fails, which is the only thing
 * the old loop learned from it: it dropped that run from its own list and
 * carried on down a plan that no longer had the blocker in it, so the next
 * thing it saw was the sweep, still PENDING, and it claimed and ran that.
 *
 * `staleRuns` is the pre-claim snapshot, served to B so it plans from the same
 * view it would have had in the race.
 */
function twoRunsPending(): Run[] {
  runs.push(makeRun({ id: "run-nightly", gameId: GAME }))
  runs.push(
    makeRun({
      id: "run-sweep",
      gameId: GAME,
      taskType: "COMPETITION_SWEEP",
      scheduledFor: new Date("2026-11-02T03:00:00Z"),
    })
  )
  // A copy, taken now, which is what B would have read a moment before A claimed.
  return runs.map((run) => ({ ...run }))
}

test("a second instance does not start a sweep in a game whose nightly is running", TEST_OPTIONS, async () => {
  const snapshot = twoRunsPending()

  const nightly = gate("blocking nightly")
  const running = scheduler({ instanceId: "instance-a", nightly: nightly.handler }).tick()
  await nightly.arrived

  // B plans from before the claim, and so tries the nightly first.
  staleRuns = [snapshot]
  const sweepsRun: string[] = []
  await scheduler({
    instanceId: "instance-b",
    sweep: async () => {
      sweepsRun.push(GAME)
      return {}
    },
  }).tick()

  assert.deepEqual(sweepsRun, [], "the sweep must wait for the nightly to finish")
  assert.equal(runs.find((run) => run.id === "run-sweep")?.status, "PENDING")

  nightly.release()
  await within(running, "instance A's tick to finish")
})

test("a stale refresh is still refused by the claim itself", TEST_OPTIONS, async () => {
  // The same race, tightened: B's re-read after losing the nightly is stale
  // too, so it offers up the sweep exactly as before. Refreshing the plan is
  // the courtesy; the check inside the claim transaction is the guarantee, and
  // this is the test that can tell them apart.
  const snapshot = twoRunsPending()

  const nightly = gate("blocking nightly")
  const running = scheduler({ instanceId: "instance-a", nightly: nightly.handler }).tick()
  await nightly.arrived

  staleRuns = [snapshot, snapshot, snapshot, snapshot]
  const sweepsRun: string[] = []
  await scheduler({
    instanceId: "instance-b",
    sweep: async () => {
      sweepsRun.push(GAME)
      return {}
    },
  }).tick()

  assert.deepEqual(sweepsRun, [], "no snapshot B could hold may let it into a busy game")
  assert.equal(runs.find((run) => run.id === "run-sweep")?.status, "PENDING")

  nightly.release()
  await within(running, "instance A's tick to finish")
})

test("a run abandoned by a dead process does not block the game for ever", TEST_OPTIONS, async () => {
  // The complement of the check above: "something else is running" has to mean
  // a live lease, or one crashed worker would shut its game permanently.
  runs.push(
    makeRun({
      id: "run-abandoned",
      gameId: GAME,
      taskType: "COMPETITION_SWEEP",
      status: "RUNNING",
      claimedBy: "a-process-that-died",
      startedAt: new Date(NOW.getTime() - 600_000),
      leaseUntil: new Date(NOW.getTime() - 300_000),
    })
  )
  runs.push(makeRun({ id: "run-nightly", gameId: GAME }))

  await scheduler().tick()

  // Both ran: the abandoned sweep was reclaimed, and the nightly was not held
  // back by a lease nobody was renewing.
  assert.equal(runs.find((run) => run.id === "run-nightly")?.status, "COMPLETED")
  assert.equal(runs.find((run) => run.id === "run-abandoned")?.status, "COMPLETED")
})

test("a game that throws while draining is counted and named", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  // A failure with nowhere local to go: this read sits between the claim and
  // `execute`, so nothing catches it and nothing can be recorded against the
  // run. The shape of a schema the code disagrees with, which is how this was
  // found - a missing column left the run PENDING for ever while `/health`
  // said `ok` and `lastTickError` said null.
  const findUnique = db.scheduledTaskRun.findUnique
  db.scheduledTaskRun.findUnique = async () => {
    throw Object.assign(new Error('column "duration_ms" does not exist'), { code: "P2022" })
  }

  const broken = scheduler()
  try {
    const summary = await broken.tick()
    assert.equal(summary.gameErrors, 1, "the tick should report that a game failed")
    const health = broken.getHealth()
    assert.equal(health.gameErrorCount, 1)
    assert.equal(health.lastGameError?.gameId, GAME)
    assert.match(health.lastGameError?.message ?? "", /duration_ms/)
    assert.equal(runs[0]?.status, "RUNNING", "the run is left claimed, which is why this has to be visible")
  } finally {
    db.scheduledTaskRun.findUnique = findUnique
  }
})

test("a nightly announces its game as it starts and again as it ends", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  await scheduler().tick()

  assert.deepEqual(
    announced.map((entry) => entry.gameId),
    [GAME, GAME],
    "once for the door closing, once for it opening"
  )
})

test("the start is announced only once the run is RUNNING in the database", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  await scheduler().tick()

  // The point of the ordering: a client that asks on hearing this is told the
  // game is shut. Announcing before the claim committed would hand it "open",
  // and that is the answer it would keep until the next poll.
  assert.equal(announced[0]?.statusInDatabase, "RUNNING")
  assert.equal(announced[1]?.statusInDatabase, "COMPLETED")
})

test("nothing is announced for a task that does not close the game", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME, taskType: "COMPETITION_SWEEP" }))

  await scheduler().tick()

  assert.deepEqual(announced, [], "only a nightly shuts a game")
})

test("an announcement that throws does not fail the run", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  const summary = await scheduler({
    announceMaintenance: () => {
      throw new Error("no socket server")
    },
  }).tick()

  assert.equal(summary.executed, 1)
  assert.equal(summary.failed, 0)
  assert.equal(runs[0]?.status, "COMPLETED")
})

test("a second instance announces a nightly it is only watching, once at each end", TEST_OPTIONS, async () => {
  // Two schedulers over one store, which is the arrangement in production and
  // the only one where the reconciliation does any work: the instance running
  // the nightly reports both ends itself, and every *other* instance has
  // nothing but the run row to go on.
  //
  // The owner's handler is held open, so its run really is RUNNING across
  // several of the observer's ticks rather than beginning and ending inside
  // one. Without that the run is COMPLETED by the time anything reconciles,
  // and this passes while observing nothing.
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  const nightly = gate("owner's nightly")
  const ownerAnnounced: string[] = []
  const owner = createScheduler({
    clock,
    instanceId: "owner-instance",
    announceMaintenance: (gameId) => ownerAnnounced.push(gameId),
    handlers: {
      NIGHTLY: nightly.handler,
      COMPETITION_SWEEP: async () => ({}),
      SHOP_ROTATION: async () => ({}),
    },
  })

  const observer = scheduler()

  const running = owner.tick()
  await nightly.arrived

  await observer.tick()
  assert.deepEqual(
    announced.map((entry) => entry.gameId),
    [GAME],
    "a game that started updating while this process was not looking"
  )
  assert.equal(announced[0]?.statusInDatabase, "RUNNING")

  announced = []
  await observer.tick()
  assert.deepEqual(announced, [], "still running, so nobody is asked to look again")

  nightly.release()
  await within(running, "the owner's tick to finish")
  assert.deepEqual(ownerAnnounced, [GAME, GAME], "the instance running it reports both ends")

  announced = []
  await observer.tick()
  assert.deepEqual(
    announced.map((entry) => entry.gameId),
    [GAME],
    "a run that ended elsewhere still reopens the game for these players"
  )
  assert.equal(announced[0]?.statusInDatabase, "COMPLETED")
})

test("a nightly this process ran is not announced a second time by the next tick", TEST_OPTIONS, async () => {
  runs.push(makeRun({ id: "run-1", gameId: GAME }))

  const scheduled = scheduler()
  await scheduled.tick()
  assert.equal(announced.length, 2)

  announced = []
  await scheduled.tick()
  assert.deepEqual(announced, [], "the run is over and the tick has nothing new to report")
})
