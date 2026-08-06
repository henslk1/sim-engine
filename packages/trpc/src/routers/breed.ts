import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"

export const breedRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      return db.breed.findMany({
        where: { gameId: input.gameId, isUnregistered: false },
        select: {
          id: true,
          name: true,
          image: true,
          categoryBadge: true,
          lore: true,
          createdAt: true,
          preferredClimate: true,
          preferredTerrain: true,
          species: { select: { name: true } },
          _count: { select: { animals: { where: { status: "ALIVE" } } } },
        },
        orderBy: { name: "asc" },
      })
    }),

  get: protectedProcedure
    .input(z.object({ gameId: z.string(), breedId: z.string() }))
    .query(async ({ input }) => {
      const [breed, gameConfig, disciplineWeights] = await Promise.all([
        db.breed.findUniqueOrThrow({
          where: { id: input.breedId },
          include: {
            species: { select: { name: true } },
            foundingPlayer: { select: { username: true } },
            statProfile: {
              include: { statDef: { select: { id: true, name: true } } },
              orderBy: { weight: "desc" },
            },
            personalityProfiles: {
              include: {
                traitDef: {
                  select: {
                    id: true,
                    name: true,
                    labelRanges: {
                      select: { label: true, minValue: true, maxValue: true },
                      orderBy: { minValue: "asc" },
                    },
                  },
                },
              },
            },
            conformationStandards: {
              include: {
                locus: {
                  include: {
                    sectionEntries: {
                      include: { section: { select: { id: true, name: true, displayOrder: true } } },
                      orderBy: { displayOrder: "asc" },
                    },
                  },
                },
              },
            },
            dqTraits: {
              include: {
                locus: {
                  include: {
                    sectionEntries: {
                      include: { section: { select: { id: true, name: true, displayOrder: true } } },
                    },
                  },
                },
              },
            },
            foundationAnimals: {
              include: {
                animal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    sex: true,
                    lifeStage: { select: { name: true } },
                    playerAccount: { select: { username: true } },
                  },
                },
              },
              orderBy: { registeredAt: "asc" },
              take: 12,
            },
            alleleFrequencies: {
              where: { frequency: { gt: 0 } },
              include: {
                allele: {
                  include: {
                    locus: {
                      include: {
                        panelEntries: {
                          include: { panelDef: { select: { panelType: true } } },
                        },
                      },
                    },
                    expressionRulesAsAlleleOne: {
                      include: { healthConditionDef: { select: { id: true, name: true } } },
                    },
                    expressionRulesAsAlleleTwo: {
                      include: { healthConditionDef: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        }),
        db.gameConfig.findUniqueOrThrow({
          where: { gameId: input.gameId },
          select: { cyclesPerYear: true },
        }),
        db.disciplineStatWeight.findMany({
          where: {
            disciplineDef: { gameId: input.gameId, isConformation: false },
          },
          include: { disciplineDef: { select: { id: true, name: true } } },
        }),
      ])

      const healthLocusIds = new Set<string>()
      for (const af of breed.alleleFrequencies) {
        if (af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "HEALTH")) {
          healthLocusIds.add(af.allele.locusId)
        }
      }

      const coatColors = new Set<string>()
      const healthConditions = new Map<string, string>()
      for (const af of breed.alleleFrequencies) {
        const rules = [
          ...af.allele.expressionRulesAsAlleleOne,
          ...af.allele.expressionRulesAsAlleleTwo,
        ]
        for (const rule of rules) {
          if (rule.healthConditionDef) {
            healthConditions.set(rule.healthConditionDef.id, rule.healthConditionDef.name)
          } else if (!healthLocusIds.has(af.allele.locusId)) {
            coatColors.add(rule.phenotype)
          }
        }
      }

      const breedWeightMap = new Map(breed.statProfile.map(s => [s.statDefId, s.weight]))
      const disciplineScores = new Map<string, { id: string; name: string; score: number }>()
      for (const dw of disciplineWeights) {
        const breedWeight = breedWeightMap.get(dw.statDefId) ?? 0
        const entry = disciplineScores.get(dw.disciplineDefId)
        if (entry) {
          entry.score += breedWeight * dw.weight
        } else {
          disciplineScores.set(dw.disciplineDefId, { id: dw.disciplineDefId, name: dw.disciplineDef.name, score: breedWeight * dw.weight })
        }
      }
      const compatibleDisciplines = [...disciplineScores.values()]
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      const lifeExpectancyYears = breed.lifeExpectancyBaseline != null
        ? Math.round(breed.lifeExpectancyBaseline / gameConfig.cyclesPerYear)
        : null

      return {
        breed,
        coatColors: [...coatColors].sort(),
        healthConditions: [...healthConditions.values()].sort(),
        compatibleDisciplines,
        lifeExpectancyYears,
      }
    }),
})
