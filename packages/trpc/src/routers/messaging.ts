import { z } from "zod"
import { router } from "../trpc.js"
import { channelAdminProcedure, denialToTRPCError, messagingProcedure } from "../messaging/procedures.js"
import { loadMessagingOverview } from "../messaging/channels.js"
import { deleteMessage, editMessage, loadHistory, markRead } from "../messaging/messages.js"
import {
  findDirectMessageCandidates,
  getOrCreateDirectMessage,
} from "../messaging/conversations.js"
import {
  createChannel,
  reorderChannels,
  setChannelArchived,
  updateChannel,
} from "../messaging/channel-admin.js"

// Everything about messaging except sending a message.
//
// Sending lives on the socket instead, because it is the one operation that has
// to reach other people the instant it commits — the socket is already open for
// delivery, so routing the write through it saves a round trip and keeps the
// broadcast next to the thing being broadcast. Everything here is either a read
// or a change that only the caller is waiting on, which is what a request is
// good at. It also means chat keeps working for reading, editing and moderating
// while the socket is reconnecting.
//
// Every procedure below derives the acting player from the session via
// messagingProcedure. None of them accept a player account id.

// The two-field cursor from loadHistory, coming back from the client. Dates
// cross the wire as ISO strings because this app has no superjson transformer,
// so z.coerce.date() is what turns one back into a Date.
const historyCursor = z.object({ createdAt: z.coerce.date(), id: z.string() })

// Channel names are normalized server-side, so this only has to bound the input
// rather than validate its shape — normalizeChannelName decides what survives,
// and resolveName rejects anything that normalizes to nothing.
const channelName = z.string().min(1).max(60)

// Who may see the channel at all. Absent or null means every player.
const minimumStaffRole = z.enum(["MODERATOR", "ADMIN", "OWNER"]).nullish()

export const messagingRouter = router({
  // The widget's one read for its sidebar: the game's channels, each with an
  // unread count and this player's own canPost.
  overview: messagingProcedure.query(({ ctx }) => loadMessagingOverview(ctx.actor)),

  // One page of a conversation, newest first. Omit `before` for the newest page,
  // then pass the previous response's nextCursor to walk upward.
  history: messagingProcedure
    .input(
      z.object({
        channelId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        before: historyCursor.nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await loadHistory(ctx.actor, {
        channelId: input.channelId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        before: input.before ?? null,
      })
      if (!result.ok) throw denialToTRPCError(result)
      return result.value
    }),

  edit: messagingProcedure
    .input(z.object({ messageId: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await editMessage(ctx.actor, ctx.realtime, input)
      if (!result.ok) throw denialToTRPCError(result)
      return result.value
    }),

  // Named `remove` rather than `delete`: deletion here is a tombstone, and
  // `delete` is a reserved word that would need quoting at every call site.
  remove: messagingProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await deleteMessage(ctx.actor, ctx.realtime, input)
      if (!result.ok) throw denialToTRPCError(result)
      return result.value
    }),

  // Opens a conversation with another player, or returns the one that already
  // exists. Safe to call repeatedly: the pair is stored in canonical order and
  // settled by a unique index, so two people pressing this at the same moment
  // still end up in one conversation.
  openDirectMessage: messagingProcedure
    .input(z.object({ targetPlayerAccountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await getOrCreateDirectMessage(ctx.actor, input)
      if (!result.ok) throw denialToTRPCError(result)
      return result.value
    }),

  // Somewhere to begin a conversation from. Deliberately narrow — it answers
  // "who can I message" and nothing else, and it is not a player directory.
  findPlayers: messagingProcedure
    .input(z.object({ query: z.string().max(40) }))
    .query(({ ctx, input }) => findDirectMessageCandidates(ctx.actor, input.query)),

  markRead: messagingProcedure
    .input(z.object({ channelId: z.string(), lastReadMessageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await markRead(ctx.actor, ctx.realtime, input)
      if (!result.ok) throw denialToTRPCError(result)
      return result.value
    }),

  // Channel structure. channelAdminProcedure requires admin or owner *in this
  // game*, so a moderator cannot restructure the server and neither can an admin
  // who is only staff somewhere else.
  admin: router({
    createChannel: channelAdminProcedure
      .input(
        z.object({
          name: channelName,
          description: z.string().max(500).nullish(),
          channelType: z.enum(["TEXT", "ANNOUNCEMENT"]),
          defaultCanPost: z.boolean(),
          minimumStaffRole,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createChannel(ctx.actor, ctx.realtime, {
          name: input.name,
          description: input.description ?? null,
          channelType: input.channelType,
          defaultCanPost: input.defaultCanPost,
          minimumStaffRole: input.minimumStaffRole ?? null,
        })
        if (!result.ok) throw denialToTRPCError(result)
        return result.value
      }),

    updateChannel: channelAdminProcedure
      .input(
        z.object({
          channelId: z.string(),
          // Absent means "leave this alone". For description, null means "clear
          // it" — which is why it is nullish here and not merely optional.
          name: channelName.optional(),
          description: z.string().max(500).nullish(),
          channelType: z.enum(["TEXT", "ANNOUNCEMENT"]).optional(),
          defaultCanPost: z.boolean().optional(),
          minimumStaffRole,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await updateChannel(ctx.actor, ctx.realtime, input)
        if (!result.ok) throw denialToTRPCError(result)
        return result.value
      }),

    setArchived: channelAdminProcedure
      .input(z.object({ channelId: z.string(), isArchived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const result = await setChannelArchived(ctx.actor, ctx.realtime, input)
        if (!result.ok) throw denialToTRPCError(result)
        return result.value
      }),

    // The complete channel list in its new order. Partial lists are refused —
    // see reorderChannels for why.
    reorder: channelAdminProcedure
      .input(z.object({ channelIds: z.array(z.string()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        const result = await reorderChannels(ctx.actor, ctx.realtime, input)
        if (!result.ok) throw denialToTRPCError(result)
        return result.value
      }),
  }),
})
