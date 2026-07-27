import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"

export const tutorialRouter = router({
  getProgress: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const steps = await db.tutorialStepDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { stepIndex: "asc" },
        select: { id: true, stepKey: true, name: true, description: true, stepIndex: true },
      })
      if (!player) return { steps, progress: [] }
      const progress = await db.tutorialProgress.findMany({
        where: { playerAccountId: player.id },
        select: { stepDefId: true, completedAt: true },
      })
      return { steps, progress }
    })
})