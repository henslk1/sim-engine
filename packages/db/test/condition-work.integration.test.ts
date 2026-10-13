import { test } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"
import { grantConditionWorkGain } from "../../engine/src/animal/conditionWork.ts"

// Disposable schema: never changes game animals. Opt in with RUN_DATABASE_TESTS=1.
test("condition reward is once per cycle across concurrent work, capped and rolled back with failed actions", {
  skip: process.env.RUN_DATABASE_TESTS !== "1",
}, async () => {
  const schema = `condition_work_test_${process.pid}_${Date.now()}`
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` }) })
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await client.$executeRawUnsafe('CREATE TABLE "AnimalCondition" ("animalId" text PRIMARY KEY, "value" double precision NOT NULL, "lastWorkGainCycle" integer, "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    await client.$executeRaw`INSERT INTO "AnimalCondition" ("animalId", "value") VALUES ('horse', 90)`
    const read = async () => (await client.$queryRaw<Array<{ value: number; lastWorkGainCycle: number | null }>>`SELECT "value", "lastWorkGainCycle" FROM "AnimalCondition" WHERE "animalId" = 'horse'`)[0]!
    await Promise.all(Array.from({ length: 20 }, () => client.$transaction(tx => grantConditionWorkGain(tx, "horse", 10, 3))))
    assert.deepEqual(await read(), { value: 93, lastWorkGainCycle: 10 })
    await assert.rejects(client.$transaction(async tx => {
      await grantConditionWorkGain(tx, "horse", 11, 3)
      throw new Error("entry failed")
    }), /entry failed/)
    assert.deepEqual(await read(), { value: 93, lastWorkGainCycle: 10 })
    await client.$transaction(tx => grantConditionWorkGain(tx, "horse", 11, 3))
    assert.deepEqual(await read(), { value: 96, lastWorkGainCycle: 11 })
    await grantConditionWorkGain(client, "horse", 10, 3)
    assert.equal((await read()).value, 96)
    await grantConditionWorkGain(client, "horse", 12, 8)
    assert.deepEqual(await read(), { value: 100, lastWorkGainCycle: 12 })
  } finally {
    await client.$disconnect()
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin.$disconnect()
  }
})
