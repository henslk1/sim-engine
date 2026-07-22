export type BreedingQualityInput = {
  careScore: number
  compTier: { tierIndex: number; maxTierIndex: number } | null
  inbreedingCoefficient: number
  trainedStatAvgRatio: number
  conformationAvg: number | null
  healthTestedRatio: number | null
  activeConditions: number
}

export function computeBreedingQuality(input: BreedingQualityInput): { score: number; grade: string } {
  const parts: number[] = []
  parts.push(Math.min(input.careScore / 100, 1))
  parts.push(input.compTier ? (input.compTier.tierIndex + 1) / (input.compTier.maxTierIndex + 1) : 0)
  parts.push(Math.max(0, 1 - input.inbreedingCoefficient / 0.25))
  parts.push(Math.min(input.trainedStatAvgRatio, 1))
  if (input.conformationAvg !== null) parts.push(input.conformationAvg / 100)
  if (input.healthTestedRatio !== null) parts.push(input.healthTestedRatio)
  parts.push(Math.max(0, 1 - input.activeConditions * 0.15))
  const score = (parts.reduce((a, b) => a + b, 0) / parts.length) * 100
  const grade =
    score >= 100 ? "S" :
    score >= 85  ? "A" :
    score >= 70  ? "B" :
    score >= 55  ? "C" :
    score >= 40  ? "D" : "F"
  return { score, grade }
}
