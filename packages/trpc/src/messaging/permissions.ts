import { db, type ChannelType, type ChatServerType } from "@sim-engine/db"
import type { MessagingActor } from "./actor.js"
import { outranksOrEquals } from "./staff.js"
import { ALLOWED, allow, deny, type Check, type Decision } from "./result.js"

// Everything a permission decision needs to know about a channel, gathered in
// one read so the answers below never have to go back to the database.
export type ChannelAccess = {
  channel: {
    id: string
    gameId: string
    channelType: ChannelType
    name: string | null
    defaultCanPost: boolean
    isArchived: boolean
  }
  server: { id: string; serverType: ChatServerType; isArchived: boolean } | null
  directMessage: { id: string; participantLowId: string; participantHighId: string } | null
  // Only meaningful for a DM. Read during the load because the composer needs
  // it the moment a conversation opens, not first at send time.
  blockedEitherWay: boolean
}

// Can this actor see this channel at all, and what is it?
//
// Archived channels still load: archiving stops new messages, it does not hide
// history. Whether anything can be written is a separate question, answered by
// evaluatePosting below.
export async function loadViewableChannel(
  actor: MessagingActor,
  channelId: string
): Promise<Decision<ChannelAccess>> {
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      gameId: true,
      channelType: true,
      name: true,
      defaultCanPost: true,
      isArchived: true,
      server: { select: { id: true, serverType: true, isArchived: true } },
      directMessage: { select: { id: true, participantLowId: true, participantHighId: true } },
    },
  })

  // One wording for every "you cannot see this" case, including a channel that
  // exists but belongs to another game. Distinguishing them would let someone
  // walk a list of ids and learn which conversations exist.
  const hidden = (detail: string) => deny("CHANNEL_NOT_FOUND", "That conversation is not available.", detail)

  if (!channel || channel.gameId !== actor.gameId) return hidden("missing, or belongs to another game")

  const base = {
    id: channel.id,
    gameId: channel.gameId,
    channelType: channel.channelType,
    name: channel.name,
    defaultCanPost: channel.defaultCanPost,
    isArchived: channel.isArchived,
  }

  if (channel.directMessage) {
    const { participantLowId, participantHighId } = channel.directMessage
    const isParticipant =
      actor.playerAccountId === participantLowId || actor.playerAccountId === participantHighId
    if (!isParticipant) return hidden("not a participant")

    return allow({
      channel: base,
      server: null,
      directMessage: channel.directMessage,
      blockedEitherWay: await isBlockedEitherWay(actor.gameId, participantLowId, participantHighId),
    })
  }

  // A channel that is neither a DM nor attached to a server is malformed. Treat
  // it as invisible rather than guessing what was meant by it.
  if (!channel.server) return hidden("no server and no direct message")

  if (channel.server.serverType === "GROUP") {
    return deny("GROUP_CHAT_UNAVAILABLE", "Group chat is not available yet.")
  }

  // The global server: anyone holding a player account in this game may read it.
  return allow({ channel: base, server: channel.server, directMessage: null, blockedEitherWay: false })
}

// May this actor post here, right now?
//
// Synchronous on purpose. The load above already collected everything, so the
// client's composer state and the server's send check are the same function
// called at two moments: once when the conversation opens, again when a message
// actually arrives. A client that edits away the disabled attribute only skips
// the first call — the second one is the one that decides.
//
// The messages are the composer's copy. They are why this returns a reason
// rather than a boolean.
export function evaluatePosting(actor: MessagingActor, access: ChannelAccess): Check {
  if (access.channel.isArchived || access.server?.isArchived) {
    return deny("CHANNEL_ARCHIVED", "This channel is archived")
  }

  if (access.directMessage) {
    // Never names who blocked whom: that discloses something the blocker did
    // not choose to share.
    return access.blockedEitherWay
      ? deny("BLOCKED", "You can't reply to this conversation")
      : ALLOWED
  }

  // Posting hangs on defaultCanPost alone, not on channelType. An announcement
  // channel is simply one with defaultCanPost off — one rule that can be read
  // off a single column, rather than two that can end up disagreeing.
  if (access.channel.defaultCanPost) return ALLOWED

  return outranksOrEquals(actor.staffRole, "MODERATOR")
    ? ALLOWED
    : deny("STAFF_ONLY", "Only staff can post here")
}

// Creating, renaming, reordering, archiving and configuring channels.
// Moderators are deliberately excluded: they moderate content, not structure.
export function canManageChannels(actor: MessagingActor): Check {
  return outranksOrEquals(actor.staffRole, "ADMIN")
    ? ALLOWED
    : deny("NOT_STAFF", "You do not have permission to manage channels.")
}

// Deleting other people's messages, pinning, and working through reports.
export function canModerateMessages(actor: MessagingActor): Check {
  return outranksOrEquals(actor.staffRole, "MODERATOR")
    ? ALLOWED
    : deny("NOT_STAFF", "You do not have permission to moderate messages.")
}

// The DM policy, deliberately in one named place.
//
// Pre-alpha is permissive: any player in the game may open a conversation with
// any other unless one of them has blocked the other. The tester group is small
// and trusted, and stud bookings and marketplace offers need players who are
// not yet friends to be able to negotiate. Tightening this later — to friends
// only, or to message requests — is an edit to this function rather than a
// change spread across four transports.
//
// Every refusal returns identical wording. Saying which rule stopped the caller
// would turn this into a way to test whether an account exists, or to discover
// that someone has blocked them.
export async function canOpenDirectMessage(
  actor: MessagingActor,
  targetPlayerAccountId: string
): Promise<Check> {
  const unavailable = (detail: string) =>
    deny("DM_UNAVAILABLE", "You can't start a conversation with that player.", detail)

  if (targetPlayerAccountId === actor.playerAccountId) return unavailable("self")

  const target = await db.playerAccount.findFirst({
    where: { id: targetPlayerAccountId, gameId: actor.gameId },
    select: { id: true },
  })
  if (!target) return unavailable("no such player in this game")

  if (await isBlockedEitherWay(actor.gameId, actor.playerAccountId, target.id)) {
    return unavailable("blocked in one direction or the other")
  }

  return ALLOWED
}

// A block stops messages in both directions. The blocked player is not told,
// and the conversation stays in both lists with its history intact.
export async function isBlockedEitherWay(gameId: string, playerA: string, playerB: string): Promise<boolean> {
  const count = await db.blockedPlayer.count({
    where: {
      gameId,
      OR: [
        { blockerPlayerId: playerA, blockedPlayerId: playerB },
        { blockerPlayerId: playerB, blockedPlayerId: playerA },
      ],
    },
  })
  return count > 0
}

// Participants are stored in id order, so a pair always resolves to the one
// conversation no matter which of the two opens it first.
export function canonicalDirectMessagePair(playerA: string, playerB: string) {
  return playerA < playerB
    ? { participantLowId: playerA, participantHighId: playerB }
    : { participantLowId: playerB, participantHighId: playerA }
}
