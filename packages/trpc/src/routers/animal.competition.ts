import { enterCompetition, runCompetition } from "@sim-engine/engine";
import { db } from "@sim-engine/db";
import { router, publicProcedure } from "../trpc.js";
import { z } from "zod";

export const animalCompetitionRouter = router({
  enter: publicProcedure
    .input(z.object({
      animalId: z.string(),
      competitionId: z.string(),
      playerAccountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { entry, shouldRun } = await enterCompetition(db, input)
      if (shouldRun) {
        await runCompetition(db, { competitionId: input.competitionId })
      }
      return entry
    }),
  run: publicProcedure
    .input(z.object({
      competitionId: z.string(),
    }))
    .mutation(({ input }) => runCompetition(db, input)),
})