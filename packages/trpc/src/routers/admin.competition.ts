import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { checkCompetitions } from "@sim-engine/engine"
import { z } from "zod"

export const competitionAdminRouter = router({
  check: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(({ input }) => checkCompetitions(db, input.gameId)),
})
