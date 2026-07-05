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
        containerLabel: z.string().nullish(),
        subContainerLabel: z.string().nullish(),
      }))
      .mutation(({ input }) => {
        const { gameId, containerLabel, subContainerLabel, ...rest } = input
        const labels = {
          containerLabel: containerLabel ?? null,
          subContainerLabel: subContainerLabel ?? null,
        }
        return db.gameConfig.upsert({
          where: { gameId },
          create: { gameId, ...rest, ...labels },
          update: { ...rest, ...labels },
        })
      }),
})