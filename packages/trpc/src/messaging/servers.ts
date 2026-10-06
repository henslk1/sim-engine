import { db } from "@sim-engine/db"

// The non-null stand-in for a null groupId, so the unique key on
// (gameId, scopeKey) can enforce one global server per game.
export const GLOBAL_SCOPE_KEY = "GLOBAL"

// Channel names are stored already normalized, Discord style. There is no
// separate display form, so the unique key on (serverId, name) is the whole
// story — two channels cannot differ by casing or spacing alone.
export function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

const DEFAULT_CHANNELS = [
  {
    name: "announcements",
    description: "News and updates from the team.",
    channelType: "ANNOUNCEMENT",
    defaultCanPost: false,
  },
  {
    name: "general",
    description: "Everything else.",
    channelType: "TEXT",
    defaultCanPost: true,
  },
  {
    name: "testing-feedback",
    description: "Small bugs, questions and observations. Anything that needs tracking belongs in a bug report.",
    channelType: "TEXT",
    defaultCanPost: true,
  },
  {
    name: "known-issues",
    description: "Problems already being worked on.",
    channelType: "ANNOUNCEMENT",
    defaultCanPost: false,
  },
  // The two restricted rooms. minimumStaffRole hides them from everyone below
  // the rank; defaultCanPost stays true because everyone who can see a staff
  // room is staff and should be able to talk in it.
  {
    name: "staff",
    description: "Moderators and above. Not visible to players.",
    channelType: "TEXT",
    defaultCanPost: true,
    minimumStaffRole: "MODERATOR",
  },
  {
    name: "admin",
    description: "Admins and owners only.",
    channelType: "TEXT",
    defaultCanPost: true,
    minimumStaffRole: "ADMIN",
  },
] as const

// Gives a game its global chat server and starting channels.
//
// Safe to run repeatedly: every write is an upsert whose update clause is
// empty, so re-running restores anything missing without touching what is
// already there. A renamed description, a channel switched to read-only or one
// that has been archived all survive — this provisions, it does not reset.
export async function ensureGlobalChatServer(gameId: string): Promise<{ id: string }> {
  const server = await db.chatServer.upsert({
    where: { gameId_scopeKey: { gameId, scopeKey: GLOBAL_SCOPE_KEY } },
    create: {
      gameId,
      scopeKey: GLOBAL_SCOPE_KEY,
      serverType: "GLOBAL",
      name: "Global",
      description: "Game-wide channels.",
    },
    update: {},
    select: { id: true },
  })

  let announcementChannelId: string | null = null
  for (const [index, channel] of DEFAULT_CHANNELS.entries()) {
    const name = normalizeChannelName(channel.name)
    const saved = await db.chatChannel.upsert({
      where: { serverId_name: { serverId: server.id, name } },
      create: {
        gameId,
        serverId: server.id,
        name,
        description: channel.description,
        channelType: channel.channelType,
        defaultCanPost: channel.defaultCanPost,
        // Absent on the open channels, which is what null means here.
        minimumStaffRole: "minimumStaffRole" in channel ? channel.minimumStaffRole : null,
        displayOrder: index,
      },
      update: {},
      select: { id: true },
    })
    if (name === "announcements") announcementChannelId = saved.id
  }

  if (announcementChannelId !== null) {
    await db.chatServer.update({
      where: { id: server.id },
      data: { announcementChannelId },
    })
  }

  return server
}
