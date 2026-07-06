import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const expressionAdminRouter = router({
  listByLocus: publicProcedure
    .input(z.object({ locusId: z.string() }))
    .query(({ input }) =>
      db.expressionRule.findMany({
        where: { locusId: input.locusId },
        include: {
          alleleOne: { select: { id: true, symbol: true } },
          alleleTwo: { select: { id: true, symbol: true } },
          climateModifiers: true,
          terrainModifiers: true,
        },
        orderBy: [{ alleleOne: { symbol: "asc" } }, { alleleTwo: { symbol: "asc" } }],
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      locusId: z.string(),
      alleleOneId: z.string(),
      alleleTwoId: z.string(),
      phenotype: z.string().min(1),
      numericModifier: z.number().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, locusId, numericModifier, ...rest } = input
      const data = { ...rest, numericModifier: numericModifier ?? null }
      if (id) return db.expressionRule.update({ where: { id }, data })
      return db.expressionRule.create({ data: { locusId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.expressionClimateModifier.deleteMany({ where: { expressionRuleId: input.id } })
        await tx.expressionTerrainModifier.deleteMany({ where: { expressionRuleId: input.id } })
        return tx.expressionRule.delete({ where: { id: input.id } })
      })
    ),

  saveClimateModifier: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      expressionRuleId: z.string(),
      climate: z.enum(["HOT", "WARM", "COLD", "TEMPERATE"]),
      modifier: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, expressionRuleId, ...data } = input
      if (id) return db.expressionClimateModifier.update({ where: { id }, data })
      return db.expressionClimateModifier.create({ data: { expressionRuleId, ...data } })
    }),

  removeClimateModifier: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.expressionClimateModifier.delete({ where: { id: input.id } })),

  saveTerrainModifier: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      expressionRuleId: z.string(),
      terrain: z.enum(["FLAT", "COASTAL", "HILLY", "MOUNTAIN"]),
      modifier: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, expressionRuleId, ...data } = input
      if (id) return db.expressionTerrainModifier.update({ where: { id }, data })
      return db.expressionTerrainModifier.create({ data: { expressionRuleId, ...data } })
    }),

  removeTerrainModifier: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.expressionTerrainModifier.delete({ where: { id: input.id } })),
})
