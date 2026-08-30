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
        orderBy: [{ phenotype: "asc" }, { alleleOne: { symbol: "asc" } }, { alleleTwo: { symbol: "asc" } }],
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
        await tx.expressionRuleCondition.deleteMany({ where: { expressionRuleId: input.id } })
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

  listByCondition: publicProcedure
    .input(z.object({ conditionDefId: z.string() }))
    .query(({ input }) =>
      db.expressionRuleCondition.findMany({
        where: { healthConditionDefId: input.conditionDefId },
        include: {
          expressionRule: {
            include: {
              locus: { select: { id: true, name: true } },
              alleleOne: { select: { id: true, symbol: true } },
              alleleTwo: { select: { id: true, symbol: true } },
            },
          },
        },
        orderBy: [
          { expressionRule: { locus: { name: "asc" } } },
          { expressionRule: { alleleOne: { symbol: "asc" } } },
        ],
      })
    ),

  listAvailableForCondition: publicProcedure
    .input(z.object({ gameId: z.string(), conditionDefId: z.string() }))
    .query(({ input }) =>
      db.expressionRule.findMany({
        where: {
          locus: { gameId: input.gameId },
          ruleConditions: { none: { healthConditionDefId: input.conditionDefId } },
        },
        include: {
          locus: { select: { id: true, name: true } },
          alleleOne: { select: { id: true, symbol: true } },
          alleleTwo: { select: { id: true, symbol: true } },
        },
        orderBy: [{ locus: { name: "asc" } }, { alleleOne: { symbol: "asc" } }],
      })
    ),

  addConditionLink: publicProcedure
    .input(z.object({
      expressionRuleId: z.string(),
      healthConditionDefId: z.string(),
      penetrance: z.number().min(0).max(1).nullish(),
      environmentalRiskModifier: z.number().min(0).default(0),
    }))
    .mutation(({ input }) =>
      db.expressionRuleCondition.upsert({
        where: {
          expressionRuleId_healthConditionDefId: {
            expressionRuleId: input.expressionRuleId,
            healthConditionDefId: input.healthConditionDefId,
          },
        },
        create: {
          expressionRuleId: input.expressionRuleId,
          healthConditionDefId: input.healthConditionDefId,
          penetrance: input.penetrance ?? null,
          environmentalRiskModifier: input.environmentalRiskModifier,
        },
        update: {},
      })
    ),

  removeConditionLink: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.expressionRuleCondition.delete({ where: { id: input.id } })),

  updateConditionLink: publicProcedure
    .input(z.object({
      id: z.string(),
      penetrance: z.number().min(0).max(1).nullish(),
      environmentalRiskModifier: z.number().min(0),
    }))
    .mutation(({ input }) =>
      db.expressionRuleCondition.update({
        where: { id: input.id },
        data: {
          penetrance: input.penetrance ?? null,
          environmentalRiskModifier: input.environmentalRiskModifier,
        },
      })
    ),

  listConditionLinksByLocus: publicProcedure
    .input(z.object({ locusId: z.string() }))
    .query(({ input }) =>
      db.expressionRuleCondition.findMany({
        where: { expressionRule: { locusId: input.locusId } },
        include: {
          expressionRule: { select: { phenotype: true } },
          healthConditionDef: { select: { id: true, name: true, conditionType: true } },
        },
        orderBy: [
          { expressionRule: { phenotype: "asc" } },
          { healthConditionDef: { name: "asc" } },
        ],
      })
    ),

  addConditionLinkByPhenotype: publicProcedure
    .input(z.object({
      locusId: z.string(),
      phenotype: z.string().min(1),
      healthConditionDefId: z.string(),
      penetrance: z.number().min(0).max(1).nullish(),
      environmentalRiskModifier: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const { locusId, phenotype, healthConditionDefId, penetrance, environmentalRiskModifier } = input
      const rules = await db.expressionRule.findMany({
        where: { locusId, phenotype },
        select: { id: true },
      })
      await db.$transaction(
        rules.map(rule =>
          db.expressionRuleCondition.upsert({
            where: {
              expressionRuleId_healthConditionDefId: {
                expressionRuleId: rule.id,
                healthConditionDefId,
              },
            },
            create: { expressionRuleId: rule.id, healthConditionDefId, penetrance: penetrance ?? null, environmentalRiskModifier },
            update: { penetrance: penetrance ?? null, environmentalRiskModifier },
          })
        )
      )
      return { count: rules.length }
    }),

  removeConditionLinkByPhenotype: publicProcedure
    .input(z.object({
      locusId: z.string(),
      phenotype: z.string(),
      healthConditionDefId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.expressionRuleCondition.deleteMany({
        where: {
          healthConditionDefId: input.healthConditionDefId,
          expressionRule: { locusId: input.locusId, phenotype: input.phenotype },
        },
      })
      return { count: result.count }
    }),
})
