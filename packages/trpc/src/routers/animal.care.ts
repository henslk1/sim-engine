import { applyCareAction } from "@sim-engine/engine"
import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalCareRouter = router({
  perform: publicProcedure
    .input(z.object({
      animalId: z.string(),
      careActionDefId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { ageInCycles: true },
      })

      return applyCareAction(db, {
        animalId: input.animalId,
        careActionDefId: input.careActionDefId,
        performedByPlayerId: null,
        cycleNumber: animal.ageInCycles,
      })
    }),
})