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

        const vetService = await tx.vetServiceDef.findFirst({
          where: { gameId, serviceType: "ULTRASOUND" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        if (vetService && vetService.baseCost > 0) {
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

        if (vetService) {
          await tx.vetVisitLog.create({
            data: {
              animalId: pregnancy.animalId,
              playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: ageInCycles,
            },
          })
        }

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
            animal: { select: { id: true, gameId: true, ageInCycles: true } },
            offspring: {
              select: { animal: { select: { id: true, status: true } } },
            },
          },
        })

        if (!pregnancy.isCompleted) throw new Error("Pregnancy is not complete yet")

        const nameMap = new Map(input.names?.map((n) => [n.animalId, n.name]) ?? [])

        const [ltcDefs, gameConfig] = await Promise.all([
          tx.longTermCareActionDef.findMany({
            where: { gameId: pregnancy.animal.gameId },
            select: { id: true, intervalCycles: true },
          }),
          tx.gameConfig.findUnique({
            where: { gameId: pregnancy.animal.gameId },
            select: { breedingCooldownCycles: true },
          }),
        ])

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

        if ((gameConfig?.breedingCooldownCycles ?? 0) > 0) {
          await tx.animal.update({
            where: { id: pregnancy.animal.id },
            data: { breedingCooldownUntilCycle: pregnancy.animal.ageInCycles + gameConfig!.breedingCooldownCycles },
          })
        }

        if (unborn.length > 0) {
          await tx.animalDailyLog.create({
            data: {
              animalId: pregnancy.animal.id,
              cycleNumber: pregnancy.animal.ageInCycles,
              eventType: "BIRTH",
              context: { offspringCount: unborn.length },
            },
          })
        }

        return { damId: pregnancy.animal.id, born: unborn.length }
      })
    }),

  abort: publicProcedure
    .input(z.object({ pregnancyId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const pregnancy = await tx.pregnancy.findUniqueOrThrow({
          where: { id: input.pregnancyId },
          select: {
            isCompleted: true,
            animalId: true,
            animal: { select: { gameId: true, playerAccountId: true, ageInCycles: true } },
            offspring: { select: { animalId: true } },
          },
        })

        if (pregnancy.isCompleted) throw new Error("Pregnancy is already completed")

        const { gameId, playerAccountId, ageInCycles } = pregnancy.animal

        const vetService = await tx.vetServiceDef.findFirst({
          where: { gameId, serviceType: "PREGNANCY_ABORT" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        if (vetService && vetService.baseCost > 0) {
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

        if (vetService) {
          await tx.vetVisitLog.create({
            data: {
              animalId: pregnancy.animalId,
              playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: ageInCycles,
            },
          })
        }

        const offspringAnimalIds = pregnancy.offspring.map((o) => o.animalId)

        await tx.pregnancyOffspring.deleteMany({ where: { pregnancyId: input.pregnancyId } })

        if (offspringAnimalIds.length > 0) {
          await Promise.all([
            tx.animalAncestor.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalStat.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalGenotype.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalBreedComposition.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalEnergy.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalMood.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalCondition.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalCareScore.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
            tx.animalImmunity.deleteMany({ where: { animalId: { in: offspringAnimalIds } } }),
          ])
          await tx.animal.deleteMany({ where: { id: { in: offspringAnimalIds } } })
        }

        await tx.pregnancy.delete({ where: { id: input.pregnancyId } })

        const gameConfig = await tx.gameConfig.findUnique({
          where: { gameId },
          select: { breedingCooldownCycles: true },
        })
        if ((gameConfig?.breedingCooldownCycles ?? 0) > 0) {
          await tx.animal.update({
            where: { id: pregnancy.animalId },
            data: { breedingCooldownUntilCycle: ageInCycles + gameConfig!.breedingCooldownCycles },
          })
        }

        return { damId: pregnancy.animalId }
      })
    }),
})
