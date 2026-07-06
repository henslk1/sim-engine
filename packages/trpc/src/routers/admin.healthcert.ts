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
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      validForCycles: z.number().int().min(1),
      requiredForCompetition: z.boolean(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.healthCertificateDef.update({ where: { id }, data })
      return db.healthCertificateDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.healthCertificateDef.delete({ where: { id: input.id } })),
})
