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
          grantCurrency: { select: { id: true, name: true } },
          grants: {
            select: { id: true, quantity: true, itemDef: { select: { id: true, name: true } } },
            orderBy: { itemDef: { name: "asc" } },
          },
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
      venueId: z.string().nullish(),
      grantCurrencyDefId: z.string().nullish(),
      grantCurrencyAmount: z.number().int().min(1).nullish(),
      completionCondition: z.enum(["TRAINING_CAPPED", "COMPETITION_TIER", "PREGNANCY_COMPLETE", "LIFE_STAGE"]).nullish(),
      completionTarget: z.number().int().min(0).nullish(),
    }))
    .mutation(({ input }) => {
      const {
        id, gameId,
        description, competitionDisciplineId, competitionNpcCount,
        triggerConditionDefId, venueId, grantCurrencyDefId, grantCurrencyAmount,
        completionCondition, completionTarget,
        ...rest
      } = input
      const data = {
        ...rest,
        description: description ?? null,
        competitionDisciplineId: competitionDisciplineId ?? null,
        competitionNpcCount: competitionNpcCount ?? null,
        triggerConditionDefId: triggerConditionDefId ?? null,
        venueId: venueId ?? null,
        grantCurrencyDefId: grantCurrencyDefId ?? null,
        grantCurrencyAmount: grantCurrencyAmount ?? null,
        completionCondition: completionCondition ?? null,
        completionTarget: completionTarget ?? null,
      }
      if (id) return db.tutorialStepDef.update({ where: { id }, data })
      return db.tutorialStepDef.create({ data: { gameId, ...data } })
    }),

  addStepGrant: publicProcedure
    .input(z.object({
      stepDefId: z.string(),
      itemDefId: z.string(),
      quantity: z.number().int().min(1),
    }))
    .mutation(({ input }) =>
      db.tutorialStepGrant.upsert({
        where: { stepDefId_itemDefId: { stepDefId: input.stepDefId, itemDefId: input.itemDefId } },
        create: input,
        update: { quantity: input.quantity },
      })
    ),

  removeStepGrant: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.tutorialStepGrant.delete({ where: { id: input.id } })),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.tutorialStepGrant.deleteMany({ where: { stepDefId: input.id } })
        await tx.tutorialProgress.deleteMany({ where: { stepDefId: input.id } })
        return tx.tutorialStepDef.delete({ where: { id: input.id } })
      })
    ),
})
