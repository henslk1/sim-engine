import { db } from "@sim-engine/db"

export async function notifyStaff(gameId: string, content: string, link: string) {
  const staffRoles = await db.staffRole.findMany({
    where: { OR: [{ gameId }, { gameId: null }] },
    select: { userId: true },
  })
  if (staffRoles.length === 0) return
  const staffUserIds = staffRoles.map(r => r.userId)
  const staffAccounts = await db.playerAccount.findMany({
    where: { userId: { in: staffUserIds }, gameId },
    select: { id: true },
  })
  if (staffAccounts.length === 0) return
  await db.notification.createMany({
    data: staffAccounts.map(a => ({
      gameId,
      recipientPlayerId: a.id,
      content,
      link,
    })),
  })
}
