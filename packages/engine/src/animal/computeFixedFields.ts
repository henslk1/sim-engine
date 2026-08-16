import { Prisma } from "@sim-engine/db"

type Tx = Prisma.TransactionClient

export async function computeFixedFields(
  tx: Tx,
  genotypes: Array<{ locusId: string; alleleOneId: string; alleleTwoId: string }>
): Promise<{
  structuralRisk: number
  preferredTerrain: string[]
  preferredClimate: string[]
}> {
  if (genotypes.length === 0) {
    return { structuralRisk: 0, preferredTerrain: [], preferredClimate: [] }
  }

  const rules = await Promise.all(
    genotypes.map((g) =>
      tx.expressionRule.findUnique({
        where: {
          locusId_alleleOneId_alleleTwoId: {
            locusId: g.locusId,
            alleleOneId: g.alleleOneId,
            alleleTwoId: g.alleleTwoId,
          },
        },
        include: {
          ruleConditions: { include: { healthConditionDef: { select: { conditionType: true } } } },
          climateModifiers: { select: { climate: true, modifier: true } },
          terrainModifiers: { select: { terrain: true, modifier: true } },
        },
      })
    )
  )

  const matched = rules.filter((r): r is NonNullable<typeof r> => r !== null)

  const structuralRisk = matched.reduce((sum, rule) => {
    const injuryRisk = rule.ruleConditions
      .filter(rc => rc.healthConditionDef.conditionType === "INJURY")
      .reduce((s, rc) => s + rc.environmentalRiskModifier, 0)
    return sum + injuryRisk
  }, 0)

  const climateScores = new Map<string, number>()
  const terrainScores = new Map<string, number>()

  for (const rule of matched) {
    for (const cm of rule.climateModifiers) {
      climateScores.set(cm.climate, (climateScores.get(cm.climate) ?? 0) + cm.modifier)
    }
    for (const tm of rule.terrainModifiers) {
      terrainScores.set(tm.terrain, (terrainScores.get(tm.terrain) ?? 0) + tm.modifier)
    }
  }

  const topClimateScore = climateScores.size > 0 ? Math.max(...climateScores.values()) : 0
  const preferredClimate = topClimateScore > 0
    ? [...climateScores.entries()].filter(([, s]) => s === topClimateScore).map(([c]) => c)
    : []

  const topTerrainScore = terrainScores.size > 0 ? Math.max(...terrainScores.values()) : 0
  const preferredTerrain = topTerrainScore > 0
    ? [...terrainScores.entries()].filter(([, s]) => s === topTerrainScore).map(([t]) => t)
    : []

  return { structuralRisk, preferredTerrain, preferredClimate }
}
