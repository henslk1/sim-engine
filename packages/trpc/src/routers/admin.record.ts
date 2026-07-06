import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const recordAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.recordDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: {
          disciplineDef: { select: { id: true, name: true } },
          breed: { select: { id: true, name: true } },
          statDef: { select: { id: true, name: true } },
        },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      description: z.string().nullish(),
      recordType: z.string().min(1),
      subjectType: z.string().min(1),
      disciplineDefId: z.string().nullish(),
      breedId: z.string().nullish(),
      statDefId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, disciplineDefId, breedId, statDefId, ...rest } = input
      const data = {
        ...rest,
        description: description ?? null,
        disciplineDefId: disciplineDefId ?? null,
        breedId: breedId ?? null,
        statDefId: statDefId ?? null,
      }
      if (id) return db.recordDef.update({ where: { id }, data })
      return db.recordDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.recordEntry.deleteMany({ where: { recordDefId: input.id } })
        return tx.recordDef.delete({ where: { id: input.id } })
      })
    ),
})
