import { db, type ChannelType } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import { canManageChannels, evaluatePosting, type ChannelAccess } from "./permissions.js"
import { GLOBAL_SCOPE_KEY } from "./servers.js"

// The badge stops counting here. A client renders "99+" past it, so there is no
// reason to pay for an exact figure — see countUnread for what that saves.
export const UNREAD_BADGE_CAP = 99

export type ChannelSummary = {
  channelId: string
  name: string
  description: string | null
  channelType: ChannelType
  displayOrder: number | null
  // The channel's configured posting rule, as distinct from canPost below:
  // this one is the same for everybody, that one is this caller's answer. Staff
  // can post in a channel whose defaultCanPost is false, so the two disagree for
  // them — which is exactly why the admin screen needs this field and cannot
  // infer the setting from canPost.
  defaultCanPost: boolean
  isArchived: boolean
  // Capped at UNREAD_BADGE_CAP + 1. A value above the cap means "at least this
  // many", which is all the badge can show anyway.
  unreadCount: number
  // Computed by the server because it cannot be derived on the client: posting
  // combines defaultCanPost, the caller's staff role and the channel's archival
  // state. The composer renders from these two fields.
  canPost: boolean
  cannotPostReason: string | null
}

export type MessagingOverview = {
  server: { id: string; name: string; description: string | null; isArchived: boolean } | null
  channels: ChannelSummary[]
  totalUnread: number
}

// How many messages this player has not seen in one channel.
//
// `after` is the createdAt of the message their read pointer names, not the
// time they pressed anything — see loadMessagingOverview for why that matters.
// Null means they have never opened the channel, so everything counts.
//
// Stops at the cap rather than using count(). A player who has never opened a
// busy channel would otherwise make the database tally every message in it to
// produce a number the interface renders as "99+". Reading at most 100 ids from
// the (channelId, createdAt, id) index answers the same question.
async function countUnread(
  channelId: string,
  playerAccountId: string,
  after: Date | null
): Promise<number> {
  const rows = await db.chatMessage.findMany({
    where: {
      channelId,
      // A tombstone has nothing to read, so it should not light up a badge.
      deletedAt: null,
      // Neither should your own messages. Sending in a channel is as good as
      // having read it.
      authorPlayerId: { not: playerAccountId },
      ...(after === null ? {} : { createdAt: { gt: after } }),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: UNREAD_BADGE_CAP + 1,
  })
  return rows.length
}

// Everything the widget needs to draw its channel list in one call: the game's
// global server, its channels in display order, each one's unread count, and
// whether this player may post in it.
//
// Direct messages are not here yet. They are a second list beside this one
// rather than more entries in it, so adding them in Phase 2 is an extra field
// on MessagingOverview rather than a change to this shape.
export async function loadMessagingOverview(actor: MessagingActor): Promise<MessagingOverview> {
  const server = await db.chatServer.findUnique({
    where: { gameId_scopeKey: { gameId: actor.gameId, scopeKey: GLOBAL_SCOPE_KEY } },
    select: { id: true, name: true, description: true, isArchived: true },
  })
  // A game whose global server was never provisioned. Returning an empty list
  // is right: there is genuinely nothing to show, and ensureGlobalChatServer is
  // what fixes it.
  if (!server) return { server: null, channels: [], totalUnread: 0 }

  // Admins keep seeing archived channels because they are the ones who archive
  // and restore them. For everyone else an archived channel leaves the list.
  // Its history stays reachable by id — archiving stops new messages, it does
  // not hide what was said — it simply stops occupying a row in the sidebar.
  const showArchived = canManageChannels(actor).ok

  const channels = await db.chatChannel.findMany({
    where: { serverId: server.id, ...(showArchived ? {} : { isArchived: false }) },
    // Postgres sorts nulls last in an ascending order, which is what we want: a
    // channel nobody has given a position to falls to the bottom rather than
    // jumping to the top.
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      gameId: true,
      name: true,
      description: true,
      channelType: true,
      displayOrder: true,
      defaultCanPost: true,
      isArchived: true,
    },
  })
  if (channels.length === 0) return { server, channels: [], totalUnread: 0 }

  const readStatuses = await db.messageReadStatus.findMany({
    where: {
      playerAccountId: actor.playerAccountId,
      chatChannelId: { in: channels.map(channel => channel.id) },
    },
    // The watermark is the read message's own createdAt, not lastReadAt.
    // lastReadAt records when the player pressed something, which is always a
    // little after the message they were looking at — so counting from it would
    // silently swallow anything that arrived in that gap.
    select: { chatChannelId: true, lastReadMessage: { select: { createdAt: true } } },
  })
  const watermarks = new Map(
    readStatuses.map(status => [status.chatChannelId, status.lastReadMessage?.createdAt ?? null])
  )

  const summaries = await Promise.all(
    channels.map(async (channel): Promise<ChannelSummary> => {
      // The same evaluator the send path uses, fed from data already in hand.
      // One function decides both, so the composer cannot disagree with the
      // server about whether a message would be accepted.
      const access: ChannelAccess = {
        channel: {
          id: channel.id,
          gameId: channel.gameId,
          channelType: channel.channelType,
          name: channel.name,
          defaultCanPost: channel.defaultCanPost,
          isArchived: channel.isArchived,
        },
        server: { id: server.id, serverType: "GLOBAL", isArchived: server.isArchived },
        directMessage: null,
        blockedEitherWay: false,
      }
      const posting = evaluatePosting(actor, access)

      return {
        channelId: channel.id,
        // Server channels always have a name; the column is nullable only
        // because DM channels share the table.
        name: channel.name ?? "channel",
        description: channel.description,
        channelType: channel.channelType,
        displayOrder: channel.displayOrder,
        defaultCanPost: channel.defaultCanPost,
        isArchived: channel.isArchived,
        unreadCount: await countUnread(
          channel.id,
          actor.playerAccountId,
          watermarks.get(channel.id) ?? null
        ),
        canPost: posting.ok,
        cannotPostReason: posting.ok ? null : posting.message,
      }
    })
  )

  return {
    server,
    channels: summaries,
    totalUnread: summaries.reduce((sum, channel) => sum + channel.unreadCount, 0),
  }
}
