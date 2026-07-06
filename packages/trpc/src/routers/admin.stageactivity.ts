import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const stageActivityAdminRouter = router({
  listByStage: publicProcedure
    .input(z.object({ lifeStageId: z.string() }))
    .query(({ input }) =>
      db.stageActivityDef.findMany({
        where: { lifeStageId: input.lifeStageId },
        orderBy: { name: "asc" },
        include: { traitDef: { select: { id: true, name: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      lifeStageId: z.string(),
      traitDefId: z.string(),
      name: z.string().min(1),
      traitEffect: z.number(),
      energyCost: z.number(),
      description: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, lifeStageId, description, ...rest } = input
      const data = { ...rest, description: description ?? null }
      if (id) return db.stageActivityDef.update({ where: { id }, data })
      return db.stageActivityDef.create({ data: { gameId, lifeStageId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.stageActivityLog.deleteMany({ where: { stageActivityDefId: input.id } })
        return tx.stageActivityDef.delete({ where: { id: input.id } })
      })
    ),
})
