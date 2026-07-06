import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const careAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.careActionDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { items: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      costType: z.enum(["FREE", "CURRENCY", "ITEM"]),
      currencyAmount: z.number().int().nullable(),
      careScoreGain: z.number(),
      energyRestore: z.number(),
      moodBoost: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.careActionDef.update({ where: { id }, data })
      return db.careActionDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.careActionItem.deleteMany({ where: { careActionDefId: input.id } })
        await tx.healthConditionBehavior.updateMany({
          where: { careActionDefId: input.id },
          data: { careActionDefId: null },
        })
        return tx.careActionDef.delete({ where: { id: input.id } })
      })
    ),

  listItems: publicProcedure
    .input(z.object({ careActionDefId: z.string() }))
    .query(({ input }) =>
      db.careActionItem.findMany({
        where: { careActionDefId: input.careActionDefId },
        include: { itemDef: { select: { id: true, name: true } } },
        orderBy: { itemDef: { name: "asc" } },
      })
    ),

  saveItem: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      careActionDefId: z.string(),
      itemDefId: z.string(),
      quantity: z.number().int().min(1),
    }))
    .mutation(({ input }) => {
      const { id, careActionDefId, ...data } = input
      if (id) return db.careActionItem.update({ where: { id }, data })
      return db.careActionItem.create({ data: { careActionDefId, ...data } })
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.careActionItem.delete({ where: { id: input.id } })),

  listLongTerm: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.longTermCareActionDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
      })
    ),

  saveLongTerm: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      intervalCycles: z.number().int().min(1),
      gracePeriodCycles: z.number().int().min(0),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.longTermCareActionDef.update({ where: { id }, data })
      return db.longTermCareActionDef.create({ data: { gameId, ...data } })
    }),

  removeLongTerm: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.longTermCareActionDef.delete({ where: { id: input.id } })),
})
