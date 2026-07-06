import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const tutorialStepAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.tutorialStepDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { stepIndex: "asc" },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      stepKey: z.string().min(1),
      name: z.string().min(1),
      description: z.string().nullish(),
      stepIndex: z.number().int().min(0),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, ...rest } = input
      const data = { ...rest, description: description ?? null }
      if (id) return db.tutorialStepDef.update({ where: { id }, data })
      return db.tutorialStepDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.tutorialProgress.deleteMany({ where: { stepDefId: input.id } })
        return tx.tutorialStepDef.delete({ where: { id: input.id } })
      })
    ),
})
