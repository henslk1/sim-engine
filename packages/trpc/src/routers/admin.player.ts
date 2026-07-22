import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const playerAdminRouter = router({
  initCapacity: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ input }) => {
      const players = await db.playerAccount.findMany({
        where: { gameId: input.gameId },
        select: { id: true },
      })

      let created = 0
      for (const player of players) {
        const existing = await db.playerCapacity.findUnique({
          where: { playerAccountId: player.id },
        })
        if (!existing) {
          await db.playerCapacity.create({
            data: { playerAccountId: player.id, animalSlotBase: 10, subContainerBase: 3, geneticStorageBase: 50 },
          })
          created++
        }
      }

      return { initialized: created, skipped: players.length - created }
    }),

  grantBalance: publicProcedure
    .input(z.object({
      playerAccountId: z.string(),
      currencyDefId: z.string(),
      amount: z.number().int(),
    }))
    .mutation(({ input }) =>
      db.playerBalance.upsert({
        where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: input.currencyDefId } },
        update: { balance: { increment: input.amount } },
        create: { playerAccountId: input.playerAccountId, currencyDefId: input.currencyDefId, balance: input.amount },
      })
    ),

  listPlayers: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.playerAccount.findMany({
        where: { gameId: input.gameId },
        select: {
          id: true,
          username: true,
          playerBalances: { select: { balance: true, currencyDef: { select: { id: true, name: true, symbol: true } } } },
        },
        orderBy: { username: "asc" },
      })
    ),
})
