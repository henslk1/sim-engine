import { db } from "@sim-engine/db"
import { computeCoatFromCodes } from "../breeding/computePhenotype.js"

type Client = typeof db

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
        genotypes: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
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
        select: { coatWeight: true, coatSelections: { select: { expression: true, colorRole: true } } },
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

    // Coat color scoring
    if (breedCoat?.coatWeight != null && breedCoat.coatSelections.length > 0) {
      totalSumWeights += breedCoat.coatWeight
      if (animal.phenotypeDescription) {
        const byRole = new Map<string, string[]>()
        for (const sel of breedCoat.coatSelections) {
          if (!byRole.has(sel.colorRole)) byRole.set(sel.colorRole, [])
          byRole.get(sel.colorRole)!.push(sel.expression)
        }
        const groups = [...byRole.values()].map(codes => [...codes, null] as (string | null)[])
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
        if (acceptable.has(animal.phenotypeDescription)) totalSumMatched += breedCoat.coatWeight
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
      tx.animalConformationScore.create({ data: { animalId, breedId, score: overallScore } }),
      ...sectionScores.map((s) =>
        tx.animalConformationSectionScore.create({
          data: { animalId, breedId, sectionId: s.sectionId, score: s.score },
        })
      ),
    ])
  })
}
