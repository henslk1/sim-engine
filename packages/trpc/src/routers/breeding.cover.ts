import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

const eligibleFemaleSelect = {
  id: true,
  name: true,
  ageInCycles: true,
  breed: { select: { id: true, name: true } },
  lifeStage: { select: { name: true } },
} as const

function eligibleFemaleWhere(playerAccountId: string, gameId: string) {
  return {
    playerAccountId,
    gameId,
    sex: "FEMALE" as const,
    isCastrated: false,
    status: "ALIVE" as const,
    lifeStage: { canBreed: true },
    pregnancies: { none: { isCompleted: false } },
  }
}

export const breedingCoverRouter = router({
  listEligibleOwn: publicProcedure
    .input(z.object({ sireId: z.string() }))
    .query(async ({ input }) => {
      const sire = await db.animal.findUniqueOrThrow({
        where: { id: input.sireId },
        select: { playerAccountId: true, gameId: true },
      })
      return db.animal.findMany({
        where: eligibleFemaleWhere(sire.playerAccountId, sire.gameId),
        select: eligibleFemaleSelect,
        orderBy: { name: "asc" },
      })
    }),

  lookupPlayerFemales: publicProcedure
    .input(z.object({ username: z.string().min(1), gameId: z.string(), excludePlayerAccountId: z.string().optional() }))
    .query(async ({ input }) => {
      const player = await db.playerAccount.findFirst({
        where: {
          username: input.username,
          gameId: input.gameId,
          ...(input.excludePlayerAccountId ? { id: { not: input.excludePlayerAccountId } } : {}),
        },
        select: { id: true, username: true },
      })
      if (!player) return null
      const females = await db.animal.findMany({
        where: eligibleFemaleWhere(player.id, input.gameId),
        select: eligibleFemaleSelect,
        orderBy: { name: "asc" },
      })
      return { player, females }
    }),

  send: publicProcedure
    .input(z.object({
      sireId: z.string(),
      damId: z.string(),
      price: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const sire = await db.animal.findUniqueOrThrow({
        where: { id: input.sireId },
        select: {
          sex: true, gameId: true,
          lifeStage: { select: { canBreed: true } },
          isCastrated: true,
        },
      })
      const dam = await db.animal.findUniqueOrThrow({
        where: { id: input.damId },
        select: {
          sex: true, gameId: true,
          lifeStage: { select: { canBreed: true } },
        },
      })

      if (sire.sex !== "MALE") throw new Error("Sire must be male")
      if (dam.sex !== "FEMALE") throw new Error("Dam must be female")
      if (sire.isCastrated) throw new Error("Sire is castrated")
      if (!sire.lifeStage.canBreed) throw new Error("Sire cannot breed at this life stage")
      if (!dam.lifeStage.canBreed) throw new Error("Dam cannot breed at this life stage")
      if (sire.gameId !== dam.gameId) throw new Error("Animals must be in the same game")

      const existing = await db.coverOffer.findFirst({
        where: { sireId: input.sireId, damId: input.damId, status: "PENDING" },
      })
      if (existing) throw new Error("A pending cover offer already exists for this pair")

      return db.coverOffer.create({
        data: {
          gameId: sire.gameId,
          sireId: input.sireId,
          damId: input.damId,
          price: input.price,
        },
        select: { id: true, status: true },
      })
    }),

  accept: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const offer = await tx.coverOffer.findUniqueOrThrow({
          where: { id: input.offerId },
          select: {
            status: true, gameId: true, sireId: true, damId: true, price: true,
            sire: { select: { name: true, breedId: true, breed: { select: { name: true } }, playerAccountId: true } },
            dam: { select: { name: true, breedId: true, breed: { select: { name: true } }, playerAccountId: true } },
          },
        })

        if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")

        const activePregnancy = await tx.pregnancy.count({
          where: { animalId: offer.damId, isCompleted: false },
        })
        if (activePregnancy > 0) throw new Error("Dam is already pregnant")

        if (offer.price > 0) {
          const vetService = await tx.vetServiceDef.findFirst({
            where: { gameId: offer.gameId, serviceType: "NATURAL_COVER" },
            select: { currencyDefId: true },
          })
          const currencyDefId = vetService?.currencyDefId
          if (currencyDefId) {
            await tx.playerBalance.update({
              where: { playerAccountId_currencyDefId: { playerAccountId: offer.dam.playerAccountId, currencyDefId } },
              data: { balance: { decrement: offer.price } },
            })
            await tx.playerBalance.update({
              where: { playerAccountId_currencyDefId: { playerAccountId: offer.sire.playerAccountId, currencyDefId } },
              data: { balance: { increment: offer.price } },
            })
            await tx.transaction.create({
              data: {
                gameId: offer.gameId,
                fromPlayerAccountId: offer.dam.playerAccountId,
                toPlayerAccountId: offer.sire.playerAccountId,
                currencyDefId,
                amount: offer.price,
                txnType: "STUD_FEE",
              },
            })
          }
        }

        await tx.coverOffer.update({
          where: { id: input.offerId },
          data: { status: "ACCEPTED" },
        })

        return tx.breedingRecord.create({
          data: {
            gameId: offer.gameId,
            sireId: offer.sireId,
            damId: offer.damId,
            sireSnapshot: { animalId: offer.sireId, name: offer.sire.name, breedId: offer.sire.breedId, breedName: offer.sire.breed.name },
            damSnapshot: { animalId: offer.damId, name: offer.dam.name, breedId: offer.dam.breedId, breedName: offer.dam.breed.name },
          },
          select: { id: true },
        })
      })
    }),

  decline: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      const offer = await db.coverOffer.findUniqueOrThrow({
        where: { id: input.offerId },
        select: { status: true },
      })
      if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")
      return db.coverOffer.update({
        where: { id: input.offerId },
        data: { status: "DECLINED" },
      })
    }),
})
