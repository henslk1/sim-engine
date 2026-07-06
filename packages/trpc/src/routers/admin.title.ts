import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const titleAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.titleDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { rankOrder: "asc" },
        include: { disciplineDef: { select: { id: true, name: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      description: z.string().nullish(),
      disciplineDefId: z.string().nullish(),
      rankOrder: z.number().int(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, disciplineDefId, ...rest } = input
      const data = { ...rest, description: description ?? null, disciplineDefId: disciplineDefId ?? null }
      if (id) return db.titleDef.update({ where: { id }, data })
      return db.titleDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.animalTitle.deleteMany({ where: { titleDefId: input.id } })
        return tx.titleDef.delete({ where: { id: input.id } })
      })
    ),
})
