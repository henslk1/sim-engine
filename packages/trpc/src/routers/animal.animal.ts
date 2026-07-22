import { db, Prisma } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { advanceAnimalAging, runConformationInspection, pruneAnimalData } from "@sim-engine/engine"

export const animalAnimalRouter = router({
  list: publicProcedure.query(() =>
    db.animal.findMany({
      where: {
        status: { not: "EMBRYO_STORED" },
        NOT: { gameShopAnimal: { isAvailable: true } },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        sex: true,
        image: true,
        breed: { select: { id: true, name: true } },
        lifeStage: { select: { name: true } },
        disciplineDef: { select: { name: true, isConformation: true } },
        conformationScores: { select: { breedId: true } },
        equipment: { select: { itemDef: { select: { id: true } } } },
        subContainerId: true,
        ageInCycles: true,
        isCastrated: true,
        breedingCooldownUntilCycle: true,
        geneticCollectionCooldownUntilCycle: true,
        pregnancies: { where: { isCompleted: false }, take: 1, select: { id: true } },
        _count: { select: { healthRecords: { where: { isActive: true, diagnosedAt: null } } } },
        healthCertificates: { select: { certDefId: true, isValid: true, expiresAtCycle: true } },
      },
    })
  ),

  archive: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { status: "ARCHIVED" },
        select: { id: true, status: true },
      })
    ),

  bury: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { status: true },
      })
      if (animal.status !== "DECEASED") throw new Error("Only deceased animals can be buried")
      const result = await db.animal.update({
        where: { id: input.animalId },
        data: { status: "BURIED" },
        select: { id: true, status: true },
      })
      pruneAnimalData(input.animalId).catch(console.error)
      return result
    }),

  moveToSubContainer: publicProcedure
    .input(z.object({ animalId: z.string(), subContainerId: z.string().nullable() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { subContainerId: input.subContainerId },
        select: { id: true, subContainerId: true },
      })
    ),

  updateName: publicProcedure
    .input(z.object({ animalId: z.string(), name: z.string().min(1).max(100).trim() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { name: input.name },
        select: { id: true, name: true },
      })
    ),

  updateNotes: publicProcedure
    .input(z.object({ animalId: z.string(), notes: z.string().max(5000) }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { notes: input.notes.trim() || Prisma.DbNull },
        select: { id: true, notes: true },
      })
    ),

    togglePin: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        const animal = await db.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { isPinned: true },
        })
        return db.animal.update({
          where: { id: input.animalId },
          data: { isPinned: !animal.isPinned },
          select: { id: true, isPinned: true },
        })
      }),

    advanceAge: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(({ input }) => advanceAnimalAging(db, input.animalId)),

    castrate: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        return db.$transaction(async (tx) => {
          const animal = await tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { gameId: true, playerAccountId: true, ageInCycles: true, isCastrated: true },
          })

          if (animal.isCastrated) throw new Error("Animal is already castrated")

          const vetService = await tx.vetServiceDef.findFirstOrThrow({
            where: { gameId: animal.gameId, serviceType: "CASTRATION" },
            select: { id: true, baseCost: true, currencyDefId: true },
          })

          if (vetService.baseCost > 0) {
            await tx.playerBalance.update({
              where: {
                playerAccountId_currencyDefId: {
                  playerAccountId: animal.playerAccountId,
                  currencyDefId: vetService.currencyDefId,
                },
              },
              data: { balance: { decrement: vetService.baseCost } },
            })
            await tx.transaction.create({
              data: {
                gameId: animal.gameId,
                fromPlayerAccountId: animal.playerAccountId,
                currencyDefId: vetService.currencyDefId,
                amount: vetService.baseCost,
                txnType: "VET_SERVICE_FEE",
              },
            })
          }

          await tx.vetVisitLog.create({
            data: {
              animalId: input.animalId,
              playerAccountId: animal.playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: animal.ageInCycles,
            },
          })

          return tx.animal.update({
            where: { id: input.animalId },
            data: { isCastrated: true },
            select: { id: true, isCastrated: true },
          })
        })
      }),

    setDiscipline: publicProcedure
      .input(z.object({ animalId: z.string(), disciplineDefId: z.string() }))
      .mutation(async ({ input }) => {
        const lowestTier = await db.competitionTierDef.findFirst({
          where: { disciplineDefId: input.disciplineDefId },
          orderBy: { tierIndex: "asc" },
          select: { id: true },
        })

        return db.$transaction(async (tx) => {
          await tx.animal.update({
            where: { id: input.animalId },
            data: { disciplineDefId: input.disciplineDefId },
          })

          if (lowestTier) {
            await tx.animalCompetitionTier.upsert({
              where: { animalId_disciplineDefId: { animalId: input.animalId, disciplineDefId: input.disciplineDefId } },
              create: { animalId: input.animalId, disciplineDefId: input.disciplineDefId, tierDefId: lowestTier.id },
              update: {},
            })
          }

          return { animalId: input.animalId, disciplineDefId: input.disciplineDefId }
        })
      }),

    conformationInspect: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(({ input }) => runConformationInspection(db, input.animalId)),

    createSubContainer: publicProcedure
      .input(z.object({ playerAccountId: z.string(), name: z.string().min(1).max(80).trim() }))
      .mutation(async ({ input }) => {
        const count = await db.subContainer.count({ where: { playerAccountId: input.playerAccountId } })
        return db.subContainer.create({
          data: { playerAccountId: input.playerAccountId, name: input.name, displayOrder: count },
          select: { id: true, name: true, displayOrder: true },
        })
      }),

    updateSubContainer: publicProcedure
      .input(z.object({ id: z.string(), name: z.string().min(1).max(80).trim() }))
      .mutation(({ input }) =>
        db.subContainer.update({
          where: { id: input.id },
          data: { name: input.name },
          select: { id: true, name: true },
        })
      ),

    deleteSubContainer: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.animal.updateMany({ where: { subContainerId: input.id }, data: { subContainerId: null } })
        await db.subContainer.delete({ where: { id: input.id } })
        return { deleted: true }
      }),
})
