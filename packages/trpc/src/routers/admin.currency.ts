import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const currencyAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.currencyDef.findMany({
        where: { gameId: input.gameId },
        orderBy: [{ currencyType: "asc" }, { name: "asc" }],
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      currencyType: z.enum(["BASE", "PREMIUM", "PRESTIGE"]),
      symbol: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, symbol, ...rest } = input
      const data = { ...rest, symbol: symbol ?? null }
      if (id) return db.currencyDef.update({ where: { id }, data })
      return db.currencyDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.currencyDef.delete({ where: { id: input.id } })
    ),
})
