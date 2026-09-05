import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { computeCoatFromCodes } from "@sim-engine/engine"

function* cartesianGen(arrays: (string | null)[][]): Generator<(string | null)[]> {
  const n = arrays.length
  if (n === 0) { yield []; return }
  const indices = new Array<number>(n).fill(0)
  while (true) {
    yield indices.map((idx, i) => arrays[i][idx])
    let pos = n - 1
    while (pos >= 0) {
      if (++indices[pos] < arrays[pos].length) break
      indices[pos--] = 0
    }
    if (pos < 0) break
  }
}

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
      const [breed, gameConfig, disciplineWeights, gameInnateMax, colorAlleleFreqs] = await Promise.all([
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
                    panelEntries: { include: { panelDef: { select: { panelType: true } } } },
                    sectionEntries: {
                      include: { section: { select: { id: true, name: true, displayOrder: true } } },
                    },
                  },
                },
              },
            },
            coatDqSelections: { select: { id: true, expression: true, colorRole: true } },
            coatSelections: { select: { expression: true, colorRole: true } },
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
        db.breedAlleleFrequency.findMany({
          where: {
            breedId: input.breedId,
            frequency: { gt: 0 },
            allele: {
              locus: { panelEntries: { some: { panelDef: { panelType: { in: ["COLOR", "VARIANCE"] } } } } },
            },
          },
          include: {
            allele: {
              include: {
                locus: { include: { panelEntries: { include: { panelDef: { select: { panelType: true } } } } } },
                expressionRulesAsAlleleOne: { select: { alleleTwoId: true, phenotype: true } },
              },
            },
          },
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

      // ── Possible coat colors ─────────────────────────────────────────────────
      // Build per-locus code options from the breed's allele pool, then enumerate
      // every modifier combination exhaustively. A supplemental single-modifier
      // pass guarantees every locus code appears in the display even if it falls
      // alphabetically between the first-20/last-20 sampling windows.

      const BASE_CODES = new Set(["chestnut_base", "bay_modifier", "black_base", "seal_brown"])
      const OVERRIDE_CODES = new Set(["dominant_white_full", "lethal_overo", "gray_modifier", "two_sabino"])

      const pairPhenotype = new Map<string, string>()
      for (const af of colorAlleleFreqs) {
        for (const rule of af.allele.expressionRulesAsAlleleOne) {
          if (rule.phenotype.length > 0) {
            pairPhenotype.set(`${af.allele.id}:${rule.alleleTwoId}`, rule.phenotype)
          }
        }
      }

      const allelesByLocus = new Map<string, string[]>()
      for (const af of colorAlleleFreqs) {
        if (!allelesByLocus.has(af.allele.locusId)) allelesByLocus.set(af.allele.locusId, [])
        allelesByLocus.get(af.allele.locusId)!.push(af.allele.id)
      }

      const overrideColors = new Set<string>()
      const baseLociOptions: (string | null)[][] = []
      const modifierLociOptions: (string | null)[][] = []
      // True when an override locus has no null genotype (N allele absent) —
      // meaning every animal in the breed expresses that override and the
      // underlying base/modifier colors are all masked and irrelevant to show.
      let alwaysOverridden = false

      for (const alleleIds of allelesByLocus.values()) {
        const possibleCodes = new Set<string | null>()
        for (const a of alleleIds) {
          for (const b of alleleIds) {
            possibleCodes.add(pairPhenotype.get(`${a}:${b}`) ?? pairPhenotype.get(`${b}:${a}`) ?? null)
          }
        }
        const nonNull = [...possibleCodes].filter((c): c is string => c !== null)
        if (nonNull.length === 0) continue

        for (const code of nonNull) {
          if (OVERRIDE_CODES.has(code)) {
            const c = computeCoatFromCodes(new Set([code]))
            if (c) overrideColors.add(c)
          }
        }

        const nonOverride = nonNull.filter(c => !OVERRIDE_CODES.has(c))
        if (nonOverride.length === 0) {
          // All non-null codes at this locus are overrides. If null is also
          // impossible (no wild-type allele in the pool), every animal carries
          // the override and underlying colors are irrelevant.
          if (!possibleCodes.has(null)) alwaysOverridden = true
          continue
        }

        // Only include null when the locus can genuinely produce it — if a breed
        // has only one allele at a locus (e.g. A=1.0 for agouti), every animal is
        // homozygous and null is not a real possibility. Including phantom null
        // would create phantom base colors (e.g. "black" when all animals are bay).
        const opts = possibleCodes.has(null) ? [null, ...nonOverride] : [...nonOverride]
        if (nonOverride.every(c => BASE_CODES.has(c))) {
          baseLociOptions.push(opts)
        } else {
          modifierLociOptions.push(opts)
        }
      }

      // Deduplicate base combos: chestnut_base overrides bay_modifier/seal_brown
      // so E×A produces multiple combos that resolve to the same base color.
      const seenBase = new Set<string>()
      const dedupedBaseCombos: (string | null)[][] = []
      for (const baseCombo of cartesianGen(baseLociOptions)) {
        const bc = new Set(baseCombo.filter((c): c is string => c !== null))
        const resolved = bc.has("chestnut_base") ? "chestnut"
          : (bc.has("bay_modifier") && bc.has("seal_brown")) ? "seal_brown"
          : bc.has("bay_modifier") ? "bay"
          : "black"
        if (!seenBase.has(resolved)) {
          seenBase.add(resolved)
          dedupedBaseCombos.push(baseCombo)
        }
      }

      const allFoundColors = new Set<string>()
      const sampledColors = new Set<string>()

      // When every animal in the breed carries an always-active override (e.g.
      // dominant white W13/W20 with N absent), the underlying base/modifier
      // enumeration is skipped — all those colors are visually masked anyway.
      if (!alwaysOverridden) {
      // 2M cap — unique color saturation occurs well before this limit for any
      // realistic breed; the remaining iterations beyond saturation are all
      // duplicates that don't affect the count or display.
      const MAX_ITERS = 2_000_000
      let iters = 0
      let capped = false

      // Each base gets an equal share of the ~100-chip display budget so no
      // single base crowds out the others when there are many combinations.
      const perBaseTarget = Math.max(10, Math.ceil(100 / Math.max(1, dedupedBaseCombos.length)))

      for (const baseCombo of dedupedBaseCombos) {
        if (capped) break
        const baseCodes = new Set(baseCombo.filter((c): c is string => c !== null))
        const uniqueForBase = new Set<string>()

        // Always include the plain base color (no modifier overlay).
        const plainBase = computeCoatFromCodes(baseCodes)
        if (plainBase) uniqueForBase.add(plainBase)

        for (const modCombo of cartesianGen(modifierLociOptions)) {
          if (iters++ >= MAX_ITERS) { capped = true; break }
          const codes = new Set([...baseCodes, ...modCombo.filter((c): c is string => c !== null)])
          const color = computeCoatFromCodes(codes)
          if (color) uniqueForBase.add(color)
        }

        // Single-modifier pass: add base+code for each non-null modifier code so
        // every locus effect is in uniqueForBase even if the main loop was capped.
        const singleModColors = new Set<string>()
        for (const modOpts of modifierLociOptions) {
          for (const code of modOpts) {
            if (code === null) continue
            const color = computeCoatFromCodes(new Set([...baseCodes, code]))
            if (color) {
              uniqueForBase.add(color)
              singleModColors.add(color)
            }
          }
        }

        for (const c of uniqueForBase) allFoundColors.add(c)
        const sorted = [...uniqueForBase].sort()
        for (const c of sorted.slice(0, perBaseTarget)) sampledColors.add(c)
        for (const c of sorted.slice(-perBaseTarget)) sampledColors.add(c)
        // Guarantee single-modifier colors are visible even if they fall between
        // the alphabetical sampling windows.
        for (const c of singleModColors) sampledColors.add(c)

        // Always surface the plain base color regardless of window position.
        if (plainBase) sampledColors.add(plainBase)
      }
      } // end if (!alwaysOverridden)

      const coatColors = [...overrideColors].sort()
        .concat([...sampledColors].sort())
        .filter(c => c.trim().length > 0)
      const coatColorOverflow = Math.max(0, allFoundColors.size - sampledColors.size)

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

      // Coat standard display: resolve expression codes to real coat names.
      // BASE uses each code alone. For other roles, uses an intersection approach:
      // each expression is tested against each accepted base to find words it visibly
      // adds; if those words are the same across all bases, that's the display label.
      // Expressions that need other genes to express (LP PATN codes need LP present)
      // are "silent" on their own — a second pass tries them paired with each active
      // expression so combinations like Leopard + PATN1 still surface.
      const stdBaseExprs = breed.coatSelections.filter(s => s.colorRole === "BASE").map(s => s.expression)
      const stdBases = stdBaseExprs.length > 0 ? stdBaseExprs : ["chestnut_base", "bay_modifier", "black_base"]
      const COAT_STD_ROLE_ORDER = ["BASE", "DILUTION", "MODIFIER", "WHITE_PATTERN"]

      function stdContribution(base: string, extraCodes: string[]): { added: Set<string>; withCoat: string } | null {
        const without = computeCoatFromCodes(new Set([base]))
        const withCoat = computeCoatFromCodes(new Set([base, ...extraCodes]))
        if (!withCoat || withCoat === without) return null
        const withoutWords = new Set((without ?? "").split(" "))
        const added = new Set(withCoat.split(" ").filter(w => !withoutWords.has(w)))
        return added.size > 0 ? { added, withCoat } : null
      }

      function stdIntersectionLabel(perBaseAdded: Set<string>[], perBaseCoat: string[]): string | null {
        if (perBaseAdded.length === 0) return null
        const common = perBaseAdded.reduce<Set<string>>((acc, s) => {
          const r = new Set<string>(); for (const w of acc) if (s.has(w)) r.add(w); return r
        })
        if (common.size === 0) return null
        return perBaseCoat[0].split(" ").filter(w => common.has(w)).join(" ")
      }

      function stdRemoveSupersets(names: string[]): string[] {
        const sorted = [...names].sort((a, b) => a.split(" ").length - b.split(" ").length || a.localeCompare(b))
        const kept: string[] = []
        for (const name of sorted) {
          const nw = new Set(name.split(" "))
          if (kept.some(k => [...new Set(k.split(" "))].every(w => nw.has(w)))) continue
          kept.push(name)
        }
        return kept
      }

      const coatStandardDisplay = (() => {
        const byRole = new Map<string, string[]>()
        for (const s of breed.coatSelections) {
          if (!byRole.has(s.colorRole)) byRole.set(s.colorRole, [])
          byRole.get(s.colorRole)!.push(s.expression)
        }
        const result: { role: string; names: string[] }[] = []
        for (const role of COAT_STD_ROLE_ORDER) {
          const exprs = byRole.get(role)
          if (!exprs?.length) continue

          if (role === "BASE") {
            // seal_brown only expresses on a bay background — supply the companion
            // so it resolves to "Seal Brown" rather than falling through to "Black".
            const BASE_COMPANIONS: Record<string, string[]> = { seal_brown: ["bay_modifier"] }
            const names = new Set<string>()
            for (const expr of exprs) {
              const companions = BASE_COMPANIONS[expr] ?? []
              const name = computeCoatFromCodes(new Set([expr, ...companions]))
              if (name) names.add(name)
            }
            if (names.size > 0) result.push({ role, names: [...names].sort() })
            continue
          }

          const allNames = new Set<string>()
          const silentExprs: string[] = []

          // First pass: each expression individually against each base
          for (const expr of exprs) {
            const perBaseAdded: Set<string>[] = []
            const perBaseCoat: string[] = []
            for (const base of stdBases) {
              const r = stdContribution(base, [expr])
              if (r) { perBaseAdded.push(r.added); perBaseCoat.push(r.withCoat) }
            }
            if (perBaseAdded.length === 0) { silentExprs.push(expr); continue }
            const label = stdIntersectionLabel(perBaseAdded, perBaseCoat)
            if (label) {
              allNames.add(label)
            } else {
              for (const n of stdRemoveSupersets(perBaseCoat)) allNames.add(n)
            }
          }

          // Second pass: silent expressions (need other genes to express) paired
          // with each active expression, so e.g. PATN1 + LP → Leopard/Few Spot
          const activeExprs = exprs.filter(e => !silentExprs.includes(e))
          for (const silent of silentExprs) {
            for (const active of activeExprs) {
              const perBaseAdded: Set<string>[] = []
              const perBaseCoat: string[] = []
              for (const base of stdBases) {
                const r = stdContribution(base, [silent, active])
                if (r) { perBaseAdded.push(r.added); perBaseCoat.push(r.withCoat) }
              }
              if (perBaseAdded.length === 0) continue
              const label = stdIntersectionLabel(perBaseAdded, perBaseCoat)
              if (label) {
                allNames.add(label)
              } else {
                for (const n of stdRemoveSupersets(perBaseCoat)) allNames.add(n)
              }
            }
          }

          // Final superset dedup across all collected names (e.g. removes "Near Leopard"
          // when "Leopard" is already present, "Near Few Spot" when "Few Spot" is present)
          const deduped = stdRemoveSupersets([...allNames])
          if (deduped.length > 0) result.push({ role, names: deduped.sort() })
        }
        return result
      })()

      return {
        breed,
        coatColors,
        coatColorOverflow,
        coatStandardDisplay,
        healthConditions: [...healthConditions.values()].sort(),
        compatibleDisciplines,
        lifeExpectancyYears,
        defaultInnateRatio: gameConfig.defaultInnateRatio,
        averageTotalInnate: gameInnateMax?.averageTotalInnate ?? null,
      }
    }),
})
