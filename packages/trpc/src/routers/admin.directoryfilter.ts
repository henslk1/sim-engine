import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const directoryFilterAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.directoryFilterDef.findMany({
        where: { gameId: input.gameId },
        orderBy: [{ sortOrder: "asc" }, { filterKey: "asc" }],
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      filterKey: z.string().min(1),
      displayLabel: z.string().min(1),
      filterType: z.string().min(1),
      isEnabled: z.boolean().default(true),
      sortOrder: z.number().int().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, sortOrder, ...rest } = input
      const data = { ...rest, sortOrder: sortOrder ?? null }
      if (id) return db.directoryFilterDef.update({ where: { id }, data })
      return db.directoryFilterDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.directoryFilterDef.delete({ where: { id: input.id } })
    ),
})
