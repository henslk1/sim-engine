import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const panelAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.geneticPanelDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { loci: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      panelType: z.enum(["HEALTH", "CONFORMATION"]),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.geneticPanelDef.update({ where: { id }, data })
      return db.geneticPanelDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.geneticPanelLocus.deleteMany({ where: { panelDefId: input.id } })
        return tx.geneticPanelDef.delete({ where: { id: input.id } })
      })
    ),

  listPanelLoci: publicProcedure
    .input(z.object({ panelDefId: z.string() }))
    .query(({ input }) =>
      db.geneticPanelLocus.findMany({
        where: { panelDefId: input.panelDefId },
        include: { locus: { select: { id: true, name: true } } },
      })
    ),

  addPanelLocus: publicProcedure
    .input(z.object({ panelDefId: z.string(), locusId: z.string() }))
    .mutation(({ input }) => db.geneticPanelLocus.create({ data: input })),

  removePanelLocus: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.geneticPanelLocus.delete({ where: { id: input.id } })),
})
