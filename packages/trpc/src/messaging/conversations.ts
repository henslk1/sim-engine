import { db } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import { isUniqueViolation } from "./db-errors.js"
import { canonicalDirectMessagePair, canOpenDirectMessage } from "./permissions.js"
import { allow, type Decision } from "./result.js"

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
