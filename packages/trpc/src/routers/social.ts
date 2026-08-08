import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"
import { router, protectedProcedure } from "../trpc.js"
import { z } from "zod"

export const socialRouter = router({
  getRelationship: protectedProcedure
    .input(z.object({
      viewerPlayerAccountId: z.string(),
      profilePlayerAccountId: z.string(),
      gameId: z.string(),
    }))
    .query(async ({ input }) => {
      const { viewerPlayerAccountId: me, profilePlayerAccountId: them, gameId } = input
      const [following, friendRequest, friendship] = await Promise.all([
        db.follow.findFirst({ where: { gameId, followerPlayerId: me, followedPlayerId: them } }),
        db.friendRequest.findFirst({
          where: {
            gameId,
            OR: [
              { senderPlayerId: me, recipientPlayerId: them },
              { senderPlayerId: them, recipientPlayerId: me },
            ],
          },
          select: { id: true, senderPlayerId: true },
        }),
        db.friendship.findFirst({
          where: {
            gameId,
            OR: [
              { playerOneId: me, playerTwoId: them },
              { playerOneId: them, playerTwoId: me },
            ],
          },
          select: { id: true },
        }),
      ])
      let friendStatus: "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "FRIENDS" = "NONE"
      if (friendship) friendStatus = "FRIENDS"
      else if (friendRequest) friendStatus = friendRequest.senderPlayerId === me ? "PENDING_SENT" : "PENDING_RECEIVED"
      return { isFollowing: !!following, friendStatus, friendRequestId: friendRequest?.id ?? null }
    }),

  follow: protectedProcedure
    .input(z.object({ followerPlayerAccountId: z.string(), followedPlayerAccountId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.followerPlayerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.follow.create({
        data: { gameId: input.gameId, followerPlayerId: input.followerPlayerAccountId, followedPlayerId: input.followedPlayerAccountId },
      })
    }),

  unfollow: protectedProcedure
    .input(z.object({ followerPlayerAccountId: z.string(), followedPlayerAccountId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.followerPlayerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      await db.follow.deleteMany({
        where: { gameId: input.gameId, followerPlayerId: input.followerPlayerAccountId, followedPlayerId: input.followedPlayerAccountId },
      })
    }),

  sendFriendRequest: protectedProcedure
    .input(z.object({ senderPlayerId: z.string(), recipientPlayerId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.senderPlayerId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      const existing = await db.friendship.findFirst({
        where: {
          gameId: input.gameId,
          OR: [
            { playerOneId: input.senderPlayerId, playerTwoId: input.recipientPlayerId },
            { playerOneId: input.recipientPlayerId, playerTwoId: input.senderPlayerId },
          ],
        },
      })
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Already friends" })
      return db.friendRequest.create({
        data: { gameId: input.gameId, senderPlayerId: input.senderPlayerId, recipientPlayerId: input.recipientPlayerId },
      })
    }),

  cancelFriendRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.friendRequest.findUnique({
        where: { id: input.requestId },
        select: { senderPlayer: { select: { userId: true } } },
      })
      if (!request || request.senderPlayer.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.friendRequest.delete({ where: { id: input.requestId } })
    }),

  acceptFriendRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.friendRequest.findUnique({
        where: { id: input.requestId },
        select: {
          senderPlayerId: true, recipientPlayerId: true, gameId: true,
          recipientPlayer: { select: { userId: true } },
        },
      })
      if (!request || request.recipientPlayer.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.$transaction(async (tx) => {
        await tx.friendRequest.delete({ where: { id: input.requestId } })
        return tx.friendship.create({
          data: { gameId: request.gameId, playerOneId: request.senderPlayerId, playerTwoId: request.recipientPlayerId },
        })
      })
    }),

  declineFriendRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.friendRequest.findUnique({
        where: { id: input.requestId },
        select: { recipientPlayer: { select: { userId: true } } },
      })
      if (!request || request.recipientPlayer.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.friendRequest.delete({ where: { id: input.requestId } })
    }),

  getFriendRequests: protectedProcedure
    .input(z.object({ playerAccountId: z.string(), gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      const [incoming, outgoing] = await Promise.all([
        db.friendRequest.findMany({
          where: { gameId: input.gameId, recipientPlayerId: input.playerAccountId },
          select: { id: true, createdAt: true, senderPlayer: { select: { id: true, username: true, avatar: true } } },
          orderBy: { createdAt: "desc" },
        }),
        db.friendRequest.findMany({
          where: { gameId: input.gameId, senderPlayerId: input.playerAccountId },
          select: { id: true, createdAt: true, recipientPlayer: { select: { id: true, username: true, avatar: true } } },
          orderBy: { createdAt: "desc" },
        }),
      ])
      return { incoming, outgoing, pendingCount: incoming.length }
    }),

  blockPlayer: protectedProcedure
    .input(z.object({ blockerPlayerId: z.string(), blockedPlayerId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.blockerPlayerId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.blockedPlayer.create({
        data: { gameId: input.gameId, blockerPlayerId: input.blockerPlayerId, blockedPlayerId: input.blockedPlayerId },
      })
    }),

  unblockPlayer: protectedProcedure
    .input(z.object({ blockerPlayerId: z.string(), blockedPlayerId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.blockerPlayerId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      await db.blockedPlayer.deleteMany({
        where: { gameId: input.gameId, blockerPlayerId: input.blockerPlayerId, blockedPlayerId: input.blockedPlayerId },
      })
    }),
})
