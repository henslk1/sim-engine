import { db, type StaffRoleType } from "@sim-engine/db"

// Higher number outranks lower. StaffRole rows carry no ordering of their own.
const RANK: Record<StaffRoleType, number> = { MODERATOR: 1, ADMIN: 2, OWNER: 3 }

// The staff role this user holds where it counts for this game, or null.
//
// The two tiers are scoped differently by design: owners and admins are global,
// one set of people across every game, while a moderator is appointed to a
// particular game. So an owner or admin row applies here whatever its gameId
// says, and a moderator row applies only when it names this game.
//
// A moderator row with no gameId grants nothing. It is a data error rather than
// a global moderator, and reading it as "every game" would be exactly the
// escalation this function exists to prevent — so `admin.ops.assignRole` will
// not create one.
//
// `staffProcedure` in trpc.ts asks only `staffRole.findFirst({ where: { userId } })`,
// which matches any role in any game: a moderator on one game satisfies that
// guard everywhere. Messaging cannot use it.
export async function getStaffRole(userId: string, gameId: string): Promise<StaffRoleType | null> {
  const roles = await db.staffRole.findMany({
    where: {
      userId,
      OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { role: "MODERATOR", gameId }],
    },
    select: { role: true },
  })
  // Someone may hold more than one row; the strongest one wins.
  let held: StaffRoleType | null = null
  for (const { role } of roles) {
    if (held === null || RANK[role] > RANK[held]) held = role
  }
  return held
}

export function outranksOrEquals(held: StaffRoleType | null, required: StaffRoleType): boolean {
  return held !== null && RANK[held] >= RANK[required]
}
