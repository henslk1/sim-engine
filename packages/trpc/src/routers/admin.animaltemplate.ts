import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"
import { computeCoatFromCodes } from "@sim-engine/engine"

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
          baseTutorialTemplate: {
            select: {
              id: true,
              name: true,
              genotype: {
                select: {
                  locusId: true,
                  alleleOneId: true,
                  alleleTwoId: true,
                  locus: {
                    select: {
                      panelEntries: { select: { panelDef: { select: { panelType: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      })

      const PHENOTYPE_PANELS = ["COLOR", "VARIANCE"] as const

      const [phenotypeLoci, phenotypeRules] = await Promise.all([
        db.geneticPanelLocus.findMany({
          where: { panelDef: { gameId: input.gameId, panelType: { in: [...PHENOTYPE_PANELS] } } },
          select: { locusId: true },
        }),
        db.expressionRule.findMany({
          where: {
            locus: { panelEntries: { some: { panelDef: { gameId: input.gameId, panelType: { in: [...PHENOTYPE_PANELS] } } } } },
            phenotype: { not: "" },
          },
          select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
        }),
      ])

      const allPhenotypeLocusIds = new Set(phenotypeLoci.map((l) => l.locusId))

      // All non-empty phenotype codes each COLOR/VARIANCE locus can ever produce
      const codesByLocus = new Map<string, Set<string>>()
      for (const rule of phenotypeRules) {
        if (!codesByLocus.has(rule.locusId)) codesByLocus.set(rule.locusId, new Set())
        codesByLocus.get(rule.locusId)!.add(rule.phenotype)
      }

      const isPhenoLocus = (g: { locus: { panelEntries: { panelDef: { panelType: string } }[] } }) =>
        g.locus.panelEntries.some((e) => (PHENOTYPE_PANELS as readonly string[]).includes(e.panelDef.panelType))

      return templates.map((t) => {
        // Merge base template genotypes with per-starter overrides (per-starter wins on same locusId)
        const ownGts = t.genotype.filter(isPhenoLocus)
        const ownLocusIds = new Set(ownGts.map((g) => g.locusId))
        const baseGts = (t.baseTutorialTemplate?.genotype ?? [])
          .filter(isPhenoLocus)
          .filter((g) => !ownLocusIds.has(g.locusId))

        const colorGts = [...baseGts, ...ownGts].map((g) => ({
          locusId: g.locusId,
          alleleOneId: g.alleleOneId,
          alleleTwoId: g.alleleTwoId,
        }))

        if (colorGts.length === 0) return { ...t, predictedColor: null }

        // Collect codes from this template's configured genotypes
        const configuredCodes = new Set<string>()
        for (const gt of colorGts) {
          const rule = phenotypeRules.find(
            (r) =>
              r.locusId === gt.locusId &&
              ((r.alleleOneId === gt.alleleOneId && r.alleleTwoId === gt.alleleTwoId) ||
                (r.alleleOneId === gt.alleleTwoId && r.alleleTwoId === gt.alleleOneId))
          )
          if (rule) configuredCodes.add(rule.phenotype)
        }

        const basePhenotype = computeCoatFromCodes(configuredCodes)

        // For each unconfigured COLOR/VARIANCE locus, test if any code it could produce changes the result
        const configuredLocusIds = new Set(colorGts.map((g) => g.locusId))
        for (const locusId of allPhenotypeLocusIds) {
          if (configuredLocusIds.has(locusId)) continue
          const possibleCodes = codesByLocus.get(locusId)
          if (!possibleCodes) continue
          for (const code of possibleCodes) {
            const testCodes = new Set(configuredCodes)
            testCodes.add(code)
            if (computeCoatFromCodes(testCodes) !== basePhenotype) {
              return { ...t, predictedColor: null }
            }
          }
        }

        return { ...t, predictedColor: basePhenotype }
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
