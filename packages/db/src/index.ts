import { PrismaClient } from "../prisma/generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * How many Postgres connections this process may hold.
 *
 * `pg` defaults to ten, which was invisible while everything the scheduler did
 * was sequential and becomes the binding limit the moment it is not: the
 * nightly ages several animals at once, the resolver runs several competitions
 * at once, and several games drain at once, each of those being a transaction
 * holding a connection for its whole life. Ten is also shared with every HTTP
 * request the same process is serving, so a nightly could starve the API
 * without anything saying so.
 *
 * Twenty-five leaves room for all of it against a stock Postgres allowing a
 * hundred. Raise `DATABASE_POOL_MAX` to go further, and keep
 * `maxConcurrentGames x the per-game bounds` comfortably below whatever it is
 * set to.
 */
const POOL_MAX = Number(process.env["DATABASE_POOL_MAX"] ?? 25)

const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"]!,
  max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 25,
})

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = db

export * from "../prisma/generated/prisma/client.js"
