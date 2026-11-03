import { test } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  maintenanceLockKey,
  lockGameForMaintenance,
  GameplayDrainTimeout,
  lockGameSchedule,
  ScheduleLockTimeout,
  joinGameplay,
} from "../../trpc/src/maintenance.ts"

/**
 * A gameplay action already in flight when maintenance begins.
 *
 * This is the half a status check cannot cover. However authoritative the
 * check, a nightly can start in the gap between a mutation reading "open" and
 * its write landing, and the write would then arrive after the nightly had
 * begun changing the same animals.
 *
 * The coordination is a per-game advisory lock: gameplay holds it shared for
 * the length of its transaction, and the nightly takes it exclusively in the
 * transaction that marks its run RUNNING. Exclusive waits for the shared
 * holders, so in-flight work finishes first; and once it is held, nothing new
 * can join. Neither side holds it for longer than that — the nightly's hours of
 * work are governed by the run's status, not by the lock.
 *
 * Disposable database, opt in with RUN_DATABASE_TESTS=1. Advisory locks are
 * database-wide and touch no rows, but a separate database keeps a stray lock
 * from ever reaching the real one.
 */
test(
  "a nightly waits for gameplay in flight, then shuts the door behind it",
  { skip: process.env["RUN_DATABASE_TESTS"] !== "1" },
  async () => {
    const dbName = `maintenance_lock_test_${process.pid}_${Date.now()}`
    const base = process.env["DATABASE_URL"]
    assert.ok(base, "DATABASE_URL is required for this test")

    const scratch = new URL(base)
    scratch.pathname = `/${dbName}`

    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base }) })
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)

    // Two clients so the two transactions are genuinely on two connections.
    const gameplay = new PrismaClient({
      adapter: new PrismaPg({ connectionString: scratch.toString() }),
    })
    const nightly = new PrismaClient({
      adapter: new PrismaPg({ connectionString: scratch.toString() }),
    })

    const key = maintenanceLockKey("game-under-test")

    try {
      // A player's mutation opens its transaction and joins the game.
      let releaseGameplay: (() => void) | undefined
      const gameplayDone = new Promise<void>((resolve) => {
        releaseGameplay = resolve
      })
      let gameplayCommitted = false

      const inFlight = gameplay.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${key}::bigint)`
          // Hold it the way a real mutation does: for as long as its own work
          // takes. The nightly must not get past this point.
          await gameplayDone
          gameplayCommitted = true
        },
        { timeout: 20_000 }
      )

      // Let the shared lock actually be taken before the nightly tries.
      await new Promise((r) => setTimeout(r, 200))

      // The nightly reaches its claim. `try` rather than the blocking form so
      // the test can assert the refusal instead of waiting on it.
      const blockedByGameplay = await nightly.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ got: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${key}::bigint) AS got`
        return row!.got
      })
      assert.equal(
        blockedByGameplay,
        false,
        "a nightly must not begin while a gameplay transaction is still open"
      )
      assert.equal(gameplayCommitted, false, "the player's write has not landed yet")

      // The player's mutation finishes.
      releaseGameplay!()
      await inFlight
      assert.ok(gameplayCommitted)

      // Now the nightly gets in, and while it holds the lock no new gameplay
      // can join - which is the moment the run becomes RUNNING and every later
      // mutation is refused by its status instead.
      const sequence = await nightly.$transaction(async (tx) => {
        const [claim] = await tx.$queryRaw<Array<{ got: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${key}::bigint) AS got`

        const [joiner] = await gameplay.$queryRaw<Array<{ got: boolean }>>`
          SELECT pg_try_advisory_lock_shared(${key}::bigint) AS got`

        return { claimed: claim!.got, newGameplayAdmitted: joiner!.got }
      })

      assert.equal(sequence.claimed, true, "the nightly takes the lock once gameplay has drained")
      assert.equal(
        sequence.newGameplayAdmitted,
        false,
        "no gameplay may join once the nightly holds the game"
      )

      // And the lock is released with the transaction, not held for the night.
      const afterClaim = await gameplay.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ got: boolean }>>`
          SELECT pg_try_advisory_xact_lock_shared(${key}::bigint) AS got`
        return row!.got
      })
      assert.equal(
        afterClaim,
        true,
        "the claim's lock must not outlive its transaction - the run's status governs the rest"
      )
    } finally {
      await gameplay.$disconnect()
      await nightly.$disconnect()
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      await admin.$disconnect()
    }
  }
)

test(
  "a nightly that cannot get in says so, and says it for the right reason",
  { skip: process.env["RUN_DATABASE_TESTS"] !== "1" },
  async () => {
    const dbName = `drain_timeout_test_${process.pid}_${Date.now()}`
    const base = process.env["DATABASE_URL"]
    assert.ok(base, "DATABASE_URL is required for this test")
    const scratch = new URL(base)
    scratch.pathname = `/${dbName}`

    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base }) })
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    const gameplay = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratch.toString() }) })
    const nightly = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratch.toString() }) })

    try {
      let release: (() => void) | undefined
      const holding = new Promise<void>((resolve) => { release = resolve })

      const inFlight = gameplay.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${maintenanceLockKey("g")}::bigint)`
          await holding
        },
        { timeout: 20_000 }
      )
      await new Promise((r) => setTimeout(r, 200))

      // Real contention, through the real function, with a short deadline so
      // the test does not have to wait out the production one.
      const started = Date.now()
      await assert.rejects(
        nightly.$transaction(async (tx) => lockGameForMaintenance(tx, "g", 600), { timeout: 15_000 }),
        (error: unknown) => {
          assert.ok(
            error instanceof GameplayDrainTimeout,
            `expected a drain timeout, got ${(error as Error)?.message}`
          )
          assert.equal(error.gameId, "g")
          return true
        }
      )

      // It waited for the lock rather than failing instantly on something else.
      const waited = Date.now() - started
      assert.ok(waited >= 500, `should have waited for the lock, waited ${waited}ms`)

      release!()
      await inFlight

      // And with gameplay finished, the same call succeeds.
      await assert.doesNotReject(
        nightly.$transaction(async (tx) => lockGameForMaintenance(tx, "g", 600), { timeout: 15_000 })
      )
    } finally {
      await gameplay.$disconnect()
      await nightly.$disconnect()
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      await admin.$disconnect()
    }
  }
)

test(
  "two schedulers cannot claim one game at the same moment, and no player waits for them",
  { skip: process.env["RUN_DATABASE_TESTS"] !== "1" },
  async () => {
    const dbName = `schedule_lock_test_${process.pid}_${Date.now()}`
    const base = process.env["DATABASE_URL"]
    assert.ok(base, "DATABASE_URL is required for this test")
    const scratch = new URL(base)
    scratch.pathname = `/${dbName}`

    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base }) })
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    const a = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratch.toString() }) })
    const b = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratch.toString() }) })
    const player = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratch.toString() }) })

    try {
      // Instance A is mid-claim for game "g".
      let release: (() => void) | undefined
      const holding = new Promise<void>((resolve) => { release = resolve })
      const claiming = a.$transaction(
        async (tx) => {
          await lockGameSchedule(tx, "g", 2_000)
          await holding
        },
        { timeout: 20_000 }
      )
      await new Promise((r) => setTimeout(r, 200))

      // A player is not part of this. The gameplay lock is a different key, so
      // joining the game must not wait behind a claim that is itself waiting
      // for gameplay to drain - which is the deadlock one shared key would be.
      const beforeJoin = Date.now()
      await player.$transaction(async (tx) => joinGameplay(tx, "g"), { timeout: 5_000 })
      assert.ok(Date.now() - beforeJoin < 1_000, "gameplay should not queue behind a claim")

      // Instance B, claiming the same game, waits and then gives up - with an
      // error that says which game and for how long, so a tick that keeps
      // losing is distinguishable from one that is broken.
      const started = Date.now()
      await assert.rejects(
        b.$transaction(async (tx) => lockGameSchedule(tx, "g", 600), { timeout: 15_000 }),
        (error: unknown) => {
          assert.ok(
            error instanceof ScheduleLockTimeout,
            `expected a schedule lock timeout, got ${(error as Error)?.message}`
          )
          assert.equal(error.gameId, "g")
          return true
        }
      )
      assert.ok(Date.now() - started >= 500, "it should have waited for the lock")

      // A different game is a different key, so it is never contended.
      await assert.doesNotReject(
        b.$transaction(async (tx) => lockGameSchedule(tx, "other-game", 600), { timeout: 15_000 })
      )

      release!()
      await claiming

      // And once A is done, B gets in.
      await assert.doesNotReject(
        b.$transaction(async (tx) => lockGameSchedule(tx, "g", 600), { timeout: 15_000 })
      )
    } finally {
      await a.$disconnect()
      await b.$disconnect()
      await player.$disconnect()
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      await admin.$disconnect()
    }
  }
)
