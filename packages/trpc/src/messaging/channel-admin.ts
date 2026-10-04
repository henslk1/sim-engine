import { db, type ChannelType, type StaffRoleType } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import type { RealtimeControl } from "./realtime.js"
import { allow, deny, type Decision } from "./result.js"
import { GLOBAL_SCOPE_KEY, normalizeChannelName } from "./servers.js"

// Authority for everything in this file is established by channelAdminProcedure
// before any of it runs, so these functions check *scope* rather than rank: that
// the channel exists, belongs to this actor's game, and sits on the global
// server. An admin is global, which is exactly why the game has to be pinned
// down here — the role says nothing about which game was meant.

// What a channel change broadcasts. Deliberately only the parts that are the
// same for every player: canPost depends on who is asking, so it cannot travel
// in a message sent to a room. Clients refetch their own overview for that; this
// payload is what lets the sidebar update without waiting for the round trip.
export type ChannelBroadcast = {
  channelId: string
  name: string
  description: string | null
  channelType: ChannelType
  displayOrder: number | null
  defaultCanPost: boolean
  minimumStaffRole: StaffRoleType | null
  isArchived: boolean
}

const CHANNEL_SELECT = {
  id: true,
  name: true,
  description: true,
  channelType: true,
  displayOrder: true,
  defaultCanPost: true,
  minimumStaffRole: true,
  isArchived: true,
} as const

type ChannelRow = {
  id: string
  name: string | null
  description: string | null
  channelType: ChannelType
  displayOrder: number | null
  defaultCanPost: boolean
  minimumStaffRole: StaffRoleType | null
  isArchived: boolean
}

function toBroadcast(row: ChannelRow): ChannelBroadcast {
  return {
    channelId: row.id,
    name: row.name ?? "channel",
    description: row.description,
    channelType: row.channelType,
    displayOrder: row.displayOrder,
    defaultCanPost: row.defaultCanPost,
    minimumStaffRole: row.minimumStaffRole,
    isArchived: row.isArchived,
  }
}

async function globalServerId(gameId: string): Promise<string | null> {
  const server = await db.chatServer.findUnique({
    where: { gameId_scopeKey: { gameId, scopeKey: GLOBAL_SCOPE_KEY } },
    select: { id: true },
  })
  return server?.id ?? null
}

// Records the act, not its content. The row before and after is in the database;
// what an audit needs to add is who changed it and when.
async function logChannelAction(actor: MessagingActor, action: string, channelId: string) {
  await db.adminActionLog.create({
    data: {
      staffUserId: actor.userId,
      gameId: actor.gameId,
      action,
      targetType: "ChatChannel",
      targetId: channelId,
    },
  })
}

// A channel this actor may restructure: on their game's global server, and not
// a DM. Group channels are refused rather than silently included — group chat is
// not built, and an admin editing one would be editing something with no owner.
async function loadManageableChannel(
  actor: MessagingActor,
  channelId: string
): Promise<Decision<ChannelRow & { serverId: string }>> {
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      ...CHANNEL_SELECT,
      gameId: true,
      serverId: true,
      server: { select: { serverType: true } },
    },
  })

  if (!channel || channel.gameId !== actor.gameId || channel.serverId === null) {
    return deny("CHANNEL_NOT_FOUND", "That channel is not available.", "missing, another game, or a DM")
  }
  if (channel.server?.serverType === "GROUP") {
    return deny("GROUP_CHAT_UNAVAILABLE", "Group chat is not available yet.")
  }

  return allow({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    channelType: channel.channelType,
    displayOrder: channel.displayOrder,
    defaultCanPost: channel.defaultCanPost,
    minimumStaffRole: channel.minimumStaffRole,
    isArchived: channel.isArchived,
    serverId: channel.serverId,
  })
}

// Names are stored already normalized, so the uniqueness index is the whole
// rule: two channels cannot differ by casing or spacing alone. Normalizing can
// empty a string entirely — "###" has nothing left — which is what the first
// check catches.
async function resolveName(
  serverId: string,
  raw: string,
  exceptChannelId: string | null
): Promise<Decision<string>> {
  const name = normalizeChannelName(raw)
  if (name.length === 0) {
    return deny("CHANNEL_NAME_INVALID", "Channel names need at least one letter or number.")
  }

  const clash = await db.chatChannel.findUnique({
    where: { serverId_name: { serverId, name } },
    select: { id: true },
  })
  // A rename that lands on the channel's own current name is not a clash.
  if (clash && clash.id !== exceptChannelId) {
    return deny("CHANNEL_NAME_TAKEN", `There is already a #${name} channel.`)
  }

  return allow(name)
}

export async function createChannel(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: {
    name: string
    description?: string | null
    channelType: ChannelType
    defaultCanPost: boolean
    minimumStaffRole?: StaffRoleType | null
  }
): Promise<Decision<ChannelBroadcast>> {
  const serverId = await globalServerId(actor.gameId)
  if (!serverId) {
    return deny("CHANNEL_NOT_FOUND", "This game has no chat server yet.", "ensureGlobalChatServer has not run")
  }

  const name = await resolveName(serverId, input.name, null)
  if (!name.ok) return name

  // New channels go to the end of the list. Counting rather than reading the
  // maximum is fine because order is relative: a tie sorts by name, and a
  // reorder rewrites every position anyway.
  const displayOrder = await db.chatChannel.count({ where: { serverId } })

  const row = await db.chatChannel.create({
    data: {
      gameId: actor.gameId,
      serverId,
      name: name.value,
      description: input.description ?? null,
      channelType: input.channelType,
      defaultCanPost: input.defaultCanPost,
      minimumStaffRole: input.minimumStaffRole ?? null,
      displayOrder,
      createdByPlayerId: actor.playerAccountId,
    },
    select: CHANNEL_SELECT,
  })

  await logChannelAction(actor, "chat_channel_created", row.id)

  const broadcast = toBroadcast(row)
  // To the game rather than the channel: nobody has joined a channel that did
  // not exist a moment ago.
  realtime.emitToGame(actor.gameId, "channel:created", broadcast)
  return allow(broadcast)
}

export async function updateChannel(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: {
    channelId: string
    name?: string | undefined
    description?: string | null | undefined
    channelType?: ChannelType | undefined
    defaultCanPost?: boolean | undefined
    // null clears the restriction; absent leaves it alone.
    minimumStaffRole?: StaffRoleType | null | undefined
  }
): Promise<Decision<ChannelBroadcast>> {
  const channel = await loadManageableChannel(actor, input.channelId)
  if (!channel.ok) return channel

  let name: string | undefined
  if (input.name !== undefined) {
    const resolved = await resolveName(channel.value.serverId, input.name, channel.value.id)
    if (!resolved.ok) return resolved
    name = resolved.value
  }

  const row = await db.chatChannel.update({
    where: { id: channel.value.id },
    // Each field is written only when the caller sent it. A patch that omits a
    // field has to leave it alone rather than null it, and with
    // exactOptionalPropertyTypes on, an explicit `undefined` is not the same as
    // an absent key.
    data: {
      ...(name === undefined ? {} : { name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      // Changing the type is cosmetic — posting hangs on defaultCanPost alone,
      // so this only moves the icon. Editable so a channel created as the wrong
      // one does not have to be deleted and rebuilt.
      ...(input.channelType === undefined ? {} : { channelType: input.channelType }),
      ...(input.defaultCanPost === undefined ? {} : { defaultCanPost: input.defaultCanPost }),
      // Narrowing this hides the channel from anyone below the new rank the
      // moment the broadcast lands, and loadViewableChannel refuses them by id
      // from the same instant. Sockets already sitting in the room are a
      // separate problem — see disconnectUser at the role-change path.
      ...(input.minimumStaffRole === undefined ? {} : { minimumStaffRole: input.minimumStaffRole }),
    },
    select: CHANNEL_SELECT,
  })

  await logChannelAction(actor, "chat_channel_updated", row.id)

  const broadcast = toBroadcast(row)
  // Reaches everyone in the game, which includes everyone with this channel
  // open. Flipping defaultCanPost off is how a channel becomes read-only, and
  // this event is what closes the composer for them without a page refresh.
  realtime.emitToGame(actor.gameId, "channel:updated", broadcast)
  return allow(broadcast)
}

export async function setChannelArchived(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { channelId: string; isArchived: boolean }
): Promise<Decision<ChannelBroadcast>> {
  const channel = await loadManageableChannel(actor, input.channelId)
  if (!channel.ok) return channel

  const row = await db.chatChannel.update({
    where: { id: channel.value.id },
    data: { isArchived: input.isArchived },
    select: CHANNEL_SELECT,
  })

  await logChannelAction(
    actor,
    input.isArchived ? "chat_channel_archived" : "chat_channel_restored",
    row.id
  )

  const broadcast = toBroadcast(row)
  realtime.emitToGame(
    actor.gameId,
    input.isArchived ? "channel:archived" : "channel:updated",
    broadcast
  )
  return allow(broadcast)
}

// Writes the sidebar order.
//
// The caller has to name every channel on the server, not just the ones that
// moved. Dragging one channel changes the position of everything below it, so a
// partial list would leave the rest holding stale numbers that collide with the
// new ones — and the admin's screen already has the full list in hand.
export async function reorderChannels(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { channelIds: string[] }
): Promise<Decision<ChannelBroadcast[]>> {
  const serverId = await globalServerId(actor.gameId)
  if (!serverId) {
    return deny("CHANNEL_NOT_FOUND", "This game has no chat server yet.", "ensureGlobalChatServer has not run")
  }

  const existing = await db.chatChannel.findMany({ where: { serverId }, select: CHANNEL_SELECT })
  const incomplete = deny(
    "CHANNEL_ORDER_INCOMPLETE",
    "The channel list is out of date. Reload and try again."
  )

  // Set equality, checked three ways. Matching lengths alone would accept a list
  // that repeats one id and omits another, so the duplicate check and the
  // membership check are both load-bearing.
  if (input.channelIds.length !== existing.length) return incomplete
  if (new Set(input.channelIds).size !== existing.length) return incomplete
  const known = new Set(existing.map(channel => channel.id))
  if (input.channelIds.some(id => !known.has(id))) return incomplete

  const byId = new Map(existing.map(channel => [channel.id, channel]))
  const moved = input.channelIds
    .map((id, displayOrder) => ({ row: byId.get(id) as ChannelRow, displayOrder }))
    .filter(entry => entry.row.displayOrder !== entry.displayOrder)
  if (moved.length === 0) return allow([])

  // One transaction: a half-applied reorder is a list in an order nobody chose.
  await db.$transaction(
    moved.map(entry =>
      db.chatChannel.update({
        where: { id: entry.row.id },
        data: { displayOrder: entry.displayOrder },
      })
    )
  )

  await logChannelAction(actor, "chat_channels_reordered", serverId)

  const broadcasts = moved.map(entry => toBroadcast({ ...entry.row, displayOrder: entry.displayOrder }))
  for (const broadcast of broadcasts) {
    realtime.emitToGame(actor.gameId, "channel:updated", broadcast)
  }
  return allow(broadcasts)
}
