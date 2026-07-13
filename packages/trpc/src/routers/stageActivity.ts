import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { applyStageActivity } from "@sim-engine/engine"
import { db } from "@sim-engine/db"

export const stageActivityRouter = router({
  perform: publicProcedure
    .input(z.object({ animalId: z.string(), stageActivityDefId: z.string() }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { ageInCycles: true },
      })
      return applyStageActivity(db, {
        animalId: input.animalId,
        stageActivityDefId: input.stageActivityDefId,
        performedByPlayerId: null,
        cycleNumber: animal.ageInCycles,
      })
    }),
})
