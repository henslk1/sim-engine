import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const breedingListingRouter = router({
  create: publicProcedure
    .input(z.object({
      animalId: z.string(),
      pricePerSlot: z.number().int().min(0).default(0),
      currencyDefId: z.string().optional(),
      description: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { gameId: true, playerAccountId: true, sex: true },
      })

      if (animal.sex !== "MALE") throw new Error("Only males can have breeding listings")

      const existing = await db.breedingListing.findFirst({
        where: { animalId: input.animalId },
        select: { id: true },
      })
      if (existing) throw new Error("Animal already has a breeding listing")

      return db.breedingListing.create({
        data: {
          gameId: animal.gameId,
          ownerPlayerId: animal.playerAccountId,
          animalId: input.animalId,
          pricePerSlot: input.pricePerSlot,
          currencyDefId: input.pricePerSlot > 0 ? (input.currencyDefId ?? null) : null,
          description: input.description ?? null,
          isActive: true,
        },
        select: { id: true, isActive: true },
      })
    }),

  toggleActive: publicProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ input }) => {
      const listing = await db.breedingListing.findUniqueOrThrow({
        where: { id: input.listingId },
        select: { isActive: true },
      })
      return db.breedingListing.update({
        where: { id: input.listingId },
        data: { isActive: !listing.isActive },
        select: { id: true, isActive: true },
      })
    }),
})
