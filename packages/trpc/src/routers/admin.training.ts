import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const trainingAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.trainingActionDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { statDef: { select: { id: true, name: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      statDefId: z.string(),
      baseGain: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.trainingActionDef.update({ where: { id }, data })
      return db.trainingActionDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.trainingLog.deleteMany({ where: { trainingActionDefId: input.id } })
        return tx.trainingActionDef.delete({ where: { id: input.id } })
      })
    ),
})
