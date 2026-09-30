import { db, type Prisma } from "@sim-engine/db"

// A ban is active when it has no expiry, or its expiry is still ahead of us.
//
// Written down once because two separate mechanisms consult it: the check that
// runs before every privileged socket event, and the periodic sweep over
// already-connected sockets. If those two ever disagreed about what "banned"
// means, a revoked account would keep whichever half was more forgiving.
//
// Better Auth does not know about BanRecord and neither does the general tRPC
// context, so messaging has to ask explicitly until ban enforcement moves
// somewhere central.
function notExpired(now: Date): Prisma.BanRecordWhereInput[] {
  return [{ expiresAt: null }, { expiresAt: { gt: now } }]
}

export function activeBanFilter(userId: string, now: Date = new Date()): Prisma.BanRecordWhereInput {
  return { userId, OR: notExpired(now) }
}

// The same predicate for a batch. The periodic socket sweep checks every
// connected user at once rather than issuing a query per socket.
export function activeBansFilter(userIds: string[], now: Date = new Date()): Prisma.BanRecordWhereInput {
  return { userId: { in: userIds }, OR: notExpired(now) }
}

export async function hasActiveBan(userId: string): Promise<boolean> {
  const count = await db.banRecord.count({ where: activeBanFilter(userId) })
  return count > 0
}
