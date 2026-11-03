import { db, Prisma } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { enterGameplay, enterGameplayForAnimal } from "../maintenance.js"
import { z } from "zod"
import { advanceAnimalAgingTx, applyConformationInspection, pruneAnimalData } from "@sim-engine/engine"

/**
 * Aging an animal by hand runs the same engine the nightly does, which is more
 * work than the default five seconds allows once it is inside the game's lock.
 */
const AGE_TX = { timeout: 20_000, maxWait: 5_000 } as const

export const animalAnimalRouter = router({
  list: publicProcedure
    .input(z.object({ playerAccountId: z.string(), includeTutorial: z.boolean().optional().default(false) }))
    .query(({ input }) =>
    db.animal.findMany({
      where: {
        playerAccountId: input.playerAccountId,
        status: { notIn: ["EMBRYO_STORED", "BURIED"] },
        ...(input.includeTutorial ? {} : { isTutorialAnimal: false }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        breedName: true,
        status: true,
        sex: true,
        image: true,
        isPinned: true,
        breed: { select: { id: true, name: true, isUnregistered: true } },
        lifeStage: { select: { name: true, stageIndex: true, canCompete: true, canBreed: true, canSurrogate: true } },
        disciplineDefId: true,
        secondaryDisciplineDefId: true,
        disciplineDef: { select: { name: true, isConformation: true } },
        conformationScores: { select: { breedId: true } },
        equipment: { select: { itemDef: { select: { id: true } } } },
        compTiers: { select: { disciplineDefId: true, tierDefId: true } },
        subContainerId: true,
        ageInCycles: true,
        isCastrated: true,
        breedingCooldownUntilCycle: true,
        geneticCollectionCooldownUntilCycle: true,
        activityRestrictions: { where: { isActive: true, restrictionType: { in: ["BREEDING", "ALL"] } }, select: { restrictionType: true } },
        pregnancies: { where: { isCompleted: false }, take: 1, select: { id: true } },
        _count: { select: { healthRecords: { where: { isActive: true, diagnosedAt: null } } } },
        healthCertificates: { select: { certDefId: true, isValid: true, expiresAtCycle: true } },
      },
    })
  ),

  listInactive: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.animal.findMany({
        where: {
          playerAccountId: input.playerAccountId,
          status: "BURIED",
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          sex: true,
          image: true,
          ageInCycles: true,
          diedAt: true,
          causeOfDeath: true,
          breedName: true,
          breed: { select: { id: true, name: true } },
          lifeStage: { select: { name: true } },
        },
      })
    ),

  archive: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        return tx.animal.update({
          where: { id: input.animalId },
          data: { status: "ARCHIVED" },
          select: { id: true, status: true },
        })
      })
    ),

  bury: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { status: true },
        })
        if (animal.status !== "DECEASED") throw new Error("Only deceased animals can be buried")
        return tx.animal.update({
          where: { id: input.animalId },
          data: { status: "BURIED" },
          select: { id: true, status: true },
        })
      })
      // After the commit, not inside it. Pruning opens its own transactions
      // and is fire-and-forget, so running it under the lock would hold the
      // game open for work the caller never waits for - and would roll back
      // nothing if it failed.
      pruneAnimalData(input.animalId).catch(console.error)
      return result
    }),

  moveToSubContainer: publicProcedure
    .input(z.object({ animalId: z.string(), subContainerId: z.string().nullable() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        return tx.animal.update({
          where: { id: input.animalId },
          data: { subContainerId: input.subContainerId },
          select: { id: true, subContainerId: true },
        })
      })
    ),

  updateName: publicProcedure
    .input(z.object({ animalId: z.string(), name: z.string().min(1).max(100).trim() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        return tx.animal.update({
          where: { id: input.animalId },
          data: { name: input.name },
          select: { id: true, name: true },
        })
      })
    ),

  updateNotes: publicProcedure
    .input(z.object({ animalId: z.string(), notes: z.string().max(5000) }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        return tx.animal.update({
          where: { id: input.animalId },
          data: { notes: input.notes.trim() || Prisma.DbNull },
          select: { id: true, notes: true },
        })
      })
    ),

    togglePin: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplayForAnimal(tx, input.animalId)
          const animal = await tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { isPinned: true },
          })
          return tx.animal.update({
            where: { id: input.animalId },
            data: { isPinned: !animal.isPinned },
            select: { id: true, isPinned: true },
          })
        })
      ),

    advanceAge: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          // This does what the nightly does, to an animal the nightly may be
          // aging right now, so of everything here it is the action that most
          // needs the game's lock - and every read below decides what aging
          // does.
          await enterGameplayForAnimal(tx, input.animalId)

          // Tutorial illness trigger: at step 98 ("Ready for Tomorrow") the next
          // aging creates an unknown illness to introduce the vet exam flow.
          const animalInfo = await tx.animal.findUnique({
            where: { id: input.animalId },
            select: {
              isTutorialAnimal: true,
              gameId: true,
              playerAccountId: true,
              ageInCycles: true,
              healthRecords: {
                where: { isActive: true },
                select: {
                  id: true,
                  treatmentRecords: {
                    where: { isActive: true },
                    select: { startedCycle: true, treatmentDef: { select: { durationCycles: true } } },
                  },
                },
              },
            },
          })
          let triggerConditionDefId: string | null = null
          if (animalInfo?.isTutorialAnimal && animalInfo.playerAccountId) {
            const player = await tx.playerAccount.findUnique({
              where: { id: animalInfo.playerAccountId },
              select: { seniority: { select: { tutorialDriverStep: true } } },
            })
            if (player?.seniority?.tutorialDriverStep === 98) {
              const stepDef = await tx.tutorialStepDef.findUnique({
                where: { gameId_stepKey: { gameId: animalInfo.gameId, stepKey: "step_ready_for_tomorrow" } },
                select: { triggerConditionDefId: true },
              })
              if (!stepDef?.triggerConditionDefId) throw new Error("The tutorial illness is not configured. Choose a trigger condition for Ready for Tomorrow.")
              triggerConditionDefId = stepDef.triggerConditionDefId
            }
          }

          let potentiallyResolvedRecordIds: string[] = []
          if (animalInfo?.isTutorialAnimal) {
            const newAge = (animalInfo.ageInCycles ?? 0) + 1
            potentiallyResolvedRecordIds = animalInfo.healthRecords?.filter(hr =>
              hr.treatmentRecords.some(t =>
                t.treatmentDef.durationCycles != null && newAge >= t.startedCycle + t.treatmentDef.durationCycles
              )
            ).map(hr => hr.id) ?? []
          }

          const result = await advanceAnimalAgingTx(tx, input.animalId)
          const tutorialConditionResolved = potentiallyResolvedRecordIds.length > 0 &&
            await tx.animalHealthRecord.count({ where: { id: { in: potentiallyResolvedRecordIds }, isActive: false } }) > 0
          if (triggerConditionDefId) {
            const existing = await tx.animalHealthRecord.findFirst({
              where: { animalId: input.animalId, conditionDefId: triggerConditionDefId, isActive: true },
            })
            if (!existing) {
              await tx.animalHealthRecord.create({
                data: { animalId: input.animalId, conditionDefId: triggerConditionDefId, isActive: true },
              })
            }
          }

          return { ...result, tutorialConditionResolved }
        }, AGE_TX)
      ),

    castrate: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        return db.$transaction(async (tx) => {
          await enterGameplayForAnimal(tx, input.animalId)
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
          await enterGameplayForAnimal(tx, input.animalId)
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

    setSecondaryDiscipline: publicProcedure
      .input(z.object({ animalId: z.string(), disciplineDefId: z.string() }))
      .mutation(async ({ input }) => {
        const lowestTier = await db.competitionTierDef.findFirst({
          where: { disciplineDefId: input.disciplineDefId },
          orderBy: { tierIndex: "asc" },
          select: { id: true },
        })

        return db.$transaction(async (tx) => {
          await enterGameplayForAnimal(tx, input.animalId)
          await tx.animal.update({
            where: { id: input.animalId },
            data: { secondaryDisciplineDefId: input.disciplineDefId },
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
      .mutation(({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplayForAnimal(tx, input.animalId)
          // The helper takes a client precisely so it can be handed this one -
          // scoring reads the animal's conformation and writes its result, and
          // both belong inside the lock.
          return applyConformationInspection(tx, input.animalId)
        })
      ),

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
      .mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          // Unlike creating or renaming a paddock, deleting one writes to every
          // animal in it, which is exactly what the nightly is also doing.
          const container = await tx.subContainer.findUniqueOrThrow({
            where: { id: input.id },
            select: { playerAccount: { select: { gameId: true } } },
          })
          await enterGameplay(tx, container.playerAccount.gameId)

          await tx.animal.updateMany({ where: { subContainerId: input.id }, data: { subContainerId: null } })
          await tx.subContainer.delete({ where: { id: input.id } })
          return { deleted: true }
        })
      ),
})
