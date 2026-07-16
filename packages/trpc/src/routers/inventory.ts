import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { restockShop } from "@sim-engine/engine"
import { z } from "zod"

export const inventoryRouter = router({
  mine: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.playerInventory.findMany({
        where: { playerAccountId: input.playerAccountId },
        include: { itemDef: true },
        orderBy: { itemDef: { name: "asc" } },
      })
    ),

  listStore: publicProcedure
    .input(z.object({ gameId: z.string(), shopType: z.enum(["BASE", "PREMIUM", "VET"]).optional() }))
    .query(({ input }) =>
      db.storeListing.findMany({
        where: {
          gameId: input.gameId,
          isActive: true,
          ...(input.shopType ? { shopType: input.shopType } : {}),
        },
        include: {
          itemDef: true,
          currencyDef: { select: { id: true, name: true, symbol: true } },
        },
        orderBy: [{ shopType: "asc" }, { itemDef: { name: "asc" } }],
      })
    ),

  buy: publicProcedure
    .input(z.object({
      listingId: z.string(),
      playerAccountId: z.string(),
      quantity: z.number().int().min(1).default(1),
    }))
    .mutation(async ({ input }) =>
      db.$transaction(async (tx) => {
        const listing = await tx.storeListing.findUniqueOrThrow({
          where: { id: input.listingId },
          include: { itemDef: { select: { id: true, name: true } }, currencyDef: { select: { id: true, name: true } } },
        })

        if (!listing.isActive) throw new Error("This item is no longer available")

        const totalCost = listing.price * input.quantity

        if (totalCost > 0) {
          const balance = await tx.playerBalance.findUnique({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: listing.currencyDefId } },
          })

          if (!balance || balance.balance < totalCost) {
            throw new Error(`Insufficient ${listing.currencyDef.name} balance`)
          }

          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: listing.currencyDefId } },
            data: { balance: { decrement: totalCost } },
          })

          await tx.transaction.create({
            data: {
              gameId: listing.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId: listing.currencyDefId,
              amount: totalCost,
              txnType: "STORE_PURCHASE",
            },
          })
        }

        await tx.playerInventory.upsert({
          where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: listing.itemDefId } },
          update: { quantity: { increment: input.quantity } },
          create: { playerAccountId: input.playerAccountId, itemDefId: listing.itemDefId, quantity: input.quantity },
        })

        return { item: listing.itemDef.name, quantity: input.quantity, cost: totalCost }
      })
    ),

  equip: publicProcedure
    .input(z.object({
      animalId: z.string(),
      playerAccountId: z.string(),
      itemDefId: z.string(),
    }))
    .mutation(async ({ input }) =>
      db.$transaction(async (tx) => {
        const itemDef = await tx.itemDef.findUniqueOrThrow({
          where: { id: input.itemDefId },
          select: { itemType: true, name: true },
        })

        if (itemDef.itemType !== "EQUIPMENT") throw new Error("This item cannot be equipped")

        const inventory = await tx.playerInventory.findUnique({
          where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: input.itemDefId } },
        })

        if (!inventory || inventory.quantity < 1) throw new Error("Item not in inventory")

        if (inventory.quantity === 1) {
          await tx.playerInventory.delete({
            where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: input.itemDefId } },
          })
        } else {
          await tx.playerInventory.update({
            where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: input.itemDefId } },
            data: { quantity: { decrement: 1 } },
          })
        }

        return tx.animalEquipment.create({
          data: { animalId: input.animalId, itemDefId: input.itemDefId, slot: input.itemDefId },
          include: { itemDef: { select: { name: true } } },
        })
      })
    ),

  unequip: publicProcedure
    .input(z.object({ equipmentId: z.string(), playerAccountId: z.string() }))
    .mutation(async ({ input }) =>
      db.$transaction(async (tx) => {
        const equipment = await tx.animalEquipment.findUniqueOrThrow({
          where: { id: input.equipmentId },
          select: { itemDefId: true },
        })

        await tx.animalEquipment.delete({ where: { id: input.equipmentId } })

        await tx.playerInventory.upsert({
          where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: equipment.itemDefId } },
          update: { quantity: { increment: 1 } },
          create: { playerAccountId: input.playerAccountId, itemDefId: equipment.itemDefId, quantity: 1 },
        })

        return { unequipped: true }
      })
    ),

  listShopAnimals: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.gameShopAnimal.findMany({
        where: { gameId: input.gameId, isAvailable: true },
        include: {
          animal: {
            select: {
              id: true,
              name: true,
              sex: true,
              breed: { select: { name: true } },
              lifeStage: { select: { name: true } },
            },
          },
          shopBreedConfig: {
            select: {
              price: true,
              currencyDefId: true,
              currencyDef: { select: { id: true, name: true, symbol: true } },
            },
          },
        },
        orderBy: { shopBreedConfig: { breed: { name: "asc" } } },
      })
    ),

  buyAnimal: publicProcedure
    .input(z.object({ gameShopAnimalId: z.string(), playerAccountId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await db.$transaction(async (tx) => {
        const shopAnimal = await tx.gameShopAnimal.findUniqueOrThrow({
          where: { id: input.gameShopAnimalId },
          include: {
            shopBreedConfig: {
              include: { currencyDef: { select: { id: true, name: true } } },
            },
            animal: { select: { id: true, name: true, gameId: true } },
          },
        })

        if (!shopAnimal.isAvailable) throw new Error("This animal is no longer available")

        const { price, currencyDefId, currencyDef } = shopAnimal.shopBreedConfig

        if (price > 0) {
          const balance = await tx.playerBalance.findUnique({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId } },
          })
          if (!balance || balance.balance < price) {
            throw new Error(`Insufficient ${currencyDef.name} balance`)
          }
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId } },
            data: { balance: { decrement: price } },
          })
          await tx.transaction.create({
            data: {
              gameId: shopAnimal.animal.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId,
              amount: price,
              txnType: "STORE_PURCHASE",
            },
          })
        }

        await tx.animal.update({
          where: { id: shopAnimal.animalId },
          data: { playerAccountId: input.playerAccountId },
        })

        await tx.gameShopAnimal.update({
          where: { id: input.gameShopAnimalId },
          data: { isAvailable: false, purchasedAt: new Date() },
        })

        return {
          animalId: shopAnimal.animalId,
          animalName: shopAnimal.animal.name,
          gameId: shopAnimal.animal.gameId,
          shopBreedConfigId: shopAnimal.shopBreedConfigId,
        }
      })

      restockShop(result.gameId, result.shopBreedConfigId).catch(console.error)
      return { animalId: result.animalId, animalName: result.animalName }
    }),
})
