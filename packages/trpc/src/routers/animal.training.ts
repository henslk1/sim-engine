import { applyTrainingActionTx } from "@sim-engine/engine";
import { enterGameplayForAnimal } from "../maintenance.js";
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
    .mutation(async ({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { ageInCycles: true },
        })

        return applyTrainingActionTx(tx, {
          animalId: input.animalId,
          trainingActionDefId: input.trainingActionDefId,
          intensityTierDefId: input.intensityTierDefId,
          performedByPlayerId: null,
          cycleNumber: animal.ageInCycles,
        })
      })
    ),
})
