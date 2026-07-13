import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const locusAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { alleles: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      displayGroup: z.string().nullish(),
      biasTarget: z.enum(["FAVORABILITY", "RARITY", "NONE"]),
      minTestCycle: z.number().int().min(0).nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, displayGroup, minTestCycle, ...rest } = input
      const data = { ...rest, displayGroup: displayGroup ?? null, minTestCycle: minTestCycle ?? null }
      if (id) return db.locus.update({ where: { id }, data })
      return db.locus.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const rules = await tx.expressionRule.findMany({
          where: { locusId: input.id },
          select: { id: true },
        })
        const ruleIds = rules.map((r) => r.id)
        await tx.expressionClimateModifier.deleteMany({ where: { expressionRuleId: { in: ruleIds } } })
        await tx.expressionTerrainModifier.deleteMany({ where: { expressionRuleId: { in: ruleIds } } })
        await tx.expressionRule.deleteMany({ where: { locusId: input.id } })
        const alleles = await tx.allele.findMany({
          where: { locusId: input.id },
          select: { id: true },
        })
        const alleleIds = alleles.map((a) => a.id)
        await tx.geneAvailabilityState.deleteMany({ where: { alleleId: { in: alleleIds } } })
        await tx.allele.deleteMany({ where: { locusId: input.id } })
        return tx.locus.delete({ where: { id: input.id } })
      })
    ),

  listAlleles: publicProcedure
    .input(z.object({ locusId: z.string() }))
    .query(({ input }) =>
      db.allele.findMany({
        where: { locusId: input.locusId },
        orderBy: { symbol: "asc" },
        include: { availabilityState: true },
      })
    ),

  saveAllele: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      locusId: z.string(),
      symbol: z.string().min(1),
      isAvailable: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const { id, locusId, symbol, isAvailable } = input
      const allele = id
        ? await db.allele.update({ where: { id }, data: { symbol } })
        : await db.allele.create({ data: { locusId, symbol } })
      await db.geneAvailabilityState.upsert({
        where: { alleleId: allele.id },
        update: { isAvailable },
        create: { alleleId: allele.id, isAvailable },
      })
      return allele
    }),

  removeAllele: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.geneAvailabilityState.deleteMany({ where: { alleleId: input.id } })
        return tx.allele.delete({ where: { id: input.id } })
      })
    ),
})
