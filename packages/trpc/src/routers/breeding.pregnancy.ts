import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const breedingPregnancyRouter = router({
  ultrasound: publicProcedure
    .input(z.object({ pregnancyId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const pregnancy = await tx.pregnancy.findUniqueOrThrow({
          where: { id: input.pregnancyId },
          include: {
            animal: {
              select: {
                gameId: true,
                playerAccountId: true,
                ageInCycles: true,
                game: {
                  select: {
                    gameConfig: { select: { ultrasoundOpenCycle: true } },
                  },
                },
              },
            },
            offspring: {
              include: {
                animal: { select: { id: true, sex: true, phenotypeDescription: true } },
              },
            },
          },
        })

        if (pregnancy.ultrasoundUsed) {
          throw new Error("Ultrasound already used for this pregnancy")
        }

        const openCycle = pregnancy.animal.game.gameConfig?.ultrasoundOpenCycle ?? 0
        if (pregnancy.currentCycles < openCycle) {
          throw new Error(`Ultrasound not available until gestation cycle ${openCycle}`)
        }

        const { gameId, playerAccountId, ageInCycles } = pregnancy.animal

        const vetService = await tx.vetServiceDef.findFirstOrThrow({
          where: { gameId, serviceType: "EXAM" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        if (vetService.baseCost > 0) {
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId,
                currencyDefId: vetService.currencyDefId,
              },
            },
            data: { balance: { decrement: vetService.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId,
              fromPlayerAccountId: playerAccountId,
              currencyDefId: vetService.currencyDefId,
              amount: vetService.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        await tx.vetVisitLog.create({
          data: {
            animalId: pregnancy.animalId,
            playerAccountId,
            vetServiceDefId: vetService.id,
            visitCycle: ageInCycles,
          },
        })

        await tx.pregnancy.update({
          where: { id: input.pregnancyId },
          data: { ultrasoundUsed: true },
        })

        return {
          pregnancyId: input.pregnancyId,
          offspring: pregnancy.offspring.map((o) => ({
            animalId: o.animal.id,
            sex: o.animal.sex,
            phenotypeDescription: o.animal.phenotypeDescription,
          })),
        }
      })
    }),
})
