/**
 * Which animals a nightly has to age.
 *
 * One indexed query, answered by the database. The version this replaces
 * loaded *every living animal in the game* into Node, loaded every daily-log
 * row that might match any of their ages, and did the join in memory — work
 * proportional to the whole population every night, whether or not anybody had
 * played. Here the join is `ac.cycleNumber = a.ageInCycles`, so the only rows
 * read are the ones that are actually due.
 */

import type { db } from "@sim-engine/db"

type Client = typeof db

export type EligibleAnimal = {
  id: string
  lifeStageId: string
  ageInCycles: number
}

/**
 * Every animal in the game with a marker for the cycle it is currently on.
 *
 * Raw SQL because the condition compares two columns of different tables —
 * an animal's current age against the cycle a marker was written for — and
 * Prisma's query API has no way to express that. It is also the entire reason
 * this is a cheap query rather than a full scan.
 *
 * No timestamps are involved, so none of the `timestamp` / session time zone
 * hazards that keep raw SQL out of the scheduler apply here.
 */
export async function selectEligibleAnimals(client: Client, gameId: string): Promise<EligibleAnimal[]> {
  return client.$queryRaw<EligibleAnimal[]>`
    SELECT a."id", a."lifeStageId", a."ageInCycles"
    FROM "Animal" a
    JOIN "AnimalCycleActivity" ac
      ON ac."animalId" = a."id"
     AND ac."cycleNumber" = a."ageInCycles"
    WHERE a."gameId" = ${gameId}
      AND a."status" = 'ALIVE'
      -- Shop animals are stock, not anybody's animal, and are never aged.
      AND NOT EXISTS (
        SELECT 1 FROM "GameShopAnimal" gsa
        WHERE gsa."animalId" = a."id" AND gsa."isAvailable" = true
      )
    ORDER BY a."id"
  `
}

/**
 * How many animals are eligible, without reading them.
 *
 * Used by the late-activity reconciliation at the end of a run, which only
 * needs to know whether the set has grown.
 */
export async function countEligibleAnimals(client: Client, gameId: string): Promise<number> {
  const rows = await client.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM "Animal" a
    JOIN "AnimalCycleActivity" ac
      ON ac."animalId" = a."id"
     AND ac."cycleNumber" = a."ageInCycles"
    WHERE a."gameId" = ${gameId}
      AND a."status" = 'ALIVE'
      AND NOT EXISTS (
        SELECT 1 FROM "GameShopAnimal" gsa
        WHERE gsa."animalId" = a."id" AND gsa."isAvailable" = true
      )
  `
  // Postgres counts in bigint, which the driver hands back as a BigInt.
  return Number(rows[0]?.count ?? 0)
}
