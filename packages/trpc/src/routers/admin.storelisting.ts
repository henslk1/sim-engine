import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

const SHOP_TYPES = ["BASE", "PREMIUM", "VET"] as const

export const storeListingAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.storeListing.findMany({
        where: { gameId: input.gameId },
        orderBy: [{ shopType: "asc" }, { itemDef: { name: "asc" } }],
        include: {
          itemDef: { select: { id: true, name: true } },
          currencyDef: { select: { id: true, name: true, symbol: true } },
        },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      itemDefId: z.string(),
      shopType: z.enum(SHOP_TYPES),
      price: z.number().int().min(0),
      currencyDefId: z.string(),
      isActive: z.boolean().default(true),
      isRotating: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...rest } = input
      if (id) return db.storeListing.update({ where: { id }, data: rest })
      return db.storeListing.create({ data: { gameId, ...rest } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.storeListing.delete({ where: { id: input.id } })),
})
