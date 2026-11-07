/**
 * The assertions a handler calls: ownership, membership and staff rank.
 *
 * Separate from `staff.ts` because everything here throws a `TRPCError`, and
 * separate from `trpc.ts` because these run *inside* a handler rather than
 * before one. That distinction is the point of the file.
 *
 * **Why a procedure is not enough for a mutation.** A middleware loads
 * ownership, returns, and only then does the handler open its transaction - so
 * what it proved is already stale by the time the write lands, and the window
 * is a whole round trip wide. The tier establishes *identity*; these helpers
 * assert *authorization* inside the transaction the write is happening in,
 * after `enterGameplay*` has taken the maintenance lock:
 *
 * ```ts
 * await db.$transaction(async (tx) => {
 *   const gameId = await enterGameplayForAnimal(tx, input.animalId)  // lock first
 *   const { animal } = await assertOwnsAnimal(tx, ctx.userId, input.animalId)
 *   // ... the write, on a row this transaction holds
 * })
 * ```
 *
 * Lock order is unchanged: the game advisory lock, then the row. No second
 * transaction and no second pool connection.
 *
 * For a *query* the middleware shape in `trpc.ts` is enough - there is no write
 * to go stale.
 *
 * Where the write allows it, prefer an ownership-constrained write over a
 * read-then-write entirely. `player.saveSubContainerPreferences` already does
 * this and is the pattern to copy:
 *
 * ```ts
 * const result = await tx.subContainer.updateMany({
 *   where: { id: input.id, playerAccount: { userId: ctx.userId } },
 *   data: { ... },
 * })
 * if (result.count !== 1) throw new TRPCError({ code: "NOT_FOUND" })
 * ```
 */

import { TRPCError } from "@trpc/server"
import { db, type AnimalStatus, type Prisma, type StaffRoleType } from "@sim-engine/db"
import {
  RANK,
  getActingStaffRole,
  getProtectedStaffRoles,
  getStaffRole,
  type StaffReader,
} from "./staff.js"
import type {
  AcceptsTransactionClient,
  Assert,
  InTransaction,
  RefusesGlobalClient,
} from "./tx.js"

/**
 * What these helpers need: a raw query for the row lock, and one delegate.
 *
 * `InTransaction` is the part that matters. Without it `db` satisfies this type
 * - `Prisma.TransactionClient` is an `Omit` of the global client, so a `Pick`
 * of it is wider still - and `assertOwnsAnimal(db, ...)` would compile, run,
 * and hold its row lock for the length of one SELECT. See `tx.ts`.
 */
type AuthzTx = InTransaction & Pick<Prisma.TransactionClient, "$queryRaw" | "playerAccount">

/**
 * Enough of a client to look an account up, with no lock involved. Satisfied by
 * `db` and by a transaction client, deliberately: the membership reads below
 * are correct from either.
 */
type PlayerReader = Pick<typeof db, "playerAccount">

/** A transaction that can lock role rows and read them back through itself. */
type StaffTx = InTransaction & Pick<Prisma.TransactionClient, "$queryRaw"> & StaffReader

/**
 * Both types above promise a lock, so both must refuse `db` and still accept a
 * real transaction client. Checked at compile time - see `tx.ts` for why
 * neither half is redundant - and the name in the error says which broke.
 *
 * Exported only so `noUnusedLocals` leaves them alone: the web app typechecks
 * this file through its import graph under that flag, and an unexported proof
 * fails the build there. Nothing imports them.
 */
export type _AuthzTxRefusesGlobal = Assert<RefusesGlobalClient<AuthzTx>>
export type _AuthzTxAcceptsTransaction = Assert<AcceptsTransactionClient<AuthzTx>>
export type _StaffTxRefusesGlobal = Assert<RefusesGlobalClient<StaffTx>>
export type _StaffTxAcceptsTransaction = Assert<AcceptsTransactionClient<StaffTx>>

export type OwnedAnimal = {
  id: string
  gameId: string
  playerAccountId: string
  status: AnimalStatus
}

export type ActingPlayer = {
  id: string
  userId: string
  gameId: string
  username: string
}

const PLAYER_FIELDS = { id: true, userId: true, gameId: true, username: true } as const

function notYours(): TRPCError {
  return new TRPCError({ code: "FORBIDDEN", message: "You do not own this animal." })
}

/**
 * The owning account has to be in the animal's own game.
 *
 * Nothing in the schema ties `Animal.gameId` to `Animal.playerAccount.gameId` -
 * they are two independent columns - so a game A account attached to a game B
 * animal satisfies "the caller owns it" while every game-scoped rule around the
 * write is then evaluated against the wrong game. `enterGameplayForAnimal` takes
 * the maintenance lock on `animal.gameId`, so that pairing would also have the
 * action running under game B's lock on behalf of a game A player.
 *
 * This is the same failure `assertParticipantsInGame` was written for, arriving
 * from the other direction, and refusing it is the only safe answer: the row is
 * a data error and no decision taken on it would be sound.
 */
function assertSameGame(animal: { gameId: string }, player: { gameId: string }): void {
  if (animal.gameId !== player.gameId) throw notYours()
}

/**
 * Lock one animal row and prove the caller owns it.
 *
 * `SELECT ... FOR UPDATE` is what makes this different from reading the animal
 * normally. A transfer of ownership updates `Animal.playerAccountId`, so it
 * needs this row too:
 *
 *   - this transaction takes the lock first -> the transfer waits, and this
 *     action is entitled to finish. Refusing it would be a bug of its own.
 *   - the transfer commits first -> this lock waits for it, and then reads the
 *     *new* owner and refuses.
 *
 * Either way no decision rests on a read taken outside the lock, which is the
 * property under test, rather than "refuse whenever a transfer is nearby".
 *
 * Two statements rather than a join, deliberately. Locking the animal and then
 * resolving the owner from the **locked** row needs no reasoning about how
 * Postgres re-evaluates a join under `FOR UPDATE`, and this is a file where
 * obviously correct beats one fewer round trip. It also keeps "no such animal"
 * and "not your animal" distinguishable, which the error codes want.
 *
 * `status` comes back so callers can apply their own eligibility rules. Being
 * dead or archived is not an ownership question and is not decided here.
 */
export async function assertOwnsAnimal(
  tx: AuthzTx,
  userId: string,
  animalId: string
): Promise<{ animal: OwnedAnimal; player: ActingPlayer }> {
  const [locked] = await tx.$queryRaw<OwnedAnimal[]>`
    SELECT "id", "gameId", "playerAccountId", "status"::text AS "status"
    FROM "Animal"
    WHERE "id" = ${animalId}
    FOR UPDATE
  `
  if (!locked) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found." })

  const player = await tx.playerAccount.findUnique({
    where: { id: locked.playerAccountId },
    select: PLAYER_FIELDS,
  })
  if (!player || player.userId !== userId) throw notYours()
  assertSameGame(locked, player)
  return { animal: locked, player }
}

/**
 * The same, for a mutation that names several animals - a cover names a sire
 * and a dam, an embryo transfer names a donor and a surrogate.
 *
 * Rows are locked in id order in a single statement, so two mutations naming
 * the same pair in opposite orders cannot deadlock each other. The `ORDER BY`
 * is evaluated before the lock is taken, which is what makes that true.
 *
 * Every requested id must exist and every one must be the caller's: a partial
 * answer here would be an authorization decision made on half the inputs.
 */
export async function assertOwnsAnimals(
  tx: AuthzTx,
  userId: string,
  animalIds: readonly string[]
): Promise<{ animals: Map<string, OwnedAnimal>; player: ActingPlayer }> {
  const ids = [...new Set(animalIds)].sort()
  if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No animal named." })

  const locked = await tx.$queryRaw<OwnedAnimal[]>`
    SELECT "id", "gameId", "playerAccountId", "status"::text AS "status"
    FROM "Animal"
    WHERE "id" = ANY(${ids}::text[])
    ORDER BY "id"
    FOR UPDATE
  `
  if (locked.length !== ids.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found." })
  }

  const accountIds = [...new Set(locked.map((a) => a.playerAccountId))]
  const accounts = await tx.playerAccount.findMany({
    where: { id: { in: accountIds } },
    select: PLAYER_FIELDS,
  })
  // One account, and it has to be the caller. More than one means at least one
  // of these animals is somebody else's.
  const mine = accounts.length === 1 ? accounts.find((a) => a.userId === userId) : undefined
  if (!mine) throw notYours()
  // Every animal in the owner's game, which also makes them all in one game -
  // a mutation that names a pair must not be handed one from each.
  for (const animal of locked) assertSameGame(animal, mine)

  return { animals: new Map(locked.map((a) => [a.id, a])), player: mine }
}

/**
 * Lock one player account and prove it is the caller's.
 *
 * For the routes that take a `playerAccountId` because they genuinely act on an
 * account - a balance, an inventory, a capacity row. The account is still never
 * the caller's claim about who they are; it is checked against the session.
 *
 * `FOR UPDATE` and not a plain read, for the same reason as the animal: the
 * decision has to hold until the write commits. It also conflicts with a
 * `DELETE` of the account, so a player leaving a game queues behind an action
 * already in flight on that account rather than racing it - and the action,
 * holding the row, is entitled to finish.
 *
 * This read says nothing about *which* game the account is in. A route that
 * acts on a game resource resolves the game from the resource and checks it;
 * `requirePlayerInGame` is the form for that.
 */
export async function assertOwnsPlayerAccount(
  tx: AuthzTx,
  userId: string,
  playerAccountId: string
): Promise<ActingPlayer> {
  const [locked] = await tx.$queryRaw<ActingPlayer[]>`
    SELECT "id", "userId", "gameId", "username"
    FROM "PlayerAccount"
    WHERE "id" = ${playerAccountId}
    FOR UPDATE
  `
  if (!locked) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." })
  if (locked.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That is not your account." })
  }
  return locked
}

/**
 * The caller account in this game.
 *
 * `playerProcedure` is the middleware form, for a route whose input names the
 * game. This is the form for a route that names a *resource* instead: resolve
 * the game from the resource first, then ask this. Taking a `gameId` from the
 * input of a resource-keyed route would let a caller name their own game while
 * acting on another one, which is the whole reason the rule runs this way.
 */
export async function requirePlayerInGame(
  client: PlayerReader,
  userId: string,
  gameId: string
): Promise<ActingPlayer> {
  const player = await client.playerAccount.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: PLAYER_FIELDS,
  })
  if (!player) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have a character in this game." })
  }
  return player
}

/**
 * Staff rank in one game, for a write that belongs to that game.
 *
 * The game is derived from the resource being acted on - the ticket, the
 * report, the note - never from the input, whenever the route already names a
 * resource. A `gameId` input is the anchor only for list and create routes,
 * where there is no resource yet.
 */
export async function requireStaff(
  client: StaffReader,
  userId: string,
  gameId: string,
  minimum: StaffRoleType
): Promise<StaffRoleType> {
  const held = await getStaffRole(userId, gameId, client)
  if (held === null || RANK[held] < RANK[minimum]) throw new TRPCError({ code: "FORBIDDEN" })
  return held
}

/**
 * Hold the role rows of everyone a decision is about to be taken on, so the
 * roles cannot change under the decision.
 *
 * Two statements, and both are needed because they stop different things:
 *
 *   1. **`FOR UPDATE` on the `User` rows** stops a *promotion*. A `StaffRole`
 *      insert takes `FOR KEY SHARE` on the `User` row its foreign key points
 *      at, and `FOR UPDATE` conflicts with that - so this blocks a role row
 *      that does not exist yet, which no lock on `StaffRole` can do.
 *   2. **`FOR UPDATE` on the `StaffRole` rows** stops a *revocation* or an
 *      edit of a row that does exist, which the `User` lock does not: deleting
 *      a referencing row takes no lock on the referenced one.
 *
 * Always in that order, and each statement ordered by id, so two concurrent
 * actions over overlapping sets serialise rather than deadlock.
 *
 * **The other side has to cooperate.** `admin.ops.assignRole` and its
 * revocation path must call this before they write, or they will simply not
 * meet the lock. That is a one-line addition when those routes are rebuilt in
 * step 5, and it is the half of this interlock that is not yet in place.
 */
export async function lockStaffSubjects(
  tx: StaffTx,
  userIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(userIds)].sort()
  if (ids.length === 0) return
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`
  await tx.$queryRaw`SELECT 1 FROM "StaffRole" WHERE "userId" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`
}

/**
 * The rank rule for acting on another account: a ban, or an IP ban whole set.
 *
 *   > All staff may issue an account ban. A staff member may only ban a staff
 *   > target they outrank.
 *
 * Three things this gets right that a single rank lookup would not:
 *
 *   - **The caller needs a valid assignment before any comparison happens.** A
 *     user whose only row is an unscoped MODERATOR has no acting rank and is
 *     refused outright, rather than entering the comparison with a rank it
 *     should never have had.
 *   - **A malformed row still counts for the target**, through
 *     `getProtectedStaffRoles`. Over-protecting a staff account is the safe
 *     failure; under-granting is not.
 *   - **Strictly greater.** Equal ranks must not ban each other, or two
 *     moderators remove one another and an owner is banned by a second owner.
 *     This also refuses a staff member acting on themselves, which falls out
 *     of the same comparison.
 *
 * Every target is checked before anything is returned, so an action over a set
 * of accounts is refused whole rather than part-applied - no partial bans.
 *
 * **It takes the transaction, and it takes it first.** A rank comparison read
 * through the global client from inside a transaction is a decision taken on a
 * different snapshot than the write it authorises, so a promotion landing in
 * between would make the ban commit against a rank the target no longer holds.
 * `lockStaffSubjects` is called here rather than left to the handler, because
 * the lock and the read are only correct together.
 *
 * Returns the caller acting rank, for the audit row.
 */
export async function requireRankOver(
  tx: StaffTx,
  callerUserId: string,
  targetUserIds: readonly string[]
): Promise<StaffRoleType> {
  // Caller included: a revocation of the caller's own role between the check
  // and the commit is the same bug pointed the other way.
  await lockStaffSubjects(tx, [callerUserId, ...targetUserIds])

  const [callerRank, protectedRanks] = await Promise.all([
    getActingStaffRole(callerUserId, tx),
    getProtectedStaffRoles(targetUserIds, tx),
  ])
  if (callerRank === null) throw new TRPCError({ code: "FORBIDDEN" })

  for (const [, targetRank] of protectedRanks) {
    if (RANK[targetRank] >= RANK[callerRank]) {
      throw new TRPCError({ code: "FORBIDDEN", message: "That account outranks you." })
    }
  }
  return callerRank
}
