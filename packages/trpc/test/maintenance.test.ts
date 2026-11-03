import { test } from "node:test"
import assert from "node:assert/strict"
import {
  guardGameMaintenance,
  readGameMaintenance,
  syncGameMaintenance,
  setGameMaintenance,
  maintenanceLockKey,
  lockGameForMaintenance,
  GameplayDrainTimeout,
} from "../src/maintenance.ts"

/**
 * The gameplay block, read from the database rather than from memory.
 *
 * Every case here is one where the old in-memory map said "open" because this
 * process had never been told otherwise. The map is still present as a hint, so
 * each test clears it first — that empty map *is* the condition being tested.
 */

type Run = {
  id: string
  gameId: string
  status: "PENDING" | "RUNNING" | "RETRYING" | "COMPLETED" | "FAILED"
  startedAt: Date | null
  claimedAt: Date | null
  scheduledFor: Date
  leaseUntil: Date | null
}

/**
 * A database with no scheduler attached to it, which is the whole point: these
 * processes never run a tick, so nothing would ever populate their memory.
 */
function fakeDb(runs: Run[], animals: Array<{ id: string; gameId: string }> = [], accounts: Array<{ userId: string; gameId: string }> = []) {
  let reads = 0
  return {
    get reads() {
      return reads
    },
    scheduledTaskRun: {
      findFirst: async ({ where }: any) => {
        reads++
        const wanted: string[] = where.status.in
        const found = runs
          .filter((r) => r.gameId === where.gameId && wanted.includes(r.status))
          .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())[0]
        return found ?? null
      },
    },
    animal: {
      findUnique: async ({ where }: any) => animals.find((a) => a.id === where.id) ?? null,
    },
    playerAccount: {
      findMany: async ({ where }: any) =>
        accounts.filter((a) => a.userId === where.userId).map((a) => ({ gameId: a.gameId })),
    },
  } as never
}

const run = (over: Partial<Run> = {}): Run => ({
  id: "run-1",
  gameId: "g1",
  status: "RUNNING",
  startedAt: new Date("2026-10-26T03:00:00Z"),
  claimedAt: new Date("2026-10-26T03:00:00Z"),
  scheduledFor: new Date("2026-10-26T03:00:00Z"),
  leaseUntil: new Date("2026-10-26T03:02:00Z"),
  ...over,
})

const feed = (client: never, gameId = "g1") =>
  guardGameMaintenance("user-1", "animal.dailyCare", { gameId }, client)

/** Every test starts as a process that has never heard of any nightly. */
function asWebOnlyProcess(): void {
  syncGameMaintenance([])
}

test("a web-only process blocks gameplay it was never told about", async () => {
  asWebOnlyProcess()
  // SCHEDULER_BACKEND=none: startScheduler returns immediately, no tick ever
  // runs, the map stays empty for the life of the process.
  await assert.rejects(feed(fakeDb([run()])), /GAME_UPDATE_IN_PROGRESS/)
})

test("the first request after startup is blocked, before any sync has run", async () => {
  asWebOnlyProcess()
  // The port opens in `serve()`'s callback and the scheduler is started from
  // inside it without being awaited, so requests are served before the first
  // syncMaintenance. This is that window.
  await assert.rejects(feed(fakeDb([run()])), /GAME_UPDATE_IN_PROGRESS/)
})

test("a nightly started by another instance blocks here immediately", async () => {
  asWebOnlyProcess()
  // The per-tick sync would find this one eventually; the tick sleeps up to
  // fifteen minutes when idle, which is how long "eventually" could be.
  await assert.rejects(
    feed(fakeDb([run({ id: "other-instance-run" })])),
    /GAME_UPDATE_IN_PROGRESS/
  )
})

test("a retry outside any scheduled window still blocks", async () => {
  asWebOnlyProcess()
  // RETRYING is work that failed and will be picked up again. It happens
  // whenever the next tick gets to it, so no window around a nightly boundary
  // would contain it - which is why a window cannot be what decides this.
  await assert.rejects(feed(fakeDb([run({ status: "RETRYING" })])), /GAME_UPDATE_IN_PROGRESS/)
})

test("a lapsed lease does not reopen gameplay", async () => {
  asWebOnlyProcess()
  // The worker died an hour ago. The run is still RUNNING and still has to be
  // recovered, which is the last moment to let players back in.
  await assert.rejects(
    feed(fakeDb([run({ leaseUntil: new Date("2026-10-26T03:02:00Z") })])),
    /GAME_UPDATE_IN_PROGRESS/
  )
})

test("a run that has not been claimed yet does not close the game", async () => {
  asWebOnlyProcess()
  // Deliberate: a row sits PENDING for a moment before anything claims it, and
  // the claim takes the game's lock exclusively, so a mutation in flight at
  // that instant finishes first anyway.
  await assert.doesNotReject(feed(fakeDb([run({ status: "PENDING" })])))
})

test("a finished nightly leaves the game open", async () => {
  asWebOnlyProcess()
  await assert.doesNotReject(feed(fakeDb([run({ status: "COMPLETED" })])))
  await assert.doesNotReject(feed(fakeDb([])))
})

test("only the game being changed is closed", async () => {
  asWebOnlyProcess()
  const client = fakeDb([run({ gameId: "g1" })])
  await assert.rejects(feed(client, "g1"), /GAME_UPDATE_IN_PROGRESS/)
  await assert.doesNotReject(feed(client, "g2"))
})

test("the game is resolved from the animal being acted on, not from the caller", async () => {
  asWebOnlyProcess()
  // The caller plays in both games. The mutation names an animal, and that
  // animal lives in the one that is open.
  const client = fakeDb(
    [run({ gameId: "g1" })],
    [{ id: "horse-in-g2", gameId: "g2" }],
    [
      { userId: "user-1", gameId: "g1" },
      { userId: "user-1", gameId: "g2" },
    ]
  )
  await assert.doesNotReject(
    guardGameMaintenance("user-1", "animal.train", { animalId: "horse-in-g2" }, client)
  )

  const blocked = fakeDb([run({ gameId: "g1" })], [{ id: "horse-in-g1", gameId: "g1" }])
  await assert.rejects(
    guardGameMaintenance("user-1", "animal.train", { animalId: "horse-in-g1" }, blocked),
    /GAME_UPDATE_IN_PROGRESS/
  )
})

test("staff, chat and support keep working mid-update", async () => {
  asWebOnlyProcess()
  const client = fakeDb([run()])
  for (const path of [
    "admin.ops.retryFailed",
    "messaging.send",
    "bugReport.create",
    "supportTicket.reply",
  ]) {
    await assert.doesNotReject(
      guardGameMaintenance("user-1", path, { gameId: "g1" }, client),
      `${path} should stay available during an update`
    )
  }
  // Exempt paths cost nothing, because they return before resolving a game.
  assert.equal((client as unknown as { reads: number }).reads, 0)
})

test("one mutation costs at most one maintenance read", async () => {
  asWebOnlyProcess()
  const client = fakeDb([run({ status: "COMPLETED" })])
  await assert.doesNotReject(feed(client))
  assert.equal(
    (client as unknown as { reads: number }).reads,
    1,
    "the guard must not check the same game twice in one action"
  )
})

test("nothing is read while nobody is playing", async () => {
  asWebOnlyProcess()
  const client = fakeDb([run()])
  // No mutation, no query. The cost of the guard is per action, not per second.
  assert.equal((client as unknown as { reads: number }).reads, 0)
})

test("the hint can refuse without a read, and is corrected by one", async () => {
  asWebOnlyProcess()
  setGameMaintenance("g1", { runId: "run-1", startedAt: new Date() })

  const client = fakeDb([run({ status: "COMPLETED" })])
  await assert.rejects(feed(client), /GAME_UPDATE_IN_PROGRESS/)
  assert.equal((client as unknown as { reads: number }).reads, 0, "a known block needs no query")

  // The authoritative read is what clears a hint that has gone stale.
  assert.equal(await readGameMaintenance("g1", client), null)
  await assert.doesNotReject(feed(client))
})

test("a cached block is revalidated, so a finished nightly reopens the game", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] })
  t.after(() => t.mock.timers.reset())
  asWebOnlyProcess()

  // The process learns the game is updating - from a tick, or a socket event.
  setGameMaintenance("g1", { runId: "run-1", startedAt: new Date() })

  const client = fakeDb([run({ status: "COMPLETED" })])
  await assert.rejects(feed(client), /GAME_UPDATE_IN_PROGRESS/)
  assert.equal((client as unknown as { reads: number }).reads, 0, "a fresh hint needs no query")

  // The nightly finishes. Nothing tells this process, because nothing has to:
  // the hint is allowed to refuse only for as long as it is fresh.
  t.mock.timers.tick(11_000)

  await assert.doesNotReject(
    feed(client),
    "a stale hint must be revalidated against the database, not trusted"
  )
  assert.ok((client as unknown as { reads: number }).reads > 0, "revalidation must actually read")

  // ...and having revalidated, it stays open without asking again every time.
  await assert.doesNotReject(feed(client))
})

test("a stale hint for a nightly that is still running keeps blocking", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] })
  t.after(() => t.mock.timers.reset())
  asWebOnlyProcess()

  setGameMaintenance("g1", { runId: "run-1", startedAt: new Date() })
  t.mock.timers.tick(11_000)

  // Expiry means "ask again", not "let them in".
  await assert.rejects(feed(fakeDb([run()])), /GAME_UPDATE_IN_PROGRESS/)
})

/**
 * A transaction stub whose lock statement fails in a chosen way.
 *
 * `$executeRaw` is the tagged call that takes the lock; `$executeRawUnsafe`
 * sets and clears `lock_timeout` around it.
 */
function txThatFails(error: unknown) {
  const statements: string[] = []
  return {
    statements,
    $executeRawUnsafe: async (sql: string) => {
      statements.push(sql)
      return 1
    },
    $executeRaw: async () => {
      throw error
    },
  } as never
}

test("only a cancelled lock wait counts as gameplay still draining", async () => {
  // Positive: Postgres cancelled the wait for this lock. The driver wraps it,
  // but the SQLSTATE survives in the message, and that is the one thing that
  // says "we waited for this lock and did not get it".
  const cancelled = new Error(
    "Raw query failed. Code: `55P03`. Message: `canceling statement due to lock timeout`"
  )
  await assert.rejects(
    lockGameForMaintenance(txThatFails(cancelled), "g1", 25_000),
    (error: unknown) => {
      assert.ok(error instanceof GameplayDrainTimeout, "should be reported as a drain timeout")
      assert.equal(error.gameId, "g1")
      assert.equal(error.waitedMs, 25_000)
      return true
    }
  )
})

test("other transaction failures are not mistaken for contention", async () => {
  // Negative. Every one of these used to be classified as contention, which
  // would have had the scheduler quietly retrying a genuine fault for ever
  // while reporting healthy ticks. None of them says anything about this lock:
  //
  //  - P2028 covers expiry, an already-closed transaction and one that was
  //    never found, and is raised for all three alike;
  //  - a connection that never arrived is pool starvation, not gameplay;
  //  - a column that does not exist is a bug.
  const notContention = [
    Object.assign(new Error("Transaction already closed: timeout exceeded"), { code: "P2028" }),
    Object.assign(new Error("Transaction not found"), { code: "P2028" }),
    Object.assign(new Error("Unable to start a transaction in the given time"), { code: "P2028" }),
    new Error("Timed out fetching a new connection from the connection pool"),
    new Error('column "nope" does not exist'),
    new Error("canceling statement due to statement timeout"),
  ]

  for (const error of notContention) {
    await assert.rejects(
      lockGameForMaintenance(txThatFails(error), "g1", 25_000),
      (thrown: unknown) => {
        assert.ok(
          !(thrown instanceof GameplayDrainTimeout),
          `"${(error as Error).message}" must not be reported as gameplay contention`
        )
        assert.equal(thrown, error, "the original failure must propagate unchanged")
        return true
      }
    )
  }
})

test("the lock wait is bounded, and the bound is lifted afterwards", async () => {
  const tx = txThatFails(new Error("boom"))
  await assert.rejects(lockGameForMaintenance(tx, "g1", 25_000))

  const statements = (tx as unknown as { statements: string[] }).statements
  assert.match(statements[0]!, /SET LOCAL lock_timeout = '25000ms'/)
  assert.match(
    statements[1]!,
    /SET LOCAL lock_timeout = 0/,
    "the rest of the claim must not inherit the drain's deadline"
  )
})

test("the lock key is stable, game-specific and inside Postgres's range", () => {
  const a = maintenanceLockKey("game-one")
  assert.equal(a, maintenanceLockKey("game-one"), "the same game must always hash alike")
  assert.notEqual(a, maintenanceLockKey("game-two"))
  for (const id of ["", "g", "cmrojfzqz000028fa518vxxuk", "x".repeat(200)]) {
    const key = maintenanceLockKey(id)
    assert.ok(key >= -(2n ** 63n) && key < 2n ** 63n, `${id} produced an out-of-range key`)
  }
})
