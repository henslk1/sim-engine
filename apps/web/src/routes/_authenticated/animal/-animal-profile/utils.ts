import type { AnimalProfile } from "./types"

export function formatCycleAge(cycle: number, config: AnimalProfile["game"]["gameConfig"]): string {
  if (!config) return `cycle ${cycle}`
  const y = Math.floor(cycle / config.cyclesPerYear)
  const m = cycle % config.cyclesPerYear
  return `${y}y ${m}m`
}

export function computeBreedingGrade(
  animal: AnimalProfile,
  config: AnimalProfile["game"]["gameConfig"]
): string {
  const components: number[] = []

  components.push((animal.careScore?.score ?? 0) / 100)

  const tierIndex = animal.compTiers[0]?.tierDef.tierIndex ?? -1
  components.push(tierIndex < 0 ? 0 : Math.min((tierIndex + 1) / 10, 1))

  components.push(Math.max(0, 1 - animal.inbreedingCoefficient / 0.25))

  if (animal.stats.length > 0 && config) {
    const avg =
      animal.stats.reduce((sum: number, s: AnimalProfile["stats"][number]) => {
        const cap = s.innateValue * config.trainingCeilingMultiplier
        return sum + Math.min(s.trainedValue / cap, 1)
      }, 0) / animal.stats.length
    components.push(avg)
  } else {
    components.push(0)
  }

  const isCross = animal.breedComposition.length > 1
  if (!isCross && animal.conformationScores.length > 0) {
    const avg =
      animal.conformationScores.reduce(
        (sum: number, s: AnimalProfile["conformationScores"][number]) => sum + s.score,
        0
      ) / animal.conformationScores.length
    components.push(avg / 100)
  }

  const pct = (components.reduce((a, b) => a + b, 0) / components.length) * 100

  switch (true) {
    case pct >= 85: return "A"
    case pct >= 70: return "B"
    case pct >= 55: return "C"
    case pct >= 40: return "D"
    default: return "F"
  }
}
