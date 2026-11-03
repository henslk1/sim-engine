import { test } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"
import { pruneActivityMarkers } from "../../../apps/server/src/scheduler/retention.ts"

/**
 * An interaction marker may only be deleted once it has been consumed.
 *
 * The first version of retention deleted markers on age alone, reasoning that
 * an animal which ages leaves its marker behind, so a marker still sitting at
 * an animal's current cycle after thirty days meant the nightly had stopped
 * for a month. That reasoning was about the nightly when it needed to be about
 * the animal: eligibility is `marker.cycleNumber = animal.ageInCycles`, and an
 * animal whose work keeps failing never ages, so its marker stays current while
 * every other animal in the game ages normally. Deleting it made the one animal
 * that most needed attention invisible to the nightly.
 *
 * The three cases below are exactly that distinction.
 *
 * **A disposable database, not a disposable schema.** The schema-scoped pattern
 * used by `condition-work.integration.test.ts` isolates raw SQL and nothing
 * else: `current_schema()` reports the test schema, but Prisma's generated
 * client qualifies its tables as `public.` and reads straight past it. Measured
 * while writing this - a `findMany` against a schema holding one row returned
 * 4,207 rows from the live table. That test is safe because every statement in
 * it is raw; anything reaching for a model delegate under the same pattern is
 * quietly talking to the real database.
 *
 * Opt in with RUN_DATABASE_TESTS=1. Creates its own database, drops it after,
 * and never touches the one in DATABASE_URL beyond CREATE/DROP DATABASE.
 */
test(
  "old activity markers are deleted only once their animal has aged past them",
  { skip: process.env["RUN_DATABASE_TESTS"] !== "1" },
  async () => {
    const dbName = `retention_markers_test_${process.pid}_${Date.now()}`
    const base = process.env["DATABASE_URL"]
    assert.ok(base, "DATABASE_URL is required for this test")

    const scratchUrl = new URL(base)
    scratchUrl.pathname = `/${dbName}`

    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base }) })
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)

    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: scratchUrl.toString() }),
    })

    try {
      await client.$executeRawUnsafe(
        'CREATE TABLE "Animal" ("id" text PRIMARY KEY, "gameId" text NOT NULL, "ageInCycles" integer NOT NULL, "status" text NOT NULL DEFAULT \'ALIVE\')'
      )
      await client.$executeRawUnsafe(
        'CREATE TABLE "AnimalCycleActivity" (' +
          '"id" text PRIMARY KEY, "gameId" text NOT NULL, "animalId" text NOT NULL REFERENCES "Animal"("id") ON DELETE CASCADE, ' +
          '"cycleNumber" integer NOT NULL, "firstInteractionAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
          '"lastInteractionAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      )

      // The scan records how far it reached on the game's config row.
      await client.$executeRawUnsafe(
        'CREATE TABLE "GameConfig" ("id" text PRIMARY KEY, "gameId" text NOT NULL UNIQUE, ' +
          '"workRetentionDays" integer NOT NULL DEFAULT 30, "markerPruneCursor" text, ' +
          // Prisma writes `@updatedAt` on every update, so the column has to exist.
          '"createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
          '"updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      )
      await client.$executeRaw`INSERT INTO "GameConfig" ("id", "gameId") VALUES ('cfg-1', 'g1')`

      const old = new Date("2026-01-01T00:00:00Z")
      const recent = new Date("2026-10-12T00:00:00Z")
      const cutoff = new Date("2026-09-13T00:00:00Z")

      // Three animals, all three markers equally old. Only what the animal did
      // afterwards tells them apart.
      await client.$executeRaw`
        INSERT INTO "Animal" ("id", "gameId", "ageInCycles", "status") VALUES
          ('aged',     'g1', 19, 'ALIVE'),
          ('unchanged','g1', 18, 'ALIVE'),
          ('failing',  'g1', 18, 'ALIVE')`
      await client.$executeRaw`
        INSERT INTO "AnimalCycleActivity" ("id", "gameId", "animalId", "cycleNumber", "lastInteractionAt") VALUES
          ('m-aged',      'g1', 'aged',      18, ${old}),
          ('m-unchanged', 'g1', 'unchanged', 18, ${old}),
          ('m-failing',   'g1', 'failing',   18, ${old}),
          ('m-recent',    'g1', 'aged',      19, ${recent})`

      const deleted = await pruneActivityMarkers("g1", cutoff, client)

      const left = (
        await client.animalCycleActivity.findMany({ select: { id: true }, orderBy: { id: "asc" } })
      ).map((row) => row.id)

      // 1. Consumed: the animal aged from 18 to 19, so nothing will ever match
      //    this marker again and it is safe to drop.
      assert.equal(deleted, 1)
      assert.ok(!left.includes("m-aged"), "a marker its animal has aged past should be deleted")

      // 2. Unchanged animal: still on cycle 18, so this marker is still the one
      //    that makes it eligible. Age is irrelevant.
      assert.ok(left.includes("m-unchanged"), "a current-cycle marker must survive however old it is")

      // 3. Failing animal: identical shape to case 2, which is the point. An
      //    animal whose nightly work fails every night holds a current marker
      //    indefinitely, and that is precisely when it must not be removed.
      assert.ok(left.includes("m-failing"), "a failing animal's current marker must survive")

      // 4. Not old enough to be considered at all.
      assert.ok(left.includes("m-recent"), "a marker newer than the cutoff is never a candidate")

      // Nothing to do on a second pass: the only deletable marker is gone, and
      // the protected ones must not start being deleted on a later run.
      assert.equal(await pruneActivityMarkers("g1", cutoff, client), 0)

      // Another game's markers are never touched.
      assert.equal(await pruneActivityMarkers("g2", cutoff, client), 0)
      assert.equal(await client.animalCycleActivity.count(), 3)

      // A block of protected markers must not hide the consumed ones behind
      // them, and the scan must not forget where it got to.
      //
      // Protected markers are not consumed by being read, so a scan that both
      // stops after a fixed amount of work *and* restarts from the beginning
      // every night can never get past a block larger than one pass. Paging
      // alone does not fix that - it only moves the cliff to whatever the
      // per-pass ceiling is. Twenty-five protected markers against a pass that
      // reads ten of them, with the one consumed marker sorting last.
      const scan = { page: 5, pages: 2, budget: 100 }
      const wall = Array.from({ length: 25 }, (_, i) => ({
        id: `wall-${String(i).padStart(3, "0")}`,
        gameId: "g1",
        animalId: "unchanged",
        cycleNumber: 18,
        firstInteractionAt: old,
        lastInteractionAt: old,
      }))
      await client.animalCycleActivity.createMany({ data: wall })
      await client.animalCycleActivity.create({
        data: {
          id: "zz-consumed-behind-the-wall",
          gameId: "g1",
          animalId: "aged",
          cycleNumber: 17,
          firstInteractionAt: old,
          lastInteractionAt: old,
        },
      })

      const survives = async () =>
        client.animalCycleActivity.count({ where: { id: "zz-consumed-behind-the-wall" } })

      // Each pass reads ten of the twenty-eight remaining candidates, so the
      // consumed one is only reachable on the third. The first two delete
      // nothing, which is exactly the state a non-persisting scan would be
      // stuck in for ever.
      assert.equal(await pruneActivityMarkers("g1", cutoff, client, scan), 0)
      assert.equal(await survives(), 1)

      const afterFirst = await client.gameConfig.findUniqueOrThrow({
        where: { gameId: "g1" },
        select: { markerPruneCursor: true },
      })
      assert.ok(
        afterFirst.markerPruneCursor,
        "a pass that deleted nothing must still record how far it scanned"
      )

      assert.equal(await pruneActivityMarkers("g1", cutoff, client, scan), 0)
      assert.equal(await survives(), 1)

      assert.equal(
        await pruneActivityMarkers("g1", cutoff, client, scan),
        1,
        "the third pass should reach past the protected block"
      )
      assert.equal(await survives(), 0)

      assert.equal(
        await client.animalCycleActivity.count({ where: { animalId: "unchanged" } }),
        26,
        "every protected marker survives the sweep"
      )
    } finally {
      // The drop fails while anything is still connected, so the order matters.
      await client.$disconnect()
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      await admin.$disconnect()
    }
  }
)
