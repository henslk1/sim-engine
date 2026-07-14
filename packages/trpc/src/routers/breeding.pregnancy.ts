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
          where: { gameId, serviceType: "ULTRASOUND" },
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
          offspringCount: pregnancy.offspring.length,
          offspring: pregnancy.offspring.map((o) => ({
            animalId: o.animal.id,
            sex: o.animal.sex,
            phenotypeDescription: o.animal.phenotypeDescription,
          })),
        }
      })
    }),

  getForBirth: publicProcedure
    .input(z.object({ pregnancyId: z.string() }))
    .query(({ input }) =>
      db.pregnancy.findUniqueOrThrow({
        where: { id: input.pregnancyId },
        select: {
          id: true,
          isCompleted: true,
          requiredCycles: true,
          animal: {
            select: {
              id: true,
              name: true,
              breed: { select: { name: true } },
            },
          },
          offspring: {
            orderBy: { birthOrder: "asc" },
            select: {
              birthOrder: true,
              animal: { select: { id: true, sex: true, status: true, phenotypeDescription: true } },
            },
          },
        },
      })
    ),

  birth: publicProcedure
    .input(z.object({
      pregnancyId: z.string(),
      names: z.array(z.object({
        animalId: z.string(),
        name: z.string().min(1).max(100).trim(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const pregnancy = await tx.pregnancy.findUniqueOrThrow({
          where: { id: input.pregnancyId },
          select: {
            isCompleted: true,
            animal: { select: { id: true, gameId: true } },
            offspring: {
              select: { animal: { select: { id: true, status: true } } },
            },
          },
        })

        if (!pregnancy.isCompleted) throw new Error("Pregnancy is not complete yet")

        const nameMap = new Map(input.names?.map((n) => [n.animalId, n.name]) ?? [])

        const ltcDefs = await tx.longTermCareActionDef.findMany({
          where: { gameId: pregnancy.animal.gameId },
          select: { id: true, intervalCycles: true },
        })

        const unborn = pregnancy.offspring.filter((o) => o.animal.status === "EMBRYO_STORED")
        for (const o of unborn) {
          await tx.animal.update({
            where: { id: o.animal.id },
            data: {
              status: "ALIVE",
              name: nameMap.get(o.animal.id) ?? "Unnamed Foal",
            },
          })
          if (ltcDefs.length > 0) {
            await tx.animalLongTermCareRecord.createMany({
              data: ltcDefs.map((def) => ({
                animalId: o.animal.id,
                longTermCareActionDefId: def.id,
                nextDueCycle: def.intervalCycles,
              })),
            })
          }
        }

        return { damId: pregnancy.animal.id, born: unborn.length }
      })
    }),
})
