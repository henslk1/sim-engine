import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { restockShop, deleteAnimalsWithChildren } from "@sim-engine/engine"
import { z } from "zod"

export const gameShopAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.gameShopBreedConfig.findMany({
        where: { gameId: input.gameId },
        orderBy: { breed: { name: "asc" } },
        include: {
          breed: { select: { id: true, name: true } },
          currencyDef: { select: { id: true, name: true, symbol: true } },
        },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      breedId: z.string(),
      targetStock: z.number().int().min(0),
      price: z.number().int().min(0),
      currencyDefId: z.string(),
      gameShopFloor: z.number().min(0).max(1).default(0),
      shopAlleleQualityBias: z.number().min(0).max(1).default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...rest } = input
      if (id) return db.gameShopBreedConfig.update({ where: { id }, data: rest })
      return db.gameShopBreedConfig.create({ data: { gameId, ...rest } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.gameShopBreedConfig.delete({ where: { id: input.id } })),

  restock: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ input }) => {
      await db.gameShopAnimal.deleteMany({
        where: { gameId: input.gameId, isAvailable: false },
      })
      const created = await restockShop(input.gameId)
      return { created }
    }),

  reset: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ input }) => {
      const available = await db.gameShopAnimal.findMany({
        where: { gameId: input.gameId, isAvailable: true },
        select: { animalId: true },
      })

      // Remove all GameShopAnimal records (sold + unsold)
      await db.gameShopAnimal.deleteMany({ where: { gameId: input.gameId } })

      // Delete unsold animals and all their child records
      await deleteAnimalsWithChildren(available.map((a) => a.animalId))

      const created = await restockShop(input.gameId)
      return { deleted: available.length, created }
    }),
})
