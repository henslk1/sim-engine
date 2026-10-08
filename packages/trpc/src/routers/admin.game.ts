import { router, publicProcedure } from "../trpc.js";
import { db } from "@sim-engine/db";
import type { Prisma } from "@sim-engine/db";
import { z } from "zod";
import { ensureGlobalChatServer } from "../messaging/servers.js"
import {
  IMMINENT_BOUNDARY_MS,
  SCHEDULED_TASK_TYPES,
  describeSchedule,
  isValidTimeZone,
  nextBoundaryFor,
  type GameSchedule,
} from "@sim-engine/engine"

export const gameAdminRouter = router({
  get: publicProcedure.query(() =>
    db.game.findFirst({ include: { gameConfig: true } })
  ),

  list: publicProcedure.query(() =>
    db.game.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, isActive: true } })
  ),

  saveGame: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
      isActive: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      if (input.id) {
        return db.game.update({
          where: { id: input.id },
          data: { name: input.name, slug: input.slug, isActive: input.isActive },
        })
      }
      const game = await db.game.create({
        data: { name: input.name, slug: input.slug, isActive: input.isActive },
      })
      // Every game has exactly one global chat server, so it is created with the
      // game rather than left for someone to remember later.
      await ensureGlobalChatServer(game.id)
      return game
    }),

    saveConfig: publicProcedure
      .input(z.object({
        gameId: z.string(),
        defaultInnateRatio: z.number().min(0).max(1),
        trainingCeilingMultiplier: z.number().min(0),
        pedigreeDisplayDepth: z.number().int().min(1),
        predictorDailyLimitFree: z.number().int().min(0),
        breedingEnergyCost: z.number().min(0).default(0),
        maxBreedingSlots: z.number().int().min(1).nullish(),
        containerLabel: z.string().nullish(),
        subContainerLabel: z.string().nullish(),
        gestationCycles: z.number().int().min(1).default(12),
        cyclesPerYear: z.number().int().min(1).default(12),
        moodDecayRate: z.number().default(0),
        conditionDecayRate: z.number().default(0),
        conditionWorkGain: z.number().default(0),
        careScoreDecayRate: z.number().default(0),
        careScoreFloor: z.number().default(0),
        careScoreCeiling: z.number().default(100),
        careScoreRecoveryRate: z.number().default(0),
        immunityDecayRate: z.number().default(0),
        immunityRecoveryRate: z.number().default(0),
        immunityMin: z.number().default(0),
        immunityMax: z.number().default(100),
        energyLowCareThreshold: z.number().default(0),
        energyLowCarePenalty: z.number().default(0),
        lifeExpectancyBaseline: z.number().int().nullish(),
        breedingBaseGain: z.number().min(0).default(30),
        breedingMinGain: z.number().min(0).default(4),
        breedingVarianceFactor: z.number().min(0).max(1).default(0),
        gestationCareFloor: z.number().min(0).max(1).default(0.7),
        predictorCost: z.number().int().min(0).default(0),
        predictorDailyLimitSubscriber: z.number().int().min(0).default(0),
        multiplesBirthCap: z.number().int().min(1).default(1),
        multiplesChance: z.number().min(0).max(1).default(0),
        identicalMultiplesChance: z.number().min(0).max(1).default(0),
        ultrasoundOpenCycle: z.number().int().min(0).default(0),
        breedingCooldownCycles: z.number().int().min(0).default(0),
        geneticCollectionCooldownCycles: z.number().int().min(0).default(0),
        conformationInspectionMinCycle: z.number().int().min(0).default(0),
        topGradeDoubleBonusChance: z.number().min(0).max(1).default(0.1),
        overworkInjuryThreshold: z.number().default(0),
        overworkInjuryChance: z.number().default(0),
        tutorialMaleBaseTemplateId: z.string().nullish(),
        tutorialFemaleBaseTemplateId: z.string().nullish(),
        tutorialFemalePrice: z.number().int().min(0).default(0),
        completeProfileTestCost: z.number().int().min(0).default(0),
        completeProfileTestCurrencyDefId: z.string().nullish(),
        // Scheduling. These four decide when the nightly and the competition
        // sweep actually run, so the bounds here are the same ones
        // `validateGameSchedule` enforces in the scheduler — a value this form
        // accepts must be one the scheduler can compute a boundary from.
        nightlyRunHour: z.number().int().min(0).max(23).default(0),
        nightlyRunMinute: z.number().int().min(0).max(59).default(0),
        gameTimeZone: z.string()
          .refine(isValidTimeZone, "Not a time zone this server recognises")
          .default("UTC"),
        competitionSweepMinutes: z.number().int().min(1).max(1440).default(60),
      }))
      .mutation(async ({ input }) => {
        const { gameId, containerLabel, subContainerLabel, lifeExpectancyBaseline, maxBreedingSlots, tutorialMaleBaseTemplateId, tutorialFemaleBaseTemplateId, completeProfileTestCurrencyDefId, ...rest } = input
        const labels = {
          containerLabel: containerLabel ?? null,
          subContainerLabel: subContainerLabel ?? null,
        }
        const nullable = {
          lifeExpectancyBaseline: lifeExpectancyBaseline ?? null,
          maxBreedingSlots: maxBreedingSlots ?? null,
          tutorialMaleBaseTemplateId: tutorialMaleBaseTemplateId ?? null,
          tutorialFemaleBaseTemplateId: tutorialFemaleBaseTemplateId ?? null,
          completeProfileTestCurrencyDefId: completeProfileTestCurrencyDefId ?? null,
        }
        // One transaction, because the settings and the boundaries they imply
        // are one change. Committing the config and then failing to move the
        // tasks would report an error to the caller while leaving the config
        // saved and the schedule stale — the one state nobody could diagnose
        // from either screen.
        return db.$transaction(async (tx) => {
          const saved = await tx.gameConfig.upsert({
            where: { gameId },
            create: { gameId, ...rest, ...labels, ...nullable },
            update: { ...rest, ...labels, ...nullable },
          })

          await rescheduleTasks(tx, gameId, saved)
          return saved
        })
      }),

  /**
   * What each scheduled task is set to and when it next runs.
   *
   * Reads back from `ScheduledTask` rather than recomputing, because the row is
   * what the scheduler will actually obey. A config that says midnight and a
   * task that says otherwise is exactly the discrepancy worth being able to see.
   */
  scheduleStatus: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const config = await db.gameConfig.findUnique({
        where: { gameId: input.gameId },
        select: {
          nightlyRunHour: true,
          nightlyRunMinute: true,
          gameTimeZone: true,
          competitionSweepMinutes: true,
        },
      })
      if (!config) return []

      const tasks = await db.scheduledTask.findMany({
        where: { gameId: input.gameId },
        select: { taskType: true, enabled: true, nextRunAt: true },
      })

      return SCHEDULED_TASK_TYPES.map((taskType) => {
        const task = tasks.find((t) => t.taskType === taskType)
        return {
          taskType,
          description: describeSchedule(taskType, config),
          // The zone these times should be read in. Sent with the rows rather
          // than taken from the form, because the form may be holding an
          // unsaved change — and a line that renders the clock from the
          // dropdown beside a description from the database would be two
          // halves of one sentence disagreeing with each other.
          timeZone: config.gameTimeZone,
          enabled: task?.enabled ?? null,
          nextRunAt: task?.nextRunAt ?? null,
        }
      })
    }),

  listDailyAllowanceCurrencies: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.dailyAllowanceCurrency.findMany({
        where: { gameId: input.gameId },
        select: { id: true, amount: true, subscriberOnly: true, currencyDef: { select: { id: true, name: true } } },
        orderBy: [{ subscriberOnly: "asc" }, { currencyDef: { name: "asc" } }],
      })
    ),

  upsertDailyAllowanceCurrency: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      currencyDefId: z.string(),
      amount: z.number().int().min(0),
      subscriberOnly: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input
      if (id) return db.dailyAllowanceCurrency.update({ where: { id }, data: { amount: data.amount, subscriberOnly: data.subscriberOnly } })
      return db.dailyAllowanceCurrency.create({ data })
    }),

  deleteDailyAllowanceCurrency: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.dailyAllowanceCurrency.delete({ where: { id: input.id } })),

  listDailyAllowanceItems: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.dailyAllowanceItem.findMany({
        where: { gameId: input.gameId },
        select: { id: true, quantity: true, subscriberOnly: true, itemDef: { select: { id: true, name: true } } },
        orderBy: { itemDef: { name: "asc" } },
      })
    ),

  upsertDailyAllowanceItem: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      itemDefId: z.string(),
      quantity: z.number().int().min(1),
      subscriberOnly: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input
      if (id) return db.dailyAllowanceItem.update({ where: { id }, data: { quantity: data.quantity, subscriberOnly: data.subscriberOnly } })
      return db.dailyAllowanceItem.create({ data })
    }),

  deleteDailyAllowanceItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.dailyAllowanceItem.delete({ where: { id: input.id } })),

  setupCounts: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const { gameId } = input
      const [
        gameConfigRow,
        currencies, species, lifeStages, stats, personalityTraits,
        breeds, loci, alleles, expressionRules, geneticPanels, conformationSections,
        items, careActions, healthConditions, treatments, healthCerts,
        trainingActions, intensityTiers, stageActivities, titles,
        disciplines, competitionTiers, venues, seasonCategories, records,
        vetServices, storeListings, gameShopBreedConfigs, groupPrestigeTiers,
        dailyAllowanceItems,
      ] = await Promise.all([
        db.gameConfig.findUnique({ where: { gameId }, select: { gameId: true } }),
        db.currencyDef.count({ where: { gameId } }),
        db.species.count({ where: { gameId } }),
        db.lifeStageDef.count({ where: { gameId } }),
        db.statDef.count({ where: { gameId } }),
        db.personalityTraitDef.count({ where: { gameId } }),
        db.breed.count({ where: { gameId } }),
        db.locus.count({ where: { gameId } }),
        db.allele.count({ where: { locus: { gameId } } }),
        db.expressionRule.count({ where: { locus: { gameId } } }),
        db.geneticPanelDef.count({ where: { gameId } }),
        db.conformationSection.count({ where: { gameId } }),
        db.itemDef.count({ where: { gameId } }),
        db.careActionDef.count({ where: { gameId } }),
        db.healthConditionDef.count({ where: { gameId } }),
        db.treatmentDef.count({ where: { conditionDef: { gameId } } }),
        db.healthCertificateDef.count({ where: { gameId } }),
        db.trainingActionDef.count({ where: { gameId } }),
        db.intensityTierDef.count({ where: { gameId } }),
        db.stageActivityDef.count({ where: { gameId } }),
        db.titleDef.count({ where: { gameId } }),
        db.disciplineDef.count({ where: { gameId } }),
        db.competitionTierDef.count({ where: { gameId } }),
        db.venue.count({ where: { gameId } }),
        db.season.count({ where: { gameId } }),
        db.recordDef.count({ where: { gameId } }),
        db.vetServiceDef.count({ where: { gameId } }),
        db.storeListing.count({ where: { gameId } }),
        db.gameShopBreedConfig.count({ where: { gameId } }),
        db.groupPrestigeTierDef.count({ where: { gameId } }),
        db.dailyAllowanceItem.count({ where: { gameId } }),
      ])
      return {
        gameConfig: !!gameConfigRow,
        currencies, species, lifeStages, stats, personalityTraits,
        breeds, loci, alleles, expressionRules, geneticPanels, conformationSections,
        items, careActions, healthConditions, treatments, healthCerts,
        trainingActions, intensityTiers, stageActivities, titles,
        disciplines, competitionTiers, venues, seasonCategories, records,
        vetServices, storeListings, gameShopBreedConfigs, groupPrestigeTiers,
        dailyAllowanceItems,
      }
    }),
})


/**
 * Move each of a game's tasks onto the boundary its new settings imply.
 *
 * Without this, changing the time zone or the run time would not take effect
 * until after the next run fired on the old setting — you would save "midnight
 * Chicago", watch it run at 19:00, and reasonably conclude the setting did not
 * work.
 *
 * A task whose boundary has passed, or is about to, is left exactly where it
 * is — see `IMMINENT_BOUNDARY_MS`. Moving it would quietly cancel a run that
 * was seconds away, which is a surprising amount of damage for saving a form:
 * change the time zone at 23:59:50 and the whole night's aging would simply not
 * happen, with nothing anywhere saying why. The tick materializes that run on
 * the old settings, then computes the following boundary from the new ones.
 *
 * That window also closes the race in the other direction. The cutoff is
 * decided once, so without it a task that was in the future when this read it
 * could fall due before the update landed, and be moved anyway.
 */
async function rescheduleTasks(
  tx: Prisma.TransactionClient,
  gameId: string,
  schedule: GameSchedule
): Promise<void> {
  const now = new Date()
  const cutoff = new Date(now.getTime() + IMMINENT_BOUNDARY_MS)

  const tasks = await tx.scheduledTask.findMany({
    where: { gameId, nextRunAt: { gt: cutoff } },
    select: { id: true, taskType: true, nextRunAt: true },
  })

  for (const task of tasks) {
    const taskType = SCHEDULED_TASK_TYPES.find((type) => type === task.taskType)
    if (!taskType) continue

    const nextRunAt = nextBoundaryFor(taskType, schedule, now)
    if (nextRunAt.getTime() === task.nextRunAt.getTime()) continue

    // Conditional on the value this read saw, so a tick that materialized the
    // task in the meantime is not overwritten.
    await tx.scheduledTask.updateMany({
      where: { id: task.id, nextRunAt: task.nextRunAt },
      data: { nextRunAt },
    })
  }
}
