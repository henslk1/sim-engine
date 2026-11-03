import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { applyStageActivityTx } from "@sim-engine/engine"
import { enterGameplayForAnimal } from "../maintenance.js"
import { db } from "@sim-engine/db"

export const stageActivityRouter = router({
  perform: publicProcedure
    .input(z.object({ animalId: z.string(), stageActivityDefId: z.string() }))
    .mutation(async ({ input }) =>
      db.$transaction(async (tx) => {
        await enterGameplayForAnimal(tx, input.animalId)
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { ageInCycles: true },
        })
        return applyStageActivityTx(tx, {
          animalId: input.animalId,
          stageActivityDefId: input.stageActivityDefId,
          performedByPlayerId: null,
          cycleNumber: animal.ageInCycles,
        })
      })
    ),
})
