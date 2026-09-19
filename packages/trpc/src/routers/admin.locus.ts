import { router, publicProcedure } from "../trpc.js"
import { db, Prisma } from "@sim-engine/db"
import { z } from "zod"

export const locusAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { alleles: true, sectionEntries: true } },
          panelEntries: { include: { panelDef: { select: { id: true, name: true, panelType: true } } } },
        },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      biasTarget: z.enum(["FAVORABILITY", "RARITY", "NONE"]),
      minTestCycle: z.number().int().min(0).nullish(),
      description: z.unknown().nullish(),
      isHiddenModifier: z.boolean().optional(),
      inheritanceWeight: z.number().min(0).max(1).optional(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, minTestCycle, description, isHiddenModifier, inheritanceWeight, ...rest } = input
      const data = {
        ...rest,
        minTestCycle: minTestCycle ?? null,
        description: description != null ? (description as Prisma.InputJsonValue) : Prisma.DbNull,
        ...(isHiddenModifier !== undefined ? { isHiddenModifier } : {}),
        ...(inheritanceWeight !== undefined ? { inheritanceWeight } : {}),
      }
      if (id) return db.locus.update({ where: { id }, data })
      return db.locus.upsert({
        where: { gameId_name: { gameId, name: data.name } },
        create: { gameId, ...data },
        update: data,
      })
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

  saveAlleleBySymbol: publicProcedure
    .input(z.object({ locusId: z.string(), symbol: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { locusId, symbol } = input
      const allele = await db.allele.upsert({
        where: { locusId_symbol: { locusId, symbol } },
        create: { locusId, symbol },
        update: {},
      })
      await db.geneAvailabilityState.upsert({
        where: { alleleId: allele.id },
        update: {},
        create: { alleleId: allele.id, isAvailable: true },
      })
      return allele
    }),
})
