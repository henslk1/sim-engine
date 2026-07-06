import { applyTrainingAction } from "@sim-engine/engine";
import { db } from "@sim-engine/db";
import { router, publicProcedure } from "../trpc.js";
import { z } from "zod";

export const animalTrainingRouter = router({
  perform: publicProcedure
    .input(z.object({
      animalId: z.string(),
      trainingActionDefId: z.string(),
      intensityTierDefId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { ageInCycles: true },
      })

      return applyTrainingAction(db, {
        animalId: input.animalId,
        trainingActionDefId: input.trainingActionDefId,
        intensityTierDefId: input.intensityTierDefId,
        performedByPlayerId: null,
        cycleNumber: animal.ageInCycles,
      })
    }),
})
