import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const intensityTierAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.intensityTierDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { tierIndex: "asc" },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      tierIndex: z.number().int().min(0),
      energyCost: z.number(),
      gainMultiplier: z.number(),
      minMood: z.number().nullable(),
      minCondition: z.number().nullable(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.intensityTierDef.update({ where: { id }, data })
      return db.intensityTierDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.trainingLog.deleteMany({ where: { intensityTierDefId: input.id } })
        return tx.intensityTierDef.delete({ where: { id: input.id } })
      })
    ),
})
