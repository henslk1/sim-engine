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
        include: {
          venue: { select: { id: true, name: true } },
          competitionDiscipline: { select: { id: true, name: true } },
          triggerCondition: { select: { id: true, name: true } },
        },
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
      competitionDisciplineId: z.string().nullish(),
      competitionNpcCount: z.number().int().min(0).nullish(),
      triggerConditionDefId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, competitionDisciplineId, competitionNpcCount, triggerConditionDefId, ...rest } = input
      const data = {
        ...rest,
        description: description ?? null,
        competitionDisciplineId: competitionDisciplineId ?? null,
        competitionNpcCount: competitionNpcCount ?? null,
        triggerConditionDefId: triggerConditionDefId ?? null,
      }
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
