import { db, type StaffRoleType } from "@sim-engine/db"
import { hasActiveBan } from "./bans.js"
import { getStaffRole } from "./staff.js"
import { allow, deny, type Decision } from "./result.js"

// Who is acting, derived from the authenticated user and the game they are in.
//
// Note what is not here: any player account id supplied by the caller. Both
// transports resolve it from the session instead, so nobody can act as someone
// else by sending a different id.
export type MessagingActor = {
  userId: string
  gameId: string
  playerAccountId: string
  username: string
  staffRole: StaffRoleType | null
}

export async function resolveActor(userId: string, gameId: string): Promise<Decision<MessagingActor>> {
  // The three lookups do not depend on each other, so pay for one round trip
  // rather than three. This runs before every privileged socket event, not only
  // at connection time.
  const [banned, player, staffRole] = await Promise.all([
    hasActiveBan(userId),
    db.playerAccount.findUnique({
      where: { userId_gameId: { userId, gameId } },
      select: { id: true, username: true },
    }),
    getStaffRole(userId, gameId),
  ])

  if (banned) return deny("BANNED", "Your account cannot use messaging.")
  if (!player) return deny("NO_PLAYER_ACCOUNT", "You do not have a character in this game.")

  return allow({
    userId,
    gameId,
    playerAccountId: player.id,
    username: player.username,
    staffRole,
  })
}
