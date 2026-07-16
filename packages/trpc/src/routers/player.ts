import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const playerRouter = router({
  create: publicProcedure
    .input(z.object({ gameId: z.string(), username: z.string().min(3).max(30) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error("Not authenticated")
      const existing = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
      })
      if (existing) throw new Error("Player account already exists")

      const currencyDefs = await db.currencyDef.findMany({
        where: { gameId: input.gameId },
        select: { id: true },
      })

      return db.$transaction(async (tx) => {
        const account = await tx.playerAccount.create({
          data: { userId: ctx.userId!, gameId: input.gameId, username: input.username },
        })
        await Promise.all([
          tx.playerBalance.createMany({
            data: currencyDefs.map((c) => ({
              playerAccountId: account.id,
              currencyDefId: c.id,
              balance: 0,
            })),
          }),
          tx.playerCapacity.create({
            data: { playerAccountId: account.id, animalSlotBase: 10, subContainerBase: 3, geneticStorageBase: 50 },
          }),
          tx.playerProfile.create({ data: { playerAccountId: account.id } }),
          tx.playerSeniority.create({ data: { playerAccountId: account.id } }),
          tx.playerReputation.create({ data: { playerAccountId: account.id } }),
        ])
        return account
      })
    }),

  me: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) return null
      return db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true, username: true, avatar: true },
      })
    }),

  listSubContainers: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.subContainer.findMany({
        where: { playerAccountId: input.playerAccountId },
        select: { id: true, name: true },
        orderBy: { displayOrder: "asc" },
      })
    ),

  balances: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.playerBalance.findMany({
        where: { playerAccountId: input.playerAccountId },
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
      })
    ),
})