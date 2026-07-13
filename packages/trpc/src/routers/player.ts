import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const playerRouter = router({
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
})