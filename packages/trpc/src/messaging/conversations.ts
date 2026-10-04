import { db } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import { isUniqueViolation } from "./db-errors.js"
import { canonicalDirectMessagePair, canOpenDirectMessage } from "./permissions.js"
import { conversationRateLimit, retryWording } from "./rate-limit.js"
import { allow, deny, type Decision } from "./result.js"

export type DirectConversation = {
  directMessageId: string
  channelId: string
  // False when an existing conversation was returned. A rate limiter for new
  // conversations reads this rather than charging every lookup.
  created: boolean
}

// Finds the conversation between two players, or opens one.
//
// The lookup comes before the policy check, deliberately. A block stops new
// messages, not access to a conversation that already exists — the history
// stays reachable for both people, and the composer is what closes. Reversing
// these two would make a blocked conversation vanish instead.
export async function getOrCreateDirectMessage(
  actor: MessagingActor,
  input: { targetPlayerAccountId: string }
): Promise<Decision<DirectConversation>> {
  const pair = canonicalDirectMessagePair(actor.playerAccountId, input.targetPlayerAccountId)
  const key = { gameId: actor.gameId, ...pair }

  const existing = await db.directMessage.findUnique({
    where: { gameId_participantLowId_participantHighId: key },
    select: { id: true, chatChannelId: true },
  })
  if (existing) {
    return allow({ directMessageId: existing.id, channelId: existing.chatChannelId, created: false })
  }

  const permitted = await canOpenDirectMessage(actor, input.targetPlayerAccountId)
  if (!permitted.ok) return permitted

  // Only a genuinely new conversation is charged. The lookup above returns
  // early for one that already exists, so reopening an old thread is free —
  // which is the whole reason `created` is on the return value.
  const budget = conversationRateLimit.check(actor.playerAccountId)
  if (!budget.ok) {
    return deny(
      "RATE_LIMITED",
      `You've started a lot of new conversations. ${retryWording(budget.retryAfterMs)}`
    )
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const channel = await tx.chatChannel.create({
        data: { gameId: actor.gameId, channelType: "DM", createdByPlayerId: actor.playerAccountId },
        select: { id: true },
      })
      return tx.directMessage.create({
        data: { ...key, chatChannelId: channel.id },
        select: { id: true, chatChannelId: true },
      })
    })
    return allow({ directMessageId: created.id, channelId: created.chatChannelId, created: true })
  } catch (error) {
    // Both people can press message at the same moment. The unique key on the
    // canonical pair is what stops that becoming two conversations; the loser
    // reads the winner's row and neither of them notices.
    if (isUniqueViolation(error)) {
      const raced = await db.directMessage.findUnique({
        where: { gameId_participantLowId_participantHighId: key },
        select: { id: true, chatChannelId: true },
      })
      if (raced) {
        return allow({ directMessageId: raced.id, channelId: raced.chatChannelId, created: false })
      }
    }
    throw error
  }
}

// How many conversations the sidebar holds. Ordered by recency, so the cut is
// at the quiet end — old threads stay reachable by id, they just stop taking up
// space in a list nobody scrolls.
export const DM_LIST_LIMIT = 30

export type DirectConversationSummary = {
  directMessageId: string
  channelId: string
  participant: { playerAccountId: string; username: string; avatar: string | null }
  lastActivityAt: Date
  unreadCount: number
  canPost: boolean
  cannotPostReason: string | null
}

// Every conversation this player is part of, newest activity first.
//
// Participants are stored low/high by id rather than sender/recipient, so "the
// other person" is whichever column is not me. That is also why the lookup is
// an OR across two columns and why the schema carries an index for each.
export async function listDirectConversations(
  actor: MessagingActor,
  countUnread: (channelId: string, after: Date | null) => Promise<number>
): Promise<DirectConversationSummary[]> {
  const rows = await db.directMessage.findMany({
    where: {
      gameId: actor.gameId,
      OR: [
        { participantLowId: actor.playerAccountId },
        { participantHighId: actor.playerAccountId },
      ],
    },
    orderBy: { lastActivityAt: "desc" },
    take: DM_LIST_LIMIT,
    select: {
      id: true,
      chatChannelId: true,
      lastActivityAt: true,
      participantLow: { select: { id: true, username: true, avatar: true } },
      participantHigh: { select: { id: true, username: true, avatar: true } },
    },
  })
  if (rows.length === 0) return []

  const others = rows.map(row =>
    row.participantLow.id === actor.playerAccountId ? row.participantHigh : row.participantLow
  )

  // One query for every block touching this player, rather than one per
  // conversation. A block in either direction closes the composer, so both
  // columns are collected and the direction is discarded.
  const blocks = await db.blockedPlayer.findMany({
    where: {
      gameId: actor.gameId,
      OR: [
        { blockerPlayerId: actor.playerAccountId, blockedPlayerId: { in: others.map(o => o.id) } },
        { blockedPlayerId: actor.playerAccountId, blockerPlayerId: { in: others.map(o => o.id) } },
      ],
    },
    select: { blockerPlayerId: true, blockedPlayerId: true },
  })
  const blocked = new Set<string>()
  for (const block of blocks) {
    blocked.add(block.blockerPlayerId === actor.playerAccountId ? block.blockedPlayerId : block.blockerPlayerId)
  }

  const pointers = await db.messageReadStatus.findMany({
    where: {
      playerAccountId: actor.playerAccountId,
      chatChannelId: { in: rows.map(row => row.chatChannelId) },
    },
    // The read message's own timestamp, not lastReadAt — see loadMessagingOverview.
    select: { chatChannelId: true, lastReadMessage: { select: { createdAt: true } } },
  })
  const watermarks = new Map(
    pointers.map(pointer => [pointer.chatChannelId, pointer.lastReadMessage?.createdAt ?? null])
  )

  return Promise.all(
    rows.map(async (row, index): Promise<DirectConversationSummary> => {
      const other = others[index] as { id: string; username: string; avatar: string | null }
      const isBlocked = blocked.has(other.id)
      return {
        directMessageId: row.id,
        channelId: row.chatChannelId,
        participant: { playerAccountId: other.id, username: other.username, avatar: other.avatar },
        lastActivityAt: row.lastActivityAt,
        unreadCount: await countUnread(row.chatChannelId, watermarks.get(row.chatChannelId) ?? null),
        // The same wording evaluatePosting uses, and for the same reason: it
        // never says who blocked whom.
        canPost: !isBlocked,
        cannotPostReason: isBlocked ? "You can't reply to this conversation" : null,
      }
    })
  )
}

// Players this actor could start a conversation with, by username.
//
// Not a general directory: it exists so the widget has somewhere to begin a DM.
// People this player has blocked are filtered out, because that was their own
// decision and hiding them is tidiness rather than disclosure. People who have
// blocked *them* are deliberately left in — removing them would make the block
// visible by absence, and canOpenDirectMessage refuses with wording that cannot
// be told apart from "no such player".
export async function findDirectMessageCandidates(
  actor: MessagingActor,
  query: string,
  limit = 10
): Promise<{ playerAccountId: string; username: string; avatar: string | null }[]> {
  const term = query.trim()
  if (term.length === 0) return []

  const iBlocked = await db.blockedPlayer.findMany({
    where: { gameId: actor.gameId, blockerPlayerId: actor.playerAccountId },
    select: { blockedPlayerId: true },
  })

  const players = await db.playerAccount.findMany({
    where: {
      gameId: actor.gameId,
      username: { contains: term, mode: "insensitive" },
      id: { notIn: [actor.playerAccountId, ...iBlocked.map(block => block.blockedPlayerId)] },
    },
    orderBy: { username: "asc" },
    take: limit,
    select: { id: true, username: true, avatar: true },
  })

  return players.map(player => ({
    playerAccountId: player.id,
    username: player.username,
    avatar: player.avatar,
  }))
}
