import { router, publicProcedure } from "../trpc.js";
import { db } from "@sim-engine/db";
import { z } from "zod";

export const gameAdminRouter = router({
  get: publicProcedure.query(() => 
    db.game.findFirst({ include: { gameConfig: true } })
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
})