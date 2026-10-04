import type { RouterOutputs } from "@/lib/trpc"
import type { ConversationTarget } from "./conversation"

type Overview = RouterOutputs["messaging"]["overview"]
export type ChannelSummary = Overview["channels"][number]
export type DirectSummary = Overview["directMessages"][number]

// Turning a sidebar row into something the conversation pane can draw.
//
// These live outside chat-section because the dock needs them too: a popped-out
// conversation is drawn from the same overview, so its title, avatar and
// posting rules stay current without the bubble holding a stale copy.

export function channelTarget(channel: ChannelSummary): ConversationTarget {
  return {
    channelId: channel.channelId,
    title: channel.name,
    isDirect: false,
    isAnnouncement: channel.channelType === "ANNOUNCEMENT",
    description: channel.description,
    isArchived: channel.isArchived,
    canPost: channel.canPost,
    cannotPostReason: channel.cannotPostReason,
    profileUsername: null,
  }
}

export function directTarget(conversation: DirectSummary): ConversationTarget {
  return {
    channelId: conversation.channelId,
    title: conversation.participant.username,
    isDirect: true,
    isAnnouncement: false,
    // A conversation is named by who is in it, so there is nothing to subtitle.
    description: null,
    isArchived: false,
    canPost: conversation.canPost,
    cannotPostReason: conversation.cannotPostReason,
    profileUsername: conversation.participant.username,
  }
}

// What a bubble needs on top of the target: a face and a count.
export type DockedConversation = {
  target: ConversationTarget
  avatar: string | null
  unreadCount: number
}

// Resolved on every render rather than captured when the bubble was opened, so
// a renamed channel, a newly archived one, or a conversation that has since
// become unreachable is reflected immediately. Null means it is gone — the dock
// drops the bubble rather than leaving one that opens nothing.
export function findConversation(
  overview: Overview | undefined,
  channelId: string
): DockedConversation | null {
  if (!overview) return null

  const direct = overview.directMessages.find(dm => dm.channelId === channelId)
  if (direct) {
    return {
      target: directTarget(direct),
      avatar: direct.participant.avatar,
      unreadCount: direct.unreadCount,
    }
  }

  const channel = overview.channels.find(row => row.channelId === channelId)
  if (channel) {
    return { target: channelTarget(channel), avatar: null, unreadCount: channel.unreadCount }
  }

  return null
}
