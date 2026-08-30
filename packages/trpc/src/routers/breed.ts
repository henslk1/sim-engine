import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { computeCoatFromCodes } from "@sim-engine/engine"

export const breedRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      return db.breed.findMany({
        where: { gameId: input.gameId, isUnregistered: false, isAvailable: true },
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
      const [breed, gameConfig, disciplineWeights, gameInnateMax] = await Promise.all([
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
              where: { frequency: { gt: 0 }, allele: { locus: { isHiddenModifier: false } } },
              include: {
                allele: {
                  include: {
                    locus: {
                      include: {
                        panelEntries: {
                          include: { panelDef: { select: { panelType: true } } },
                        },
                        sectionEntries: {
                          include: { section: { select: { id: true, name: true, displayOrder: true } } },
                          orderBy: { displayOrder: "asc" },
                        },
                      },
                    },
                    expressionRulesAsAlleleOne: {
                      include: { ruleConditions: { include: { healthConditionDef: { select: { id: true, name: true, isGenetic: true } } } } },
                    },
                    expressionRulesAsAlleleTwo: {
                      include: { ruleConditions: { include: { healthConditionDef: { select: { id: true, name: true, isGenetic: true } } } } },
                    },
                  },
                },
              },
            },
          },
        }),
        db.gameConfig.findUniqueOrThrow({
          where: { gameId: input.gameId },
          select: { cyclesPerYear: true, defaultInnateRatio: true },
        }),
        db.disciplineStatWeight.findMany({
          where: {
            disciplineDef: { gameId: input.gameId, isConformation: false },
          },
          include: { disciplineDef: { select: { id: true, name: true } } },
        }),
        db.gameInnateMax.findFirst({
          where: { gameId: input.gameId },
          select: { averageTotalInnate: true },
        }),
      ])

      // ── Allele pool per locus (shared by health + coat color logic) ───────────
      const allelePoolByLocus = new Map<string, Set<string>>()
      for (const af of breed.alleleFrequencies) {
        if (!allelePoolByLocus.has(af.allele.locusId)) allelePoolByLocus.set(af.allele.locusId, new Set())
        allelePoolByLocus.get(af.allele.locusId)!.add(af.allele.id)
      }

      // ── Health conditions ──────────────────────────────────────────────────
      // Only surface genetic conditions reachable from the breed's actual allele pool.
      const healthConditions = new Map<string, string>()
      for (const af of breed.alleleFrequencies) {
        const pool = allelePoolByLocus.get(af.allele.locusId)
        if (!pool) continue
        for (const rule of af.allele.expressionRulesAsAlleleOne) {
          if (!pool.has(rule.alleleTwoId)) continue
          for (const rc of rule.ruleConditions) {
            if (rc.healthConditionDef.isGenetic) healthConditions.set(rc.healthConditionDef.id, rc.healthConditionDef.name)
          }
        }
        for (const rule of af.allele.expressionRulesAsAlleleTwo) {
          if (!pool.has(rule.alleleOneId)) continue
          for (const rc of rule.ruleConditions) {
            if (rc.healthConditionDef.isGenetic) healthConditions.set(rc.healthConditionDef.id, rc.healthConditionDef.name)
          }
        }
      }

      // ── Possible coat colors ───────────────────────────────────────────────
      // For each COLOR-panel locus, enumerate all phenotype codes reachable from
      // breed alleles. Then compute the Cartesian product across loci and resolve
      // each combination to a coat color string.

      const colorLocusIds = new Set<string>()
      for (const af of breed.alleleFrequencies) {
        if (af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "COLOR")) {
          colorLocusIds.add(af.allele.locusId)
        }
      }

      // Build a lookup: `${alleleOneId}:${alleleTwoId}` → phenotype code
      // expressionRulesAsAlleleOne covers all canonical pairs
      const pairPhenotype = new Map<string, string>()
      for (const af of breed.alleleFrequencies) {
        if (!colorLocusIds.has(af.allele.locusId)) continue
        for (const rule of af.allele.expressionRulesAsAlleleOne) {
          if (rule.phenotype.length > 0) {
            pairPhenotype.set(`${af.allele.id}:${rule.alleleTwoId}`, rule.phenotype)
          }
        }
      }

      // Group alleles by color locus
      const colorAllelesByLocus = new Map<string, string[]>()
      for (const af of breed.alleleFrequencies) {
        if (!colorLocusIds.has(af.allele.locusId)) continue
        if (!colorAllelesByLocus.has(af.allele.locusId)) colorAllelesByLocus.set(af.allele.locusId, [])
        colorAllelesByLocus.get(af.allele.locusId)!.push(af.allele.id)
      }

      // For each locus, collect the distinct phenotype code options (null = no code)
      const perLocusOptions: (string | null)[][] = []
      for (const alleleIds of colorAllelesByLocus.values()) {
        const options = new Set<string | null>()
        for (const a of alleleIds) {
          for (const b of alleleIds) {
            const code = pairPhenotype.get(`${a}:${b}`) ?? pairPhenotype.get(`${b}:${a}`) ?? null
            options.add(code)
          }
        }
        // Only add loci that actually have at least one non-null option
        if ([...options].some(o => o !== null)) {
          perLocusOptions.push([...options])
        }
      }

      // Cartesian product across loci
      const combinations = perLocusOptions.reduce<(string | null)[][]>(
        (acc, opts) => acc.flatMap(combo => opts.map(opt => [...combo, opt])),
        [[]]
      )

      const coatColorSet = new Set<string>()
      for (const combo of combinations) {
        const codes = new Set(combo.filter((c): c is string => c !== null))
        const color = computeCoatFromCodes(codes)
        if (color) coatColorSet.add(color)
      }
      const coatColors = [...coatColorSet].sort()

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
        coatColors,
        healthConditions: [...healthConditions.values()].sort(),
        compatibleDisciplines,
        lifeExpectancyYears,
        defaultInnateRatio: gameConfig.defaultInnateRatio,
        averageTotalInnate: gameInnateMax?.averageTotalInnate ?? null,
      }
    }),
})
