import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const healthAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.healthConditionDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { behaviors: true, treatments: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      conditionType: z.enum(["ILLNESS", "INJURY"]),
      isGenetic: z.boolean(),
      isFatal: z.boolean(),
      moodEffect: z.number().nullish(),
      energyEffect: z.number().nullish(),
      onsetMinCycle: z.number().int().nullish(),
      fatalityChance: z.number().min(0).max(1).nullish(),
      fatalMaxCycle: z.number().int().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, moodEffect, energyEffect, onsetMinCycle, fatalityChance, fatalMaxCycle, ...rest } = input
      const data = {
        ...rest,
        moodEffect: moodEffect ?? null,
        energyEffect: energyEffect ?? null,
        onsetMinCycle: onsetMinCycle ?? null,
        fatalityChance: fatalityChance ?? null,
        fatalMaxCycle: fatalMaxCycle ?? null,
      }
      if (id) return db.healthConditionDef.update({ where: { id }, data })
      return db.healthConditionDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const treatments = await tx.treatmentDef.findMany({
          where: { conditionDefId: input.id },
          select: { id: true },
        })
        await tx.treatmentItem.deleteMany({
          where: { treatmentDefId: { in: treatments.map((t) => t.id) } },
        })
        await tx.treatmentDef.deleteMany({ where: { conditionDefId: input.id } })
        await tx.healthConditionBehavior.deleteMany({ where: { conditionDefId: input.id } })
        return tx.healthConditionDef.delete({ where: { id: input.id } })
      })
    ),

  listBehaviors: publicProcedure
    .input(z.object({ conditionDefId: z.string() }))
    .query(({ input }) =>
      db.healthConditionBehavior.findMany({
        where: { conditionDefId: input.conditionDefId },
        include: { careActionDef: { select: { id: true, name: true } } },
        orderBy: { symptomText: "asc" },
      })
    ),

  saveBehavior: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      conditionDefId: z.string(),
      symptomText: z.string().min(1),
      careActionDefId: z.string().nullable(),
    }))
    .mutation(({ input }) => {
      const { id, conditionDefId, ...data } = input
      if (id) return db.healthConditionBehavior.update({ where: { id }, data })
      return db.healthConditionBehavior.create({ data: { conditionDefId, ...data } })
    }),

  removeBehavior: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.healthConditionBehavior.delete({ where: { id: input.id } })),
})
