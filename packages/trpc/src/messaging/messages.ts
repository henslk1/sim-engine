import { db } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import { prepareContent } from "./content.js"
import { isUniqueViolation } from "./db-errors.js"
import { canModerateMessages, evaluatePosting, loadViewableChannel } from "./permissions.js"
import type { RealtimeControl } from "./realtime.js"
import { allow, deny, type Decision } from "./result.js"

// The client generates this, so it is bounded here rather than trusted. It goes
// straight into a unique index.
const MAX_CLIENT_ID_LENGTH = 100

const MESSAGE_SELECT = {
  id: true,
  gameId: true,
  channelId: true,
  authorPlayerId: true,
  clientMessageId: true,
  content: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  deletedByPlayerId: true,
  authorPlayer: { select: { username: true } },
} as const

type MessageRow = {
  id: string
  gameId: string
  channelId: string
  authorPlayerId: string
  clientMessageId: string
  content: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedByPlayerId: string | null
  authorPlayer: { username: string }
}

// Who took the message down. The client renders the removal notice from this,
// so the wording lives in one place in the interface rather than being baked
// into stored or transported data.
export type MessageRemoval = "author" | "staff"

export type SavedMessage = {
  id: string
  gameId: string
  channelId: string
  authorPlayerId: string
  authorUsername: string
  clientMessageId: string
  content: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  removedBy: MessageRemoval | null
}

function toSavedMessage(row: MessageRow): SavedMessage {
  // A null remover means an account-level removal rather than one player acting
  // in a channel, which is still staff rather than the author.
  const removedBy: MessageRemoval | null =
    row.deletedAt === null ? null : row.deletedByPlayerId === row.authorPlayerId ? "author" : "staff"

  return {
    id: row.id,
    gameId: row.gameId,
    channelId: row.channelId,
    // The author stays. The message keeps its place and its name in the
    // conversation, and only the body is replaced.
    authorPlayerId: row.authorPlayerId,
    authorUsername: row.authorPlayer.username,
    clientMessageId: row.clientMessageId,
    // Redacted on the way out, not in the row. The original text stays in the
    // database for reports and moderation history — it simply never reaches a
    // client again.
    content: removedBy === null ? row.content : "",
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    removedBy,
  }
}

async function findByClientId(authorPlayerId: string, clientMessageId: string): Promise<SavedMessage | null> {
  const row = await db.chatMessage.findUnique({
    where: { authorPlayerId_clientMessageId: { authorPlayerId, clientMessageId } },
    select: MESSAGE_SELECT,
  })
  return row ? toSavedMessage(row) : null
}

async function loadMessage(messageId: string): Promise<MessageRow | null> {
  return db.chatMessage.findUnique({ where: { id: messageId }, select: MESSAGE_SELECT })
}

export async function createMessage(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { channelId: string; clientMessageId: string; content: string }
): Promise<Decision<SavedMessage>> {
  const clientMessageId = input.clientMessageId.trim()
  if (clientMessageId.length === 0 || clientMessageId.length > MAX_CLIENT_ID_LENGTH) {
    return deny("BAD_CLIENT_ID", "That message could not be sent.", "missing or oversized clientMessageId")
  }

  // A send whose acknowledgement was lost gets retried, and must return the
  // original rather than post a second copy. Checked ahead of the permission
  // work on purpose: a message that is already saved stays retrievable even if
  // the channel has since been archived or turned read-only.
  const alreadySaved = await findByClientId(actor.playerAccountId, clientMessageId)
  if (alreadySaved) return allow(alreadySaved)

  // A fresh check, not the one the client did when it opened the conversation.
  // Permissions, blocks and archival can all have changed since then.
  const access = await loadViewableChannel(actor, input.channelId)
  if (!access.ok) return access

  const posting = evaluatePosting(actor, access.value)
  if (!posting.ok) return posting

  const content = prepareContent(input.content)
  if (!content.ok) return content

  const directMessage = access.value.directMessage

  try {
    const row = await db.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          gameId: actor.gameId,
          channelId: access.value.channel.id,
          authorPlayerId: actor.playerAccountId,
          clientMessageId,
          content: content.value,
        },
        select: MESSAGE_SELECT,
      })

      // Keeps the conversation list ordered by recency. In the same
      // transaction, so the list can never show a stale position for a message
      // that exists.
      if (directMessage) {
        await tx.directMessage.update({
          where: { id: directMessage.id },
          data: { lastActivityAt: message.createdAt },
        })
      }

      return message
    })

    const saved = toSavedMessage(row)
    // After commit, never inside the transaction: a rolled back insert must not
    // have been announced to a room.
    realtime.emitToChannel(saved.channelId, "message:created", saved)
    return allow(saved)
  } catch (error) {
    // Two tabs retrying the same send simultaneously both get past the lookup
    // above and race to insert. The unique index settles it and the loser reads
    // the winner's row, so the retry still receives its own message back.
    if (isUniqueViolation(error)) {
      const raced = await findByClientId(actor.playerAccountId, clientMessageId)
      if (raced) return allow(raced)
    }
    throw error
  }
}

export async function editMessage(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { messageId: string; content: string }
): Promise<Decision<SavedMessage>> {
  const message = await loadMessage(input.messageId)
  const missing = deny("MESSAGE_NOT_FOUND", "That message is no longer available.")
  if (!message || message.gameId !== actor.gameId) return missing
  if (message.deletedAt) return { ...missing, detail: "already deleted" }

  // Only the author edits. Staff delete rather than rewrite, so moderation
  // never puts words in someone's mouth.
  if (message.authorPlayerId !== actor.playerAccountId) {
    return deny("NOT_AUTHOR", "You can only edit your own messages.")
  }

  const access = await loadViewableChannel(actor, message.channelId)
  if (!access.ok) return access

  // Editing needs the same permission as posting: a channel that has gone
  // read-only or archived should not accept new text through the back door.
  const posting = evaluatePosting(actor, access.value)
  if (!posting.ok) return posting

  const content = prepareContent(input.content)
  if (!content.ok) return content

  const row = await db.chatMessage.update({
    where: { id: message.id },
    data: { content: content.value, editedAt: new Date() },
    select: MESSAGE_SELECT,
  })

  const saved = toSavedMessage(row)
  realtime.emitToChannel(saved.channelId, "message:updated", saved)
  return allow(saved)
}

export async function deleteMessage(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { messageId: string }
): Promise<Decision<SavedMessage>> {
  const message = await loadMessage(input.messageId)
  if (!message || message.gameId !== actor.gameId) {
    return deny("MESSAGE_NOT_FOUND", "That message is no longer available.")
  }

  // Deleting twice is not an error. A client retrying after a lost response
  // should land on the same state rather than a failure.
  if (message.deletedAt) return allow(toSavedMessage(message))

  if (message.authorPlayerId !== actor.playerAccountId) {
    const moderation = canModerateMessages(actor)
    if (!moderation.ok) return moderation
  }

  // The channel still has to be visible to the remover. For staff this means
  // DMs are out of reach, because loadViewableChannel only admits participants.
  const access = await loadViewableChannel(actor, message.channelId)
  if (!access.ok) return access

  // Note there is no posting check here. Moderation has to keep working in a
  // channel that has been archived precisely because it went wrong.
  const byStaff = message.authorPlayerId !== actor.playerAccountId
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.chatMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), deletedByPlayerId: actor.playerAccountId },
      select: MESSAGE_SELECT,
    })
    // Taking down someone else's words is an administrative act and is logged
    // as one. The original text is still on the row, so the log records who and
    // when rather than duplicating what.
    if (byStaff) {
      await tx.adminActionLog.create({
        data: {
          staffUserId: actor.userId,
          gameId: actor.gameId,
          action: "chat_message_removed",
          targetType: "ChatMessage",
          targetId: message.id,
        },
      })
    }
    return updated
  })

  const saved = toSavedMessage(row)
  realtime.emitToChannel(saved.channelId, "message:deleted", saved)
  return allow(saved)
}

// Takes down everything a user has written, across every character they have.
//
// Called when a ban is issued with removal requested. A ban is account-level
// rather than per-game, so this is too — scoping it to one game would leave the
// same person's posts standing elsewhere under a ban that already covers them.
//
// Nothing here is scoped to an actor: authority was established by the
// procedure that issued the ban, and the removal is attributed to the ban in
// the admin log rather than to a player acting in a channel.
export async function removeAllMessagesByUser(
  userId: string,
  realtime: RealtimeControl
): Promise<number> {
  const accounts = await db.playerAccount.findMany({ where: { userId }, select: { id: true } })
  if (accounts.length === 0) return 0

  // Read before writing so the rooms can be told exactly what changed.
  const targets = await db.chatMessage.findMany({
    where: { authorPlayerId: { in: accounts.map(a => a.id) }, deletedAt: null },
    select: MESSAGE_SELECT,
  })
  if (targets.length === 0) return 0

  const deletedAt = new Date()
  await db.chatMessage.updateMany({
    where: { id: { in: targets.map(t => t.id) } },
    // deletedByPlayerId stays null: no player did this in a channel. A null
    // remover reads as staff, which is what it was.
    data: { deletedAt },
  })

  // One event per message. Fine at tester volumes; a spam flood would want a
  // single bulk event instead of a fan-out this size.
  for (const row of targets) {
    const saved = toSavedMessage({ ...row, deletedAt })
    realtime.emitToChannel(saved.channelId, "message:deleted", saved)
  }

  return targets.length
}

export type ReadPointer = {
  channelId: string
  lastReadMessageId: string
  lastReadAt: Date
}

export async function markRead(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { channelId: string; lastReadMessageId: string }
): Promise<Decision<ReadPointer>> {
  const access = await loadViewableChannel(actor, input.channelId)
  if (!access.ok) return access

  // The pointer has to name a message in this channel. Otherwise a client could
  // park it on an id from somewhere else and quietly corrupt its own unread
  // count.
  const target = await db.chatMessage.findUnique({
    where: { id: input.lastReadMessageId },
    select: { id: true, channelId: true },
  })
  if (!target || target.channelId !== access.value.channel.id) {
    return deny("MESSAGE_NOT_FOUND", "That message is not in this conversation.")
  }

  const lastReadAt = new Date()
  const chatChannelId = access.value.channel.id
  await db.messageReadStatus.upsert({
    where: { playerAccountId_chatChannelId: { playerAccountId: actor.playerAccountId, chatChannelId } },
    create: {
      playerAccountId: actor.playerAccountId,
      chatChannelId,
      lastReadMessageId: target.id,
      lastReadAt,
    },
    update: { lastReadMessageId: target.id, lastReadAt },
  })

  const pointer: ReadPointer = { channelId: chatChannelId, lastReadMessageId: target.id, lastReadAt }
  // To the player's own room rather than the channel: this is one person's
  // badge state, and their other tabs are the only thing that needs it.
  realtime.emitToPlayer(actor.gameId, actor.playerAccountId, "read:updated", pointer)
  return allow(pointer)
}
