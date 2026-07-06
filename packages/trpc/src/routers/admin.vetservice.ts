import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const vetServiceAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.vetServiceDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: {
          currencyDef: { select: { id: true, name: true, symbol: true } },
          panelDef: { select: { id: true, name: true } },
        },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      serviceType: z.enum(["EXAM", "PANEL_TEST", "GENETIC_COLLECTION", "GENETIC_STORAGE"]),
      baseCost: z.number().int().min(0),
      currencyDefId: z.string().min(1),
      hasSubscriberDiscount: z.boolean().default(false),
      panelDefId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, panelDefId, ...rest } = input
      const data = { ...rest, panelDefId: panelDefId ?? null }
      if (id) return db.vetServiceDef.update({ where: { id }, data })
      return db.vetServiceDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.vetServiceDef.delete({ where: { id: input.id } })
    ),
})
