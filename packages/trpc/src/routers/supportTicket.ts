import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"

export const supportTicketRouter = router({
  create: protectedProcedure
    .input(z.object({
      gameId: z.string(),
      subject: z.string().min(5).max(200),
      body: z.string().min(10).max(10000),
      category: z.enum(["GENERAL", "EXPLOIT", "BILLING", "ACCOUNT", "APPEAL", "DISPUTE"]),
      jobContractId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      return db.supportTicket.create({
        data: {
          gameId: input.gameId,
          playerAccountId: player.id,
          subject: input.subject,
          body: input.body,
          category: input.category,
          jobContractId: input.jobContractId ?? null,
          status: "OPEN",
        },
        select: { id: true },
      })
    }),

  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      return db.supportTicket.findMany({
        where: { playerAccountId: player.id, gameId: input.gameId },
        select: {
          id: true,
          subject: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
      })
    }),

  get: protectedProcedure
    .input(z.object({ gameId: z.string(), ticketId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      return db.supportTicket.findUniqueOrThrow({
        where: { id: input.ticketId, playerAccountId: player.id },
        select: {
          id: true,
          subject: true,
          body: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    }),

  reply: protectedProcedure
    .input(z.object({ gameId: z.string(), ticketId: z.string(), body: z.string().min(1).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const ticket = await db.supportTicket.findUniqueOrThrow({
        where: { id: input.ticketId, playerAccountId: player.id },
        select: { status: true },
      })
      if (ticket.status === "CLOSED") throw new Error("This ticket is closed")
      return db.supportTicketMessage.create({
        data: { ticketId: input.ticketId, authorId: ctx.userId, body: input.body },
        select: { id: true, body: true, createdAt: true },
      })
    }),
})
