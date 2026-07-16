import { db } from "@sim-engine/db"

type Client = typeof db

export async function runConformationInspection(client: Client, animalId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: {
        gameId: true,
        breedId: true,
        ageInCycles: true,
        status: true,
        breedComposition: { select: { breedId: true } },
        conformationScores: { select: { id: true }, take: 1 },
        genotypes: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
      },
    })

    if (animal.status !== "ALIVE") throw new Error("Animal must be alive")
    if (animal.breedComposition.length !== 1) throw new Error("Conformation inspection is only available for purebred animals")
    if (animal.conformationScores.length > 0) throw new Error("Animal has already been inspected")

    const gameConfig = await tx.gameConfig.findUniqueOrThrow({
      where: { gameId: animal.gameId },
      select: { conformationInspectionMinCycle: true },
    })

    if (animal.ageInCycles < gameConfig.conformationInspectionMinCycle) {
      throw new Error(`Animal must be at least cycle ${gameConfig.conformationInspectionMinCycle} to be inspected`)
    }

    const breedId = animal.breedId

    const [sections, standards] = await Promise.all([
      tx.conformationSection.findMany({
        where: { gameId: animal.gameId },
        select: { id: true, entries: { select: { locusId: true } } },
      }),
      tx.breedConformationStandard.findMany({
        where: { breedId },
        select: { locusId: true, idealExpressionLabel: true, weight: true },
      }),
    ])

    const standardMap = new Map(standards.map((s) => [s.locusId, s]))
    const genotypeMap = new Map(animal.genotypes.map((g) => [g.locusId, g]))

    const locusIds = standards.map((s) => s.locusId)
    const expressionRules = await tx.expressionRule.findMany({
      where: { locusId: { in: locusIds } },
      select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
    })

    const ruleMap = new Map<string, string>()
    for (const r of expressionRules) {
      ruleMap.set(`${r.locusId}:${r.alleleOneId}:${r.alleleTwoId}`, r.phenotype)
      ruleMap.set(`${r.locusId}:${r.alleleTwoId}:${r.alleleOneId}`, r.phenotype)
    }

    const sectionScores: { sectionId: string; score: number }[] = []

    for (const section of sections) {
      let sumWeights = 0
      let sumMatched = 0

      for (const entry of section.entries) {
        const std = standardMap.get(entry.locusId)
        if (!std) continue

        sumWeights += std.weight

        const genotype = genotypeMap.get(entry.locusId)
        if (!genotype) continue

        const phenotype = ruleMap.get(`${entry.locusId}:${genotype.alleleOneId}:${genotype.alleleTwoId}`)
        if (phenotype === std.idealExpressionLabel) sumMatched += std.weight
      }

      if (sumWeights === 0) continue
      sectionScores.push({ sectionId: section.id, score: (sumMatched / sumWeights) * 100 })
    }

    const overallScore =
      sectionScores.length > 0
        ? sectionScores.reduce((sum, s) => sum + s.score, 0) / sectionScores.length
        : 0

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
