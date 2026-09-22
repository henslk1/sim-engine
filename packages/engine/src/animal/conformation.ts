import { db } from "@sim-engine/db"
import { computeCoatFromCodes } from "../breeding/computePhenotype.js"

type Client = typeof db

// Codes that are visibly present in artwork but do not surface in phenotypeDescription.
// Evaluated via raw phenotype code check rather than coat name matching.
const VISIBLE_SILENT_CODES = new Set([
  "splash_minimal", "splash_medium", "splash_extensive",
  "dominant_white_markings", "dominant_white_spotted", "dominant_white_irregular",
])

const BASE_COMBOS: Array<Set<string>> = [
  new Set(["chestnut_base"]),
  new Set(["bay_modifier"]),
  new Set(["black_base"]),
  new Set(["bay_modifier", "seal_brown"]),
]

// Returns the individual words that an expression visibly adds to coat names.
// Tested against each base combo — only the words that appear in the "with expression"
// name but not the "without" name are collected. Used for DQ word-level matching so
// selecting "tobiano_pattern" DQs any coat containing "Tobiano", "bay_modifier" DQs
// any coat containing "Bay", etc., while unexpressed genes never incorrectly fire.
function dqKeyTerms(expression: string): Set<string> {
  const terms = new Set<string>()
  for (const base of BASE_COMBOS) {
    const without = computeCoatFromCodes(new Set([...base]))
    const withExpr = computeCoatFromCodes(new Set([...base, expression]))
    if (!withExpr || withExpr === without) continue
    const withoutWords = new Set((without ?? "").split(" "))
    for (const word of withExpr.split(" ")) {
      if (!withoutWords.has(word)) terms.add(word)
    }
  }
  return terms
}

export async function runConformationInspection(client: Client, animalId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: {
        gameId: true,
        breedId: true,
        status: true,
        lifeStage: { select: { canCompete: true, name: true } },
        breedComposition: { select: { breedId: true } },
        conformationScores: { select: { id: true }, take: 1 },
        genotypes: { select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotypeCode: true } },
      phenotypeDescription: true,
      },
    })

    if (animal.status !== "ALIVE") throw new Error("Animal must be alive")
    if (animal.breedComposition.length !== 1) throw new Error("Conformation inspection is only available for purebred animals")
    if (animal.conformationScores.length > 0) throw new Error("Animal has already been inspected")
    if (!animal.lifeStage.canCompete) throw new Error(`Inspection is not available at the ${animal.lifeStage.name} stage`)

    const breedId = animal.breedId
    if (!breedId) throw new Error("Purebred animal has no breed assigned")

    const [sections, standards, breedCoat] = await Promise.all([
      tx.conformationSection.findMany({
        where: { gameId: animal.gameId },
        select: { id: true, entries: { select: { locusId: true } } },
      }),
      tx.breedConformationStandard.findMany({
        where: { breedId },
        select: { locusId: true, idealExpressionLabel: true, weight: true },
      }),
      tx.breed.findUnique({
        where: { id: breedId },
        select: {
          coatWeight: true,
          coatSelections: { select: { expression: true, colorRole: true } },
          coatDqSelections: { select: { expression: true } },
          dqTraits: { select: { locusId: true, expression: true } },
        },
      }),
    ])

    const standardsByLocus = new Map<string, { idealExpressionLabel: string; weight: number }[]>()
    for (const s of standards) {
      if (!standardsByLocus.has(s.locusId)) standardsByLocus.set(s.locusId, [])
      standardsByLocus.get(s.locusId)!.push(s)
    }

    const genotypeMap = new Map(animal.genotypes.map((g) => [g.locusId, g]))

    const locusIds = [...new Set(standards.map((s) => s.locusId))]
    const expressionRules = await tx.expressionRule.findMany({
      where: { locusId: { in: locusIds } },
      select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
    })

    const ruleMap = new Map<string, string>()
    for (const r of expressionRules) {
      ruleMap.set(`${r.locusId}:${r.alleleOneId}:${r.alleleTwoId}`, r.phenotype)
      ruleMap.set(`${r.locusId}:${r.alleleTwoId}:${r.alleleOneId}`, r.phenotype)
    }

    // Overall score: global sum across all standard loci; sections are breakdown display only
    let totalSumWeights = 0
    let totalSumMatched = 0
    for (const [locusId, expressions] of standardsByLocus) {
      const maxWeight = Math.max(...expressions.map((e) => e.weight))
      totalSumWeights += maxWeight
      const genotype = genotypeMap.get(locusId)
      if (!genotype) continue
      const phenotype = ruleMap.get(`${locusId}:${genotype.alleleOneId}:${genotype.alleleTwoId}`)
      const matched = expressions.find((e) => e.idealExpressionLabel === phenotype)
      totalSumMatched += matched?.weight ?? 0
    }
    const overallScore = totalSumWeights > 0 ? (totalSumMatched / totalSumWeights) * 100 : 0

    // Coat color DQ — two paths:
    // 1. Splash / DW variants: visible in artwork, absent from coat name → raw code check
    // 2. All other codes: coat name matching so unexpressed genes never incorrectly fire
    const animalPhenotypeCodes = new Set(
      animal.genotypes.map(g => g.phenotypeCode).filter((c): c is string => c !== null)
    )
    const dqSelections = breedCoat?.coatDqSelections ?? []
    const visibleSilentDqCodes = new Set(
      dqSelections.filter(s => VISIBLE_SILENT_CODES.has(s.expression)).map(s => s.expression)
    )
    const nameBasedDq = dqSelections.filter(s => !VISIBLE_SILENT_CODES.has(s.expression))
    const isCoatDq =
      (visibleSilentDqCodes.size > 0 && [...animalPhenotypeCodes].some(c => visibleSilentDqCodes.has(c))) ||
      (nameBasedDq.length > 0 && animal.phenotypeDescription != null && (() => {
        const descWords = new Set(animal.phenotypeDescription!.split(" "))
        return nameBasedDq.some(s => {
          const terms = dqKeyTerms(s.expression)
          return terms.size > 0 && [...terms].some(t => descWords.has(t))
        })
      })())

    // Trait-based DQ (BreedDqTrait — any non-coat genetic expression that disqualifies)
    let isTraitDq = false
    const dqTraits = breedCoat?.dqTraits ?? []
    if (dqTraits.length > 0) {
      const dqLocusIds = [...new Set(dqTraits.map(t => t.locusId))]
      const dqExpressionRules = await tx.expressionRule.findMany({
        where: { locusId: { in: dqLocusIds } },
        select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
      })
      const dqRuleMap = new Map<string, string>()
      for (const r of dqExpressionRules) {
        dqRuleMap.set(`${r.locusId}:${r.alleleOneId}:${r.alleleTwoId}`, r.phenotype)
        dqRuleMap.set(`${r.locusId}:${r.alleleTwoId}:${r.alleleOneId}`, r.phenotype)
      }
      for (const trait of dqTraits) {
        const genotype = genotypeMap.get(trait.locusId)
        if (!genotype) continue
        const phenotype = dqRuleMap.get(`${trait.locusId}:${genotype.alleleOneId}:${genotype.alleleTwoId}`)
        if (phenotype === trait.expression) { isTraitDq = true; break }
      }
    }

    // Coat color scoring
    if (breedCoat?.coatWeight != null && breedCoat.coatSelections.length > 0) {
      totalSumWeights += breedCoat.coatWeight
      if (animal.phenotypeDescription) {
        const byRole = new Map<string, string[]>()
        for (const sel of breedCoat.coatSelections) {
          if (!byRole.has(sel.colorRole)) byRole.set(sel.colorRole, [])
          byRole.get(sel.colorRole)!.push(sel.expression)
        }
        const groups = [...byRole.entries()].map(([role, codes]) =>
          role === "BASE" ? codes as (string | null)[] : [...codes, null] as (string | null)[]
        )
        const combinations = groups.reduce<(string | null)[][]>(
          (acc, opts) => acc.flatMap(combo => opts.map(opt => [...combo, opt])),
          [[]]
        )
        const acceptable = new Set<string>()
        for (const combo of combinations) {
          const codes = new Set(combo.filter((c): c is string => c !== null))
          if (codes.size === 0) continue
          const coat = computeCoatFromCodes(codes)
          if (coat) acceptable.add(coat)
        }
        // Splash / DW markings: if any are configured in the standard, all of the animal's
    // visible-silent codes must be in the accepted set. If none are configured, neutral — no check.
    const visibleSilentAccepted = new Set(
      breedCoat.coatSelections.filter(s => VISIBLE_SILENT_CODES.has(s.expression)).map(s => s.expression)
    )
    const animalVisibleSilent = [...animalPhenotypeCodes].filter(c => VISIBLE_SILENT_CODES.has(c))
    const passesMarkings = visibleSilentAccepted.size === 0 ||
      animalVisibleSilent.every(c => visibleSilentAccepted.has(c))
    if (acceptable.has(animal.phenotypeDescription) && passesMarkings) totalSumMatched += breedCoat.coatWeight
      }
    }

    const sectionScores: { sectionId: string; score: number }[] = []
    for (const section of sections) {
      let sumWeights = 0
      let sumMatched = 0
      for (const entry of section.entries) {
        const expressions = standardsByLocus.get(entry.locusId)
        if (!expressions?.length) continue
        const maxWeight = Math.max(...expressions.map((e) => e.weight))
        sumWeights += maxWeight
        const genotype = genotypeMap.get(entry.locusId)
        if (!genotype) continue
        const phenotype = ruleMap.get(`${entry.locusId}:${genotype.alleleOneId}:${genotype.alleleTwoId}`)
        const matched = expressions.find((e) => e.idealExpressionLabel === phenotype)
        sumMatched += matched?.weight ?? 0
      }
      if (sumWeights === 0) continue
      sectionScores.push({ sectionId: section.id, score: (sumMatched / sumWeights) * 100 })
    }

    await Promise.all([
      tx.animalConformationScore.create({ data: { animalId, breedId, score: overallScore, isCoatDq, isTraitDq } }),
      ...sectionScores.map((s) =>
        tx.animalConformationSectionScore.create({
          data: { animalId, breedId, sectionId: s.sectionId, score: s.score },
        })
      ),
    ])
  })
}
