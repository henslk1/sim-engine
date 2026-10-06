import { db } from "@sim-engine/db"
import { randomUUID } from "node:crypto"
import type { MessagingActor } from "./actor.js"
import { prepareContent } from "./content.js"
import { isTransactionConflict, isUniqueViolation } from "./db-errors.js"
import { canModerateMessages, evaluatePosting, loadViewableChannel } from "./permissions.js"
import type { ChannelAccess } from "./permissions.js"
import { messageRateLimit, retryWording } from "./rate-limit.js"
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
  authorName: true,
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
  authorPlayerId: string | null
  authorName: string | null
  clientMessageId: string
  content: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedByPlayerId: string | null
  authorPlayer: { username: string } | null
}

// Who took the message down. The client renders the removal notice from this,
// so the wording lives in one place in the interface rather than being baked
// into stored or transported data.
export type MessageRemoval = "author" | "staff"

export type SavedMessage = {
  id: string
  gameId: string
  channelId: string
  authorPlayerId: string | null
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
    row.deletedAt === null
      ? null
      : row.authorPlayerId !== null && row.deletedByPlayerId === row.authorPlayerId
        ? "author"
        : "staff"

  return {
    id: row.id,
    gameId: row.gameId,
    channelId: row.channelId,
    // The author stays. The message keeps its place and its name in the
    // conversation, and only the body is replaced.
    authorPlayerId: row.authorPlayerId,
    authorUsername: row.authorPlayer?.username ?? row.authorName ?? "Game",
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

// Posts one staff-authored broadcast as the game itself. The game identity is
// not a PlayerAccount and cannot sign in; authorName is a display snapshot, so
// later renaming the game does not rewrite old announcements.
export async function createGameAnnouncement(
  actor: MessagingActor,
  realtime: RealtimeControl,
  input: { content: string }
): Promise<Decision<SavedMessage>> {
  const destination = await db.chatServer.findUnique({
    where: { gameId_scopeKey: { gameId: actor.gameId, scopeKey: "GLOBAL" } },
    select: {
      announcementChannelId: true,
      game: { select: { name: true } },
    },
  })
  if (!destination?.announcementChannelId) {
    return deny("ANNOUNCEMENT_CHANNEL_MISSING", "This game has no announcement channel configured.")
  }

  const access = await loadViewableChannel(actor, destination.announcementChannelId)
  if (!access.ok) return access
  const posting = evaluatePosting(actor, access.value)
  if (!posting.ok) return posting
  const content = prepareContent(input.content)
  if (!content.ok) return content

  const row = await db.$transaction(async tx => {
    const message = await tx.chatMessage.create({
      data: {
        gameId: actor.gameId,
        channelId: access.value.channel.id,
        authorPlayerId: null,
        authorName: destination.game.name,
        clientMessageId: randomUUID(),
        content: content.value,
      },
      select: MESSAGE_SELECT,
    })
    await tx.adminActionLog.create({
      data: {
        staffUserId: actor.userId,
        gameId: actor.gameId,
        action: "chat_announcement_posted",
        targetType: "ChatMessage",
        targetId: message.id,
      },
    })
    return message
  })

  const saved = toSavedMessage(row)
  realtime.emitToChannel(saved.channelId, "message:created", saved)
  announceActivity(realtime, access.value, "created")
  return allow(saved)
}

function announceActivity(
  realtime: RealtimeControl,
  access: ChannelAccess,
  kind: "created" | "deleted"
) {
  const audience = access.directMessage
    ? {
        gameId: access.channel.gameId,
        channelId: access.channel.id,
        playerAccountIds: [
          access.directMessage.participantLowId,
          access.directMessage.participantHighId,
        ],
      }
    : {
        gameId: access.channel.gameId,
        channelId: access.channel.id,
        minimumStaffRole: access.channel.minimumStaffRole,
      }
  realtime.emitMessagingActivity(audience, { channelId: access.channel.id, kind })
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

  // Charged here: after idempotency, so a retry of a message that is already
  // saved is never counted as a new one, and before the permission load, so a
  // flood aimed at a channel the sender cannot even see still costs them their
  // allowance instead of a database round trip each time.
  const budget = await messageRateLimit.check(actor.playerAccountId)
  if (!budget.ok) {
    if (budget.unavailable) {
      return deny("RATE_LIMIT_UNAVAILABLE", "Messaging is temporarily unavailable. Try again shortly.")
    }
    return deny("RATE_LIMITED", `You're sending messages too quickly. ${retryWording(budget.retryAfterMs)}`)
  }

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
    announceActivity(realtime, access.value, "created")
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
  announceActivity(realtime, access.value, "deleted")
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
    select: { id: true, channelId: true, createdAt: true },
  })
  if (!target || target.channelId !== access.value.channel.id) {
    return deny("MESSAGE_NOT_FOUND", "That message is not in this conversation.")
  }

  const chatChannelId = access.value.channel.id
  const lastReadAt = new Date()

  // Serializable makes this comparison and write one monotonic operation even
  // when two tabs mark different messages at the same time. One transaction
  // will retry rather than allowing the older pointer to win last.
  const savePointer = () => db.$transaction(async tx => {
    const current = await tx.messageReadStatus.findUnique({
      where: {
        playerAccountId_chatChannelId: {
          playerAccountId: actor.playerAccountId,
          chatChannelId,
        },
      },
      select: {
        lastReadAt: true,
        lastReadMessage: { select: { id: true, createdAt: true } },
      },
    })
    const currentMessage = current?.lastReadMessage
    const currentIsNewer =
      currentMessage !== null &&
      currentMessage !== undefined &&
      (currentMessage.createdAt > target.createdAt ||
        (currentMessage.createdAt.getTime() === target.createdAt.getTime() &&
          currentMessage.id >= target.id))

    if (currentIsNewer) {
      return {
        lastReadMessageId: currentMessage.id,
        lastReadAt: current?.lastReadAt ?? lastReadAt,
      }
    }

    return tx.messageReadStatus.upsert({
      where: {
        playerAccountId_chatChannelId: {
          playerAccountId: actor.playerAccountId,
          chatChannelId,
        },
      },
      create: {
        playerAccountId: actor.playerAccountId,
        chatChannelId,
        lastReadMessageId: target.id,
        lastReadAt,
      },
      update: { lastReadMessageId: target.id, lastReadAt },
      select: { lastReadMessageId: true, lastReadAt: true },
    })
  }, { isolationLevel: "Serializable" })

  let saved: Awaited<ReturnType<typeof savePointer>> | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      saved = await savePointer()
      break
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === 2) throw error
    }
  }
  if (!saved) throw new Error("Unable to advance message read pointer")

  const pointer: ReadPointer = {
    channelId: chatChannelId,
    lastReadMessageId: saved.lastReadMessageId ?? target.id,
    lastReadAt: saved.lastReadAt ?? lastReadAt,
  }
  // To the player's own room rather than the channel: this is one person's
  // badge state, and their other tabs are the only thing that needs it.
  realtime.emitToPlayer(actor.gameId, actor.playerAccountId, "read:updated", pointer)
  return allow(pointer)
}

// How many messages a page holds by default, and the ceiling a caller may ask
// for. The ceiling matters because the page size arrives from the client.
export const HISTORY_PAGE_SIZE = 50
const MAX_HISTORY_PAGE_SIZE = 100

// Where the next page starts. Two fields rather than one because createdAt is
// not unique — two messages can share a millisecond, and a cursor that only
// knew the timestamp would either skip one of them or repeat it forever.
export type HistoryCursor = { createdAt: Date; id: string }

export type MessagePage = {
  // Oldest first, the order they are drawn in.
  messages: SavedMessage[]
  // Pass back as `before` to fetch the page above this one. Null at the top of
  // the conversation.
  nextCursor: HistoryCursor | null
}

// One page of a conversation, walking backwards from the newest message.
//
// Chat is read from the bottom, so "the first page" is the end of the history
// and paging means going further back. The query therefore sorts descending and
// the result is reversed before returning: the database works in the direction
// the index is useful, the caller gets the direction the screen needs.
export async function loadHistory(
  actor: MessagingActor,
  input: { channelId: string; limit?: number; before?: HistoryCursor | null }
): Promise<Decision<MessagePage>> {
  const access = await loadViewableChannel(actor, input.channelId)
  if (!access.ok) return access

  const take = Math.min(Math.max(input.limit ?? HISTORY_PAGE_SIZE, 1), MAX_HISTORY_PAGE_SIZE)
  const before = input.before ?? null

  const rows = await db.chatMessage.findMany({
    where: {
      channelId: access.value.channel.id,
      // "Strictly before this point in the ordering": either an older
      // timestamp, or the same timestamp and a lower id. This is the two-field
      // cursor doing its job — it is exactly the (createdAt, id) index order
      // the orderBy below asks for.
      ...(before === null
        ? {}
        : {
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row, never returned. Its existence is the answer to "is there
    // more above this?", which a count query would otherwise have to ask
    // separately.
    take: take + 1,
    select: MESSAGE_SELECT,
  })

  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  // Deleted messages stay in the page. The tombstone keeps the conversation's
  // shape, and toSavedMessage is what empties the body.
  const messages = page.map(row => toSavedMessage(row)).reverse()
  const oldest = page.at(-1)

  return allow({
    messages,
    nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  })
}
