import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

const restrictionInput = {
  breedRestrictions: z.array(z.string()).default([]),
  statMinimums: z.array(z.object({ statDefId: z.string(), minValue: z.number().min(0) })).default([]),
}

export const breedingListingRouter = router({
  create: publicProcedure
    .input(z.object({
      animalId: z.string(),
      pricePerSlot: z.number().int().min(0).default(0),
      currencyDefId: z.string().optional(),
      description: z.any().optional(),
      ...restrictionInput,
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
          breedRestrictions: { createMany: { data: input.breedRestrictions.map((breedId) => ({ breedId })) } },
          statMinimums: { createMany: { data: input.statMinimums } },
        },
        select: { id: true, isActive: true },
      })
    }),

  update: publicProcedure
    .input(z.object({
      listingId: z.string(),
      pricePerSlot: z.number().int().min(0).default(0),
      currencyDefId: z.string().optional(),
      description: z.any().optional(),
      ...restrictionInput,
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        await tx.breedingListingBreedRestriction.deleteMany({ where: { listingId: input.listingId } })
        await tx.breedingListingStatMinimum.deleteMany({ where: { listingId: input.listingId } })
        return tx.breedingListing.update({
          where: { id: input.listingId },
          data: {
            pricePerSlot: input.pricePerSlot,
            currencyDefId: input.pricePerSlot > 0 ? (input.currencyDefId ?? null) : null,
            description: input.description ?? null,
            breedRestrictions: { createMany: { data: input.breedRestrictions.map((breedId) => ({ breedId })) } },
            statMinimums: { createMany: { data: input.statMinimums } },
          },
          select: { id: true },
        })
      })
    }),

  addSlot: publicProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const listing = await tx.breedingListing.findUniqueOrThrow({
          where: { id: input.listingId },
          select: {
            animalId: true,
            isActive: true,
            slots: { where: { status: "AVAILABLE" }, select: { id: true } },
            animal: {
              select: {
                energy: { select: { currentEnergy: true } },
                game: {
                  select: {
                    gameConfig: { select: { maxBreedingSlots: true, breedingEnergyCost: true } },
                  },
                },
              },
            },
          },
        })

        if (!listing.isActive) throw new Error("Listing is not active")

        const gameConfig = listing.animal.game.gameConfig
        const energyCost = gameConfig?.breedingEnergyCost ?? 0
        const currentEnergy = listing.animal.energy?.currentEnergy ?? 0

        if (energyCost > 0 && currentEnergy < energyCost)
          throw new Error("Not enough energy to add a breeding slot")

        const maxSlots = gameConfig?.maxBreedingSlots
        if (maxSlots != null) {
          const raiseItems = await tx.animalAppliedItem.findMany({
            where: { animalId: listing.animalId, isConsumed: false, itemDef: { effectType: "BREEDING_SLOT_RAISE" } },
            select: { itemDef: { select: { effects: true } } },
          })
          const bonus = raiseItems.reduce((sum, item) => {
            const effects = item.itemDef.effects as { raise?: number } | null
            return sum + (effects?.raise ?? 0)
          }, 0)
          if (listing.slots.length >= maxSlots + bonus)
            throw new Error(`Maximum breeding slots reached (${maxSlots + bonus})`)
        }

        if (energyCost > 0) {
          await tx.animalEnergy.update({
            where: { animalId: listing.animalId },
            data: { currentEnergy: { decrement: energyCost } },
          })
        }

        return tx.breedingSlot.create({
          data: { listingId: input.listingId, status: "AVAILABLE" },
          select: { id: true, status: true },
        })
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
