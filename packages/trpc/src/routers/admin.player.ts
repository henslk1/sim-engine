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
})
