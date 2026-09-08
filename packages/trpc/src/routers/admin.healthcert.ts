import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const healthCertAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.healthCertificateDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      validForCycles: z.number().int().min(1),
      requiredForCompetition: z.boolean(),
      cost: z.number().int().min(0).default(0),
      currencyDefId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, currencyDefId, ...rest } = input
      const data = { ...rest, currencyDefId: currencyDefId ?? null }
      if (id) return db.healthCertificateDef.update({ where: { id }, data })
      return db.healthCertificateDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.healthCertificateDef.delete({ where: { id: input.id } })),
})
