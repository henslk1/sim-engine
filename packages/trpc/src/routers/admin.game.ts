import { router, publicProcedure } from "../trpc.js";
import { db } from "@sim-engine/db";
import { z } from "zod";

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
    .mutation(({ input }) => {
      if (input.id) {
        return db.game.update({
          where: { id: input.id },
          data: { name: input.name, slug: input.slug, isActive: input.isActive },
        })
      }
      return db.game.create({
        data: { name: input.name, slug: input.slug, isActive: input.isActive },
      })
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
      }))
      .mutation(({ input }) => {
        const { gameId, containerLabel, subContainerLabel, lifeExpectancyBaseline, maxBreedingSlots, ...rest } = input
        const labels = {
          containerLabel: containerLabel ?? null,
          subContainerLabel: subContainerLabel ?? null,
        }
        const nullable = {
          lifeExpectancyBaseline: lifeExpectancyBaseline ?? null,
          maxBreedingSlots: maxBreedingSlots ?? null,
        }
        return db.gameConfig.upsert({
          where: { gameId },
          create: { gameId, ...rest, ...labels, ...nullable },
          update: { ...rest, ...labels, ...nullable },
        })
      }),

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
      ])
      return {
        gameConfig: !!gameConfigRow,
        currencies, species, lifeStages, stats, personalityTraits,
        breeds, loci, alleles, expressionRules, geneticPanels, conformationSections,
        items, careActions, healthConditions, treatments, healthCerts,
        trainingActions, intensityTiers, stageActivities, titles,
        disciplines, competitionTiers, venues, seasonCategories, records,
        vetServices, storeListings, gameShopBreedConfigs, groupPrestigeTiers,
      }
    }),
})