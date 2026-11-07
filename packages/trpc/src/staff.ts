/**
 * Staff rank: what somebody may act as, and what rank must be outranked to act
 * on them.
 *
 * This file holds facts, not decisions. Nothing here throws and nothing here
 * imports tRPC, because `apps/server` reaches it through
 * `@sim-engine/trpc/messaging` for the socket handlers and that path is
 * deliberately free of tRPC. The assertions built on these live in `authz.ts`.
 *
 * Lifted out of `messaging/staff.ts`, which had the only correct evaluator in
 * the codebase and said so in its own comment. `messaging/staff.ts` is now a
 * re-export of this file, so every messaging import keeps working unchanged.
 */

import { db, type StaffRoleType } from "@sim-engine/db"

/**
 * Enough of a client to read roles. Satisfied by `db` and by a transaction
 * client.
 *
 * Every lookup here takes one, defaulting to the global client, because a
 * handler that is already inside a transaction must read roles **through that
 * transaction**. Reading through `db` from inside a transaction is the same
 * staleness the ownership helpers exist to avoid: the answer is from a
 * different snapshot than the write, and no lock the transaction holds applies
 * to it.
 */
export type StaffReader = Pick<typeof db, "staffRole">

/** Higher number outranks lower. StaffRole rows carry no ordering of their own. */
export const RANK: Record<StaffRoleType, number> = { MODERATOR: 1, ADMIN: 2, OWNER: 3 }

/** The strongest of a set of rows. Somebody may hold more than one. */
function highest(roles: readonly { role: StaffRoleType }[]): StaffRoleType | null {
  let held: StaffRoleType | null = null
  for (const { role } of roles) {
    if (held === null || RANK[role] > RANK[held]) held = role
  }
  return held
}

/**
 * The staff role this user holds where it counts for this game, or null.
 *
 * The two tiers are scoped differently by design: owners and admins are global,
 * one set of people across every game, while a moderator is appointed to a
 * particular game. So an owner or admin row applies here whatever its gameId
 * says, and a moderator row applies only when it names this game.
 *
 * A moderator row with no gameId grants nothing. It is a data error rather than
 * a global moderator, and reading it as "every game" would be exactly the
 * escalation this function exists to prevent - so `admin.ops.assignRole` will
 * not create one.
 *
 * This is the lookup for anything scoped to a game: support writes, the
 * moderation queue, channel administration. It is the wrong lookup for a
 * platform-wide action - see `getActingStaffRole`.
 */
export async function getStaffRole(
  userId: string,
  gameId: string,
  client: StaffReader = db
): Promise<StaffRoleType | null> {
  const roles = await client.staffRole.findMany({
    where: {
      userId,
      OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { role: "MODERATOR", gameId }],
    },
    select: { role: true },
  })
  return highest(roles)
}

/**
 * What this user may ACT as, anywhere - the rank question with no game in it.
 *
 * Well-formed rows only: an OWNER or ADMIN row is global by design, a MODERATOR
 * row needs its game to mean anything. A moderator with no gameId is a data
 * error, and honouring it here would turn that error into a grant.
 *
 * This is the lookup for the three rank procedures and for platform-wide
 * actions such as a ban, where asking `getStaffRole` about some particular
 * game would report every moderator appointed elsewhere as an ordinary player.
 */
export async function getActingStaffRole(
  userId: string,
  client: StaffReader = db
): Promise<StaffRoleType | null> {
  const roles = await client.staffRole.findMany({
    where: {
      userId,
      OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { role: "MODERATOR", gameId: { not: null } }],
    },
    select: { role: true },
  })
  return highest(roles)
}

/**
 * What rank must be OUTRANKED to act on this user. Every row counts, malformed
 * rows included.
 *
 * The asymmetry with `getActingStaffRole` is the whole point of there being two
 * functions. Ignoring a malformed row when *granting* prevents an escalation;
 * honouring it when *protecting* only over-protects, and over-protecting a
 * staff account is the safe failure. Merging them on the grounds that they look
 * alike reintroduces the bug in whichever direction loses.
 *
 * Returns null for an ordinary player, which is the overwhelming majority of
 * targets and the case that must stay unaffected.
 */
export async function getProtectedStaffRole(
  userId: string,
  client: StaffReader = db
): Promise<StaffRoleType | null> {
  return highest(await client.staffRole.findMany({ where: { userId }, select: { role: true } }))
}

/** The same question for a set of users, in one round trip. */
export async function getProtectedStaffRoles(
  userIds: readonly string[],
  client: StaffReader = db
): Promise<Map<string, StaffRoleType>> {
  const held = new Map<string, StaffRoleType>()
  if (userIds.length === 0) return held
  const rows = await client.staffRole.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: { userId: true, role: true },
  })
  for (const { userId, role } of rows) {
    const current = held.get(userId)
    if (current === undefined || RANK[role] > RANK[current]) held.set(userId, role)
  }
  return held
}

export function outranksOrEquals(held: StaffRoleType | null, required: StaffRoleType): boolean {
  return held !== null && RANK[held] >= RANK[required]
}

/**
 * Strictly greater, for acting on another staff member.
 *
 * Equal ranks must not act on each other, or two moderators remove one another
 * and an owner is banned by a second owner. `outranksOrEquals` is the right
 * comparison for "may this person use this feature" and the wrong one here.
 */
export function outranks(caller: StaffRoleType | null, target: StaffRoleType | null): boolean {
  if (caller === null) return false
  if (target === null) return true
  return RANK[caller] > RANK[target]
}
