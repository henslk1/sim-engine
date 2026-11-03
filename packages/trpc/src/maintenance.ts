/**
 * The nightly maintenance window: who is in one, and what it stops.
 *
 * A game is in maintenance while its nightly update is outstanding. Two things
 * depend on knowing that — the countdown and banner the players see, and the
 * server-side block that stops gameplay mutations landing halfway through an
 * animal being aged.
 *
 * **The database is the authority.** This used to be an in-memory map kept
 * current by the scheduler, which made the block a property of the process
 * rather than of the game, and that failed in three ways that all looked like
 * "gameplay stayed open during an update":
 *
 *   - a process started with `SCHEDULER_BACKEND=none` never ran a tick, so its
 *     map stayed empty for ever and it blocked nothing at all;
 *   - the port opened before the first sync, so the earliest requests after a
 *     restart were served against an empty map;
 *   - the sync ran once per tick, and the tick sleeps up to fifteen minutes
 *     when idle, so a nightly starting on another instance went unnoticed for
 *     as long as that.
 *
 * Memory is still here, but its role is inverted: it may *refuse* a mutation
 * without a query, and it may never *allow* one. Anything the map does not
 * already know to be blocked is resolved against the database. That costs one
 * indexed read per gameplay mutation, on requests that were going to talk to
 * the database anyway, and nothing at all while nobody is playing.
 *
 * What counts as outstanding is the run's status, not its lease. A nightly
 * whose worker died is still PENDING or RETRYING, so it keeps blocking until
 * somebody finishes or cancels it — a lapsed lease means recovery is needed,
 * which is the last moment to let gameplay back in. Ownership is the run's
 * `claimedBy` token, and clearing is fenced on it by the scheduler's `finish`,
 * so a worker that lost its lease cannot clear the block its replacement holds.
 */

import { TRPCError } from "@trpc/server"
import { db, type Prisma } from "@sim-engine/db"

export type MaintenanceWindow = {
  runId: string
  startedAt: Date
}

/**
 * The run states that close a game.
 *
 * PENDING is deliberately not one of them, which is the policy `game.ts`
 * already documented: a run row exists for a moment before anything claims it,
 * and shutting gameplay for a nightly that has not started is worse than the
 * second it costs to wait. Nothing is lost by it either — the nightly takes the
 * game's lock exclusively as it moves PENDING to RUNNING, so a mutation in
 * flight at that instant still finishes first and the next one is refused.
 *
 * RETRYING is, because the work is incomplete and will be picked up again.
 * Neither depends on the lease: a worker that died leaves the run RUNNING with
 * a lapsed lease, and that is the moment recovery is needed, not the moment to
 * let gameplay back in.
 *
 * Exported because anything else deciding "is this game shut" has to decide it
 * the same way. The competition resolver had its own version - RUNNING only,
 * and only with a live lease - so it went on resolving in games the guard was
 * refusing gameplay in, which is the one place two definitions could not be
 * allowed to differ.
 */
export const MAINTENANCE_STATUSES = ["RUNNING", "RETRYING"] as const
const OUTSTANDING = MAINTENANCE_STATUSES

/**
 * Games this process knows to be updating.
 *
 * A hint, not a source of truth: present means blocked, absent means ask. It
 * exists so the process actually running a nightly — and every process that has
 * heard the socket event — can refuse without a query, and so the banner has
 * something to read between polls.
 */
type Hint = MaintenanceWindow & {
  /** After this, the hint may no longer refuse on its own. */
  revalidateAfter: number
}

const known = new Map<string, Hint>()

/**
 * How long a hint may refuse without consulting the database.
 *
 * Short, because the hint's expiry means "ask again", never "let them in". A
 * stale entry falls through to the authoritative read, which either refreshes
 * it or removes it.
 *
 * Getting this wrong locked players out permanently: the first version refused
 * on `known.has(gameId)` with no expiry at all, so a process that had once
 * heard a game was updating never asked again, and the read that would have
 * cleared the entry sat below a branch that could not be reached. The nightly
 * finished and the game stayed shut.
 */
const HINT_TTL_MS = 10_000

/** Mark a game as updating, or clear it. Called by the scheduler. */
export function setGameMaintenance(
  gameId: string,
  window: MaintenanceWindow | null
): void {
  if (!window) {
    known.delete(gameId)
    return
  }
  known.set(gameId, { ...window, revalidateAfter: Date.now() + HINT_TTL_MS })
}

/**
 * Replace the hint map with what the database says is outstanding.
 *
 * Still called every tick. It no longer decides anything on its own — the guard
 * reads through to the database — but keeping it current means the common case
 * is answered without one.
 */
export function syncGameMaintenance(
  running: Array<{ gameId: string; runId: string; startedAt: Date }>
): void {
  const seen = new Set<string>()
  for (const run of running) {
    seen.add(run.gameId)
    known.set(run.gameId, {
      runId: run.runId,
      startedAt: run.startedAt,
      revalidateAfter: Date.now() + HINT_TTL_MS,
    })
  }
  for (const gameId of [...known.keys()]) {
    if (!seen.has(gameId)) known.delete(gameId)
  }
}

/** What this process currently believes, without asking. For the hint only. */
export function knownGameMaintenance(gameId: string): MaintenanceWindow | null {
  const hint = known.get(gameId)
  return hint ? { runId: hint.runId, startedAt: hint.startedAt } : null
}

type Client = Pick<typeof db, "scheduledTaskRun" | "animal" | "playerAccount">

/**
 * Whether a game is mid-update, according to the database.
 *
 * The one authoritative answer. `startedAt` falls back through `claimedAt` to
 * the boundary the run was scheduled for, so a run that has not been claimed
 * yet still reports a sensible beginning to the countdown.
 */
export async function readGameMaintenance(
  gameId: string,
  client: Client = db
): Promise<MaintenanceWindow | null> {
  const run = await client.scheduledTaskRun.findFirst({
    where: { gameId, taskType: "NIGHTLY", status: { in: [...OUTSTANDING] } },
    orderBy: { scheduledFor: "desc" },
    select: { id: true, startedAt: true, claimedAt: true, scheduledFor: true },
  })
  if (!run) {
    // Only ever removes an entry. A process that has heard a socket event it
    // has no run row for is wrong about that, and this is where it finds out.
    known.delete(gameId)
    return null
  }

  const window = {
    runId: run.id,
    startedAt: run.startedAt ?? run.claimedAt ?? run.scheduledFor,
  }
  known.set(gameId, { ...window, revalidateAfter: Date.now() + HINT_TTL_MS })
  return window
}

/**
 * Paths that keep working while a game updates.
 *
 * Signing out is not here because it never reaches tRPC — better-auth serves
 * `/api/auth/**` directly, so it is unaffected by anything in this file.
 * Queries are not here either: the guard runs on mutations only, so reading
 * the game's state, including the maintenance status itself, always works.
 */
function isExempt(path: string): boolean {
  // Staff need their recovery controls precisely when an update is stuck.
  if (path.startsWith("admin.")) return true
  // Chat stays up. It is not gameplay, it cannot touch an animal, and an
  // update in progress is exactly when players want to ask about it. The
  // tutorial guard exempts messaging for the same reason.
  if (path.startsWith("messaging.")) return true
  if (path.startsWith("bugReport.") || path.startsWith("supportTicket.")) return true
  return false
}

function blocked(): TRPCError {
  return new TRPCError({ code: "CONFLICT", message: "GAME_UPDATE_IN_PROGRESS" })
}

/**
 * Which game a mutation is about to change.
 *
 * Named directly where the input says so, and otherwise resolved from the thing
 * being acted on, because "the caller has an account in some updating game" is
 * a different question from "this write lands in an updating game". The last
 * branch is still the broad one, and is deliberately conservative: a caller
 * whose game cannot be identified is treated as being in all of theirs.
 */
async function gamesFor(
  userId: string | null,
  input: Record<string, unknown>,
  client: Client
): Promise<string[]> {
  const named = input["gameId"]
  if (typeof named === "string") return [named]

  const animalId = input["animalId"]
  if (typeof animalId === "string") {
    const animal = await client.animal.findUnique({
      where: { id: animalId },
      select: { gameId: true },
    })
    if (animal) return [animal.gameId]
  }

  if (!userId) return []
  const players = await client.playerAccount.findMany({
    where: { userId },
    select: { gameId: true },
  })
  return players.map((p) => p.gameId)
}

/**
 * Refuse a gameplay mutation while its game is updating.
 *
 * The plan is explicit that disabled buttons are not a block: this is the
 * enforcement, and the client's redirect is only the courtesy that stops a
 * player meeting it as an error.
 */
export async function guardGameMaintenance(
  userId: string | null,
  path: string,
  raw: unknown,
  client: Client = db
): Promise<void> {
  if (isExempt(path)) return

  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const games = await gamesFor(userId, input, client)
  if (games.length === 0) return

  // A fresh hint refuses without a query. A stale one does not decide anything:
  // it falls through to the read below, which refreshes it or clears it. The
  // one thing memory may never do is let a mutation past.
  const now = Date.now()
  for (const gameId of games) {
    const hint = known.get(gameId)
    if (hint && hint.revalidateAfter > now) throw blocked()
  }

  for (const gameId of games) {
    if (await readGameMaintenance(gameId, client)) throw blocked()
  }
}

/**
 * The advisory-lock key for one game's maintenance.
 *
 * Postgres advisory locks are keyed by number, so the game's id is hashed into
 * one. Two keys colliding would make two games wait on each other, which costs
 * a little concurrency and breaks nothing.
 */
export function maintenanceLockKey(gameId: string): bigint {
  return lockKey(gameId)
}

/**
 * The advisory-lock key for one game's *scheduling*.
 *
 * A second key, in a different space, and deliberately not the maintenance
 * one. They answer different questions and are held by different things:
 *
 *   maintenance  players hold it shared for the length of a write; a nightly
 *                takes it exclusively as it starts, which is what makes the
 *                writes already in flight land first.
 *   schedule     every claim takes it exclusively, for the length of the
 *                claim and nothing more. It serialises *schedulers* against
 *                each other for one game, and no player ever touches it.
 *
 * Using the maintenance lock for both would make a competition sweep's claim
 * wait for every gameplay transaction in the game - and hold players out while
 * it did - to answer a question no player is part of.
 */
export function scheduleLockKey(gameId: string): bigint {
  return lockKey(`schedule:${gameId}`)
}

/** FNV-1a, 64-bit, folded into the signed range Postgres accepts. */
function lockKey(value: string): bigint {
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return BigInt.asIntN(64, hash)
}

type RawClient = Pick<Prisma.TransactionClient, "$executeRaw" | "$executeRawUnsafe">

/**
 * Take the game's maintenance lock exclusively, for the transaction.
 *
 * Called by the scheduler as it marks a nightly RUNNING. Gameplay mutations
 * hold the same lock in shared mode, so this waits for the ones already in
 * flight and makes them finish before the nightly changes anything — which is
 * the half a status check cannot do on its own, since a nightly can begin
 * between a check and the write it was protecting.
 *
 * Transaction-scoped on purpose. The lock covers the moment the run becomes
 * RUNNING, not the hours of work after it; from then on the run's status is
 * what refuses later mutations, and holding a lock across the whole nightly
 * would serialise every player behind it for no benefit.
 */
export class GameplayDrainTimeout extends Error {
  // Declared and assigned rather than written as constructor parameter
  // properties. Those are TypeScript syntax with a runtime effect, which the
  // web build refuses: it type-strips rather than compiling, so anything that
  // is not erasable has to be written out.
  readonly gameId: string
  readonly waitedMs: number

  constructor(gameId: string, waitedMs: number) {
    super(`gameplay in game ${gameId} did not drain within ${waitedMs}ms`)
    this.name = "GameplayDrainTimeout"
    this.gameId = gameId
    this.waitedMs = waitedMs
  }
}

/** Postgres: "canceling statement due to lock timeout". */
const LOCK_TIMEOUT_SQLSTATE = "55P03"

function isLockTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  // The driver reports a raw-query failure and keeps the SQLSTATE in the text.
  const message = error instanceof Error ? error.message : ""
  return message.includes(LOCK_TIMEOUT_SQLSTATE)
}

export async function lockGameForMaintenance(
  tx: RawClient,
  gameId: string,
  waitMs: number
): Promise<void> {
  // `lock_timeout` applies to advisory locks, and a lock it cancels raises
  // 55P03 - "canceling statement due to lock timeout". That is the evidence
  // this needs and nothing else provides: it says we waited for *this lock*
  // and did not get it.
  //
  // The transaction's own timeout cannot say that. It expires for any reason a
  // transaction can be slow, and Prisma reports expiry, an already-closed
  // transaction and a connection that never arrived under one code - so
  // treating that code as contention would have counted pool starvation and
  // ordinary bugs as "gameplay is busy", which is the opposite of a useful
  // signal.
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${Math.max(1, Math.floor(waitMs))}ms'`)
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${maintenanceLockKey(gameId)}::bigint)`
  } catch (error) {
    if (isLockTimeout(error)) throw new GameplayDrainTimeout(gameId, waitMs)
    throw error
  } finally {
    // Back to no limit for the rest of the transaction. The wait being bounded
    // is about gameplay draining, not about every row this claim then touches.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = 0").catch(() => {})
  }
}

/**
 * One scheduler at a time, per game, for the length of a claim.
 *
 * Without this, two instances claiming at the same moment each decided what to
 * run from their own snapshot of the game's runs, and both snapshots were
 * taken before either claim. Each one's claim succeeded, because they were
 * claiming *different* runs: instance A took the nightly, instance B found the
 * nightly already gone and took the competition sweep behind it. The planner's
 * "one run at a time within a game" held inside each process and nowhere
 * between them, and the two ran that game's nightly and its sweep together.
 *
 * Bounded, like the maintenance wait and for the same reason: a claim that
 * cannot get in has written nothing, so the run stays claimable and the next
 * tick tries again. Waiting indefinitely behind another instance's claim -
 * which may itself be waiting out a gameplay drain - would make one slow game
 * hold up this tick's other games.
 */
export class ScheduleLockTimeout extends Error {
  readonly gameId: string
  readonly waitedMs: number

  constructor(gameId: string, waitedMs: number) {
    super(`another scheduler held game ${gameId} for longer than ${waitedMs}ms`)
    this.name = "ScheduleLockTimeout"
    this.gameId = gameId
    this.waitedMs = waitedMs
  }
}

export async function lockGameSchedule(
  tx: RawClient,
  gameId: string,
  waitMs: number
): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${Math.max(1, Math.floor(waitMs))}ms'`)
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${scheduleLockKey(gameId)}::bigint)`
  } catch (error) {
    if (isLockTimeout(error)) throw new ScheduleLockTimeout(gameId, waitMs)
    throw error
  } finally {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = 0").catch(() => {})
  }
}

/** Join the game in shared mode, for the duration of the caller's transaction. */
export async function joinGameplay(tx: RawClient, gameId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${maintenanceLockKey(gameId)}::bigint)`
}

/**
 * Was this thrown by the gameplay block, rather than by the work itself?
 *
 * The block is a `TRPCError` because almost everything that meets it is a
 * tRPC mutation. The competition resolver is not - it is a background worker
 * that now opens through the same `enterGameplay` - and it has to tell "this
 * game is shut, hand the item back" apart from "this competition could not be
 * resolved", because only one of those is worth an attempt.
 */
export function isMaintenanceBlock(error: unknown): boolean {
  return error instanceof Error && error.message.includes("GAME_UPDATE_IN_PROGRESS")
}

/** What `enterGameplay` needs: the shared lock, and the recheck under it. */
type GameplayTx = RawClient &
  Pick<Prisma.TransactionClient, "scheduledTaskRun" | "animal" | "playerAccount">

/**
 * Open a gameplay write for one game, inside the caller's transaction.
 *
 * Every gameplay mutation begins here, and the order is the point:
 *
 *   1. take the game's lock in shared mode. A nightly claiming the game holds
 *      the same lock exclusively, so either it is not started — and now cannot
 *      start until this transaction ends — or this waits for it.
 *   2. re-read the run status **through the same transaction**. The guard in
 *      the middleware already asked, but that answer was from before this
 *      transaction existed and a nightly could have begun since. This is the
 *      answer that is still true when the write lands.
 *
 * Both halves are needed. The lock without the recheck lets through a mutation
 * that was waiting on a nightly which has since started; the recheck without
 * the lock is the race it was supposed to close.
 *
 * Everything the mutation does afterwards — reads it decides on as much as
 * writes — belongs on the same `tx`. Work that escapes to the global client is
 * outside the lock and outside the transaction, so it is unprotected however
 * carefully the mutation was opened.
 */
export async function enterGameplay(tx: GameplayTx, gameId: string): Promise<void> {
  await joinGameplay(tx, gameId)
  if (await readGameMaintenance(gameId, tx)) throw blocked()
}

/** `enterGameplay`, for a mutation that names an animal rather than a game. */
export async function enterGameplayForAnimal(tx: GameplayTx, animalId: string): Promise<string> {
  // Deliberately before the lock and deliberately minimal: an animal's game is
  // not a decision, it is an address, and it cannot change under us.
  const animal = await tx.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: { gameId: true },
  })
  await enterGameplay(tx, animal.gameId)
  return animal.gameId
}

/**
 * `enterGameplay`, for a mutation that names a pregnancy, listing or offer.
 *
 * Each of these carries its game, directly or through the animal it belongs to.
 * The address read happens before the lock on purpose — which game a pregnancy
 * is in is not a decision and cannot change — and everything the mutation then
 * decides on is read again under it.
 */
export async function enterGameplayForPregnancy(tx: GameplayTx, pregnancyId: string): Promise<string> {
  const pregnancy = await (tx as unknown as Prisma.TransactionClient).pregnancy.findUniqueOrThrow({
    where: { id: pregnancyId },
    select: { animal: { select: { gameId: true } } },
  })
  await enterGameplay(tx, pregnancy.animal.gameId)
  return pregnancy.animal.gameId
}

export async function enterGameplayForListing(tx: GameplayTx, listingId: string): Promise<string> {
  const listing = await (tx as unknown as Prisma.TransactionClient).breedingListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { gameId: true },
  })
  await enterGameplay(tx, listing.gameId)
  return listing.gameId
}

export async function enterGameplayForCoverOffer(tx: GameplayTx, offerId: string): Promise<string> {
  const offer = await (tx as unknown as Prisma.TransactionClient).coverOffer.findUniqueOrThrow({
    where: { id: offerId },
    select: { gameId: true },
  })
  await enterGameplay(tx, offer.gameId)
  return offer.gameId
}

/**
 * Refuse a mutation whose participants are not all in the locked game.
 *
 * Locking a game is only protection if it is the right game. A mutation that
 * takes a player account and a resource can be handed two that live in
 * different games: resolving the lock from the account then leaves the resource
 * entirely unguarded, and the write lands in a game nobody checked. Reproduced
 * exactly that way - a treatment administered in an updating game while a
 * quiet one was the one being locked.
 *
 * So the game is resolved from the affected resource, and everything else named
 * by the mutation is checked against it here.
 */
export async function assertParticipantsInGame(
  tx: GameplayTx,
  gameId: string,
  participants: { animalIds?: readonly string[]; playerAccountIds?: readonly string[] }
): Promise<void> {
  const animalIds = [...new Set(participants.animalIds ?? [])]
  const playerAccountIds = [...new Set(participants.playerAccountIds ?? [])]

  if (animalIds.length > 0) {
    const inGame = await tx.animal.count({ where: { id: { in: animalIds }, gameId } })
    if (inGame !== animalIds.length) throw wrongGame()
  }

  if (playerAccountIds.length > 0) {
    const inGame = await tx.playerAccount.count({
      where: { id: { in: playerAccountIds }, gameId },
    })
    if (inGame !== playerAccountIds.length) throw wrongGame()
  }
}

function wrongGame(): TRPCError {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: "Every animal and account in one action must belong to the same game.",
  })
}

/** `enterGameplay`, for a mutation that names a player account. */
export async function enterGameplayForPlayer(
  tx: GameplayTx,
  playerAccountId: string
): Promise<string> {
  const player = await tx.playerAccount.findUniqueOrThrow({
    where: { id: playerAccountId },
    select: { gameId: true },
  })
  await enterGameplay(tx, player.gameId)
  return player.gameId
}
