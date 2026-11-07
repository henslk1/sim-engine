/**
 * The client type that means "inside a transaction", and refuses the global one.
 *
 * **Prisma's own type does not say this.** `Prisma.TransactionClient` is
 * `Omit<PrismaClient, ITXClientDenyList>`, and omitting members only makes a
 * type *wider*: `db` has every method that is left, plus the ones that were
 * removed, so `db` satisfies it. A helper written as
 * `lock(tx: Prisma.TransactionClient)` - or as a `Pick` of it, which is the
 * shape used here - therefore accepts the global client without complaint.
 *
 * Nothing then fails. That is the problem. A lock taken through `db` runs in
 * its own implicit transaction, one statement long:
 *
 *   - `SELECT ... FOR UPDATE` takes the row lock and releases it when the
 *     SELECT ends - before the write it was taken for.
 *   - `pg_advisory_xact_lock` is released the same way.
 *
 * Both calls return successfully. There is no error to catch and no row to
 * inspect afterwards; the only evidence is a race that shows up occasionally,
 * in production, as two writes that should not have both happened.
 *
 * **What tells the two apart is a method the transaction client does not have.**
 * Prisma 7.8 denies five to an interactive transaction - `$connect`,
 * `$disconnect`, `$on`, `$use` and `$extends` - and `$extends` is the one used
 * here: a transaction cannot hand back a differently extended client, so it is
 * the least likely of the five to be allowed in later.
 *
 * `$transaction` would read better and is **wrong**: it is not on that list, so
 * a transaction client has it too and the brand would accept `db`. That mistake
 * was made here and caught by the assertions below, which is the argument for
 * their existing.
 */

import type { Prisma, PrismaClient } from "@sim-engine/db"

/**
 * Intersect with a client type to make it transaction-only.
 *
 * By absence: `$extends` has to be *missing*, which the global client cannot
 * manage and a transaction client gets for free.
 */
export type InTransaction = { $extends?: never }

/** Fails to compile unless `T` is `true`. */
export type Assert<T extends true> = T

/**
 * `true` when `T` **refuses** the global client, which is the point of the brand.
 *
 * If this turns false, `InTransaction` has stopped discriminating - most likely
 * because a Prisma upgrade moved `$extends` off the deny list. Pick another
 * name off it rather than deleting the check.
 */
export type RefusesGlobalClient<T> = [PrismaClient] extends [T] ? false : true

/**
 * `true` when `T` still accepts a real transaction client.
 *
 * Not decoration. The obvious way to silence a failure in `RefusesGlobalClient`
 * is to narrow the type until nothing satisfies it, which compiles everywhere
 * and locks nothing, and this is what refuses that fix.
 */
export type AcceptsTransactionClient<T> = [Prisma.TransactionClient] extends [T] ? true : false
