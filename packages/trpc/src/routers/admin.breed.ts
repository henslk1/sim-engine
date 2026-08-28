import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const breedAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.breed.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { species: { select: { id: true, name: true } } },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      speciesId: z.string(),
      categoryBadge: z.enum(["BASE", "SECONDARY", "CUSTOM"]),
      image: z.string().nullish(),
      lore: z.string().nullish(),
      isUnregistered: z.boolean(),
      isAvailable: z.boolean(),
      convergenceGenerations: z.number().int().min(1).nullish(),
      lifeExpectancyBaseline: z.number().int().nullish(),
      immunityMin: z.number().nullish(),
      immunityMax: z.number().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, image, lore, convergenceGenerations, lifeExpectancyBaseline, immunityMin, immunityMax, ...rest } = input
      const data = {
        ...rest,
        image: image ?? null,
        lore: lore ?? null,
        convergenceGenerations: convergenceGenerations ?? null,
        lifeExpectancyBaseline: lifeExpectancyBaseline ?? null,
        immunityMin: immunityMin ?? null,
        immunityMax: immunityMax ?? null,
      }
      if (id) return db.breed.update({ where: { id }, data })
      return db.breed.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.breedAlleleFrequency.deleteMany({ where: { breedId: input.id } })
        await tx.breedPersonalityProfile.deleteMany({ where: { breedId: input.id } })
        await tx.breedStatProfile.deleteMany({ where: { breedId: input.id } })
        await tx.breedConformationStandard.deleteMany({ where: { breedId: input.id } })
        await tx.breedDqTrait.deleteMany({ where: { breedId: input.id } })
        await tx.breedCoatSelection.deleteMany({ where: { breedId: input.id } })
        return tx.breed.delete({ where: { id: input.id } })
      })
    ),

  listStatProfiles: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedStatProfile.findMany({
        where: { breedId: input.breedId },
        include: { statDef: { select: { id: true, name: true } } },
        orderBy: { statDef: { name: "asc" } },
      })
    ),
  saveStatProfile: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      statDefId: z.string(),
      weight: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedStatProfile.update({ where: { id }, data })
      return db.breedStatProfile.create({ data: { breedId, ...data } })
    }),
  removeStatProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedStatProfile.delete({ where: { id: input.id } })),

  saveAllStatProfiles: publicProcedure
    .input(z.object({
      breedId: z.string(),
      profiles: z.array(z.object({
        statDefId: z.string(),
        weight: z.number(),
      }))
    }))
    .mutation(({ input }) =>
      db.$transaction(async tx => {
        await tx.breedStatProfile.deleteMany({ where: { breedId: input.breedId } })
        await tx.breedStatProfile.createMany({
          data: input.profiles.map(p => ({ breedId: input.breedId, ...p }))
        })
      })
    ),

  listConformationStandards: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedConformationStandard.findMany({
        where: { breedId: input.breedId },
        include: { locus: { select: { id: true, name: true } } },
      })
    ),
  saveConformationStandard: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      locusId: z.string(),
      idealExpressionLabel: z.string().min(1),
      weight: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedConformationStandard.update({ where: { id }, data })
      return db.breedConformationStandard.create({ data: { breedId, ...data } })
    }),
  removeConformationStandard: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedConformationStandard.delete({ where: { id: input.id } })),

  listDqTraits: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedDqTrait.findMany({
        where: { breedId: input.breedId },
        include: { locus: { select: { id: true, name: true } } },
      })
    ),
  saveDqTrait: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      locusId: z.string(),
      expression: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedDqTrait.update({ where: { id }, data })
      return db.breedDqTrait.create({ data: { breedId, ...data } })
    }),
  removeDqTrait: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedDqTrait.delete({ where: { id: input.id } })),

  listCoatSelections: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedCoatSelection.findMany({ where: { breedId: input.breedId } })
    ),
  saveCoatSelection: publicProcedure
    .input(z.object({ breedId: z.string(), expression: z.string().min(1), colorRole: z.string().min(1) }))
    .mutation(({ input }) =>
      db.breedCoatSelection.upsert({
        where: { breedId_expression: { breedId: input.breedId, expression: input.expression } },
        create: input,
        update: { colorRole: input.colorRole },
      })
    ),
  removeCoatSelection: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedCoatSelection.delete({ where: { id: input.id } })),
  saveCoatWeight: publicProcedure
    .input(z.object({ breedId: z.string(), coatWeight: z.number().nullable() }))
    .mutation(({ input }) =>
      db.breed.update({ where: { id: input.breedId }, data: { coatWeight: input.coatWeight } })
    ),

  listPersonalityProfiles: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedPersonalityProfile.findMany({
        where: { breedId: input.breedId },
        include: { traitDef: { select: { id: true, name: true } } },
        orderBy: { traitDef: { name: "asc" } },
      })
    ),
  savePersonalityProfile: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      traitDefId: z.string(),
      naturalMin: z.number(),
      naturalMax: z.number(),
      baseline: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedPersonalityProfile.update({ where: { id }, data })
      return db.breedPersonalityProfile.create({ data: { breedId, ...data } })
    }),
  removePersonalityProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedPersonalityProfile.delete({ where: { id: input.id } })),

  saveAllPersonalityProfiles: publicProcedure
    .input(z.object({
      breedId: z.string(),
      profiles: z.array(z.object({
        traitDefId: z.string(),
        naturalMin: z.number(),
        naturalMax: z.number(),
        baseline: z.number(),
      }))
    }))
    .mutation(({ input }) =>
      db.$transaction(async tx => {
        await tx.breedPersonalityProfile.deleteMany({ where: { breedId: input.breedId } })
        await tx.breedPersonalityProfile.createMany({
          data: input.profiles.map(p => ({ breedId: input.breedId, ...p }))
        })
      })
    ),

  listLoci: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    ),

  listAlleles: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.allele.findMany({
        where: { locus: { gameId: input.gameId } },
        orderBy: [{ locus: { name: "asc" } }, { symbol: "asc" }],
        select: {
          id: true,
          symbol: true,
          locus: {
            select: {
              id: true,
              name: true,
              panelEntries: { select: { panelDef: { select: { panelType: true } } } },
            },
          },
        },
      })
    ),

  listAlleleFrequencies: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedAlleleFrequency.findMany({
        where: { breedId: input.breedId },
        orderBy: { allele: { symbol: "asc" } },
        include: {
          allele: {
            select: {
              id: true,
              locusId: true,
              symbol: true,
              locus: {
                select: {
                  id: true,
                  name: true,
                  panelEntries: { select: { panelDef: { select: { panelType: true, colorRole: true } } } },
                  sectionEntries: {
                    select: { section: { select: { id: true, name: true, displayOrder: true } } },
                    orderBy: { displayOrder: "asc" },
                  },
                },
              },
              expressionRulesAsAlleleOne: { select: { alleleTwoId: true, phenotype: true } },
              expressionRulesAsAlleleTwo: { select: { alleleOneId: true, phenotype: true } },
            },
          },
        },
      })
    ),

  saveAlleleFrequency: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      alleleId: z.string(),
      frequency: z.number().min(0).max(1),
      isDq: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, breedId, alleleId, frequency, isDq } = input
      if (id) return db.breedAlleleFrequency.update({ where: { id }, data: { frequency, isDq } })
      return db.breedAlleleFrequency.create({ data: { breedId, alleleId, frequency, isDq } })
    }),

  removeAlleleFrequency: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedAlleleFrequency.delete({ where: { id: input.id } })),

  saveAllAlleleFrequencies: publicProcedure
    .input(z.object({
      breedId: z.string(),
      frequencies: z.array(z.object({
        alleleId: z.string(),
        frequency: z.number().min(0).max(1),
        isDq: z.boolean(),
      }))
    }))
    .mutation(({ input }) =>
      db.$transaction(async tx => {
        await tx.breedAlleleFrequency.deleteMany({ where: { breedId: input.breedId } })
        await tx.breedAlleleFrequency.createMany({
          data: input.frequencies.map(f => ({ breedId: input.breedId, ...f }))
        })
      })
    ),
})
