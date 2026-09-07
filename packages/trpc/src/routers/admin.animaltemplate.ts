import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"
import { computePhenotypeDescription } from "@sim-engine/engine"

export const animalTemplateAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const templates = await db.animalTemplate.findMany({
        where: { gameId: input.gameId },
        include: {
          breed: { select: { id: true, name: true } },
          stats: { include: { statDef: { select: { id: true, name: true } } } },
          compTiers: { include: { discipline: { select: { id: true, name: true } } } },
          genotype: {
            include: {
              locus: {
                select: {
                  id: true,
                  name: true,
                  panelEntries: { select: { panelDef: { select: { panelType: true } } } },
                },
              },
              alleleOne: { select: { id: true, symbol: true } },
              alleleTwo: { select: { id: true, symbol: true } },
            },
          },
          personalityValues: { include: { traitDef: { select: { id: true, name: true } } } },
          baseTutorialTemplate: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      })

      const colorCombinations = templates.flatMap((t) =>
        t.genotype
          .filter((g) => g.locus.panelEntries.some((e) => e.panelDef.panelType === "COLOR"))
          .map((g) => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId }))
      )

      const expressionRules = colorCombinations.length > 0
        ? await db.expressionRule.findMany({
            where: { OR: colorCombinations },
            select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
          })
        : []

      return templates.map((t) => {
        const colorGts = t.genotype
          .filter((g) => g.locus.panelEntries.some((e) => e.panelDef.panelType === "COLOR"))
          .map((g) => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId }))
        return {
          ...t,
          predictedColor: colorGts.length > 0
            ? computePhenotypeDescription(colorGts, expressionRules)
            : null,
        }
      })
    }),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      sex: z.enum(["MALE", "FEMALE"]),
      name: z.string().nullish(),
      breedId: z.string().nullish(),
      breedName: z.string().nullish(),
      fertility: z.number().nullish(),
      startingAgeInCycles: z.number().int().nullish(),
      statMode: z.enum(["BREED_MAX", "FLOOR", "EXACT"]),
      statFloor: z.number().nullish(),
      personalityMode: z.enum(["RANDOM", "RANGE"]),
      personalityMin: z.number().nullish(),
      personalityMax: z.number().nullish(),
      alleleQualityBias: z.number().nullish(),
      lore: z.string().nullish(),
      isTutorialBase: z.boolean().default(false),
      baseTutorialTemplateId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...rest } = input
      const data = {
        ...rest,
        name: rest.name ?? null,
        breedId: rest.breedId ?? null,
        breedName: rest.breedName ?? null,
        fertility: rest.fertility ?? null,
        startingAgeInCycles: rest.startingAgeInCycles ?? null,
        statFloor: rest.statFloor ?? null,
        personalityMin: rest.personalityMin ?? null,
        personalityMax: rest.personalityMax ?? null,
        alleleQualityBias: rest.alleleQualityBias ?? null,
        lore: rest.lore ?? null,
        baseTutorialTemplateId: rest.baseTutorialTemplateId ?? null,
      }
      if (id) return db.animalTemplate.update({ where: { id }, data })
      return db.animalTemplate.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.animalTemplateStat.deleteMany({ where: { templateId: input.id } })
        await tx.animalTemplateCompTier.deleteMany({ where: { templateId: input.id } })
        await tx.animalTemplateGenotype.deleteMany({ where: { templateId: input.id } })
        await tx.animalTemplatePersonality.deleteMany({ where: { templateId: input.id } })
        return tx.animalTemplate.delete({ where: { id: input.id } })
      })
    ),

  saveStat: publicProcedure
    .input(z.object({
      templateId: z.string(),
      statDefId: z.string(),
      innateValue: z.number().nullish(),
      trainedValue: z.number().nullish(),
    }))
    .mutation(({ input }) =>
      db.animalTemplateStat.upsert({
        where: { templateId_statDefId: { templateId: input.templateId, statDefId: input.statDefId } },
        create: { templateId: input.templateId, statDefId: input.statDefId, innateValue: input.innateValue ?? null, trainedValue: input.trainedValue ?? null },
        update: { innateValue: input.innateValue ?? null, trainedValue: input.trainedValue ?? null },
      })
    ),

  removeStat: publicProcedure
    .input(z.object({ templateId: z.string(), statDefId: z.string() }))
    .mutation(({ input }) =>
      db.animalTemplateStat.delete({
        where: { templateId_statDefId: { templateId: input.templateId, statDefId: input.statDefId } },
      })
    ),

  saveCompTier: publicProcedure
    .input(z.object({
      templateId: z.string(),
      disciplineId: z.string(),
      tier: z.number().int().min(0),
    }))
    .mutation(({ input }) =>
      db.animalTemplateCompTier.upsert({
        where: { templateId_disciplineDefId: { templateId: input.templateId, disciplineDefId: input.disciplineId } },
        create: { templateId: input.templateId, disciplineDefId: input.disciplineId, tier: input.tier },
        update: { tier: input.tier },
      })
    ),

  removeCompTier: publicProcedure
    .input(z.object({ templateId: z.string(), disciplineId: z.string() }))
    .mutation(({ input }) =>
      db.animalTemplateCompTier.delete({
        where: { templateId_disciplineDefId: { templateId: input.templateId, disciplineDefId: input.disciplineId } },
      })
    ),

  saveGenotype: publicProcedure
    .input(z.object({
      templateId: z.string(),
      locusId: z.string(),
      alleleOneId: z.string(),
      alleleTwoId: z.string(),
      isTestedByOwner: z.boolean().default(false),
    }))
    .mutation(({ input }) =>
      db.animalTemplateGenotype.upsert({
        where: { templateId_locusId: { templateId: input.templateId, locusId: input.locusId } },
        create: input,
        update: { alleleOneId: input.alleleOneId, alleleTwoId: input.alleleTwoId, isTestedByOwner: input.isTestedByOwner },
      })
    ),

  removeGenotype: publicProcedure
    .input(z.object({ templateId: z.string(), locusId: z.string() }))
    .mutation(({ input }) =>
      db.animalTemplateGenotype.delete({
        where: { templateId_locusId: { templateId: input.templateId, locusId: input.locusId } },
      })
    ),

  savePersonality: publicProcedure
    .input(z.object({
      templateId: z.string(),
      traitDefId: z.string(),
      value: z.number(),
    }))
    .mutation(({ input }) =>
      db.animalTemplatePersonality.upsert({
        where: { templateId_traitDefId: { templateId: input.templateId, traitDefId: input.traitDefId } },
        create: input,
        update: { value: input.value },
      })
    ),

  removePersonality: publicProcedure
    .input(z.object({ templateId: z.string(), traitDefId: z.string() }))
    .mutation(({ input }) =>
      db.animalTemplatePersonality.delete({
        where: { templateId_traitDefId: { templateId: input.templateId, traitDefId: input.traitDefId } },
      })
    ),
})
