import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"

export const notificationRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return []
      return db.notification.findMany({
        where: { recipientPlayerId: player.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          content: true,
          link: true,
          isRead: true,
          createdAt: true,
          topicDef: { select: { topicKey: true, name: true } }
        },
      })
    }),

  unreadCount: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return 0
      return db.notification.count({
        where: { recipientPlayerId: player.id, isRead: false },
      })
    }),

    markRead: protectedProcedure
      .input(z.object({ gameId: z.string(), notificationId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const player = await db.playerAccount.findUnique({
            where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
            select: { id: true },
          })
          if (!player) return
          await db.notification.updateMany({
            where: { id: input.notificationId, recipientPlayerId: player.id },
            data: { isRead: true },
          })
       }),

     markAllRead: protectedProcedure
      .input(z.object({ gameId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const player = await db.playerAccount.findUnique({
          where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
          select: { id: true },
        })
        if (!player) return
        await db.notification.updateMany({
          where: { recipientPlayerId: player.id, isRead: false },
          data: { isRead: true },
        })
      }),
})