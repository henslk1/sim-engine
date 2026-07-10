import type { AnimalProfile } from "./types"

export const BREEDING_GRADE_COLOR: Record<string, string> = {
  A: "text-amber-400",
  B: "text-violet-500",
  C: "text-sky-500",
  D: "text-emerald-500",
  F: "text-zinc-400",
}

export function getCOIColor(coefficient: number): string {
  if (coefficient < 0.0625) return "text-chart-2"
  if (coefficient < 0.125) return "text-amber-500"
  return "text-destructive"
}

export function placementBadgeTone(placement: number): "success" | "accent" | "muted" {
  if (placement === 1) return "success"
  if (placement <= 3) return "accent"
  return "muted"
}

export function formatBreedLabel(animal: AnimalProfile): string {
  if (animal.breedComposition.length > 1) {
    return animal.breedComposition
      .map((bc) => `${bc.breed.name} ${Math.round(bc.percentage)}%`)
      .join(" / ")
  }
  return animal.breed.name
}

export function getTrainingCap(innateValue: number, config: AnimalProfile["game"]["gameConfig"]): number {
  return config ? innateValue * config.trainingCeilingMultiplier : innateValue * 1.5
}

export function getFertilityDisplay(fertility: number): { hearts: number; label: string } {
  if (fertility === 0) return { hearts: 0, label: "Infertile" }
  if (fertility <= 20) return { hearts: 1, label: "Low" }
  if (fertility <= 40) return { hearts: 2, label: "Moderate" }
  if (fertility <= 60) return { hearts: 3, label: "Good" }
  if (fertility <= 80) return { hearts: 4, label: "High" }
  return { hearts: 5, label: "Excellent" }
}

export function formatCycleAge(cycle: number, config: AnimalProfile["game"]["gameConfig"]): string {
  if (!config) return `cycle ${cycle}`
  const y = Math.floor(cycle / config.cyclesPerYear)
  const m = cycle % config.cyclesPerYear
  return `${y}y ${m}m`
}

export function getConformationGrade(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: "A", label: "Excellent" }
  if (score >= 75) return { grade: "B", label: "Good" }
  if (score >= 60) return { grade: "C", label: "Fair" }
  if (score >= 45) return { grade: "D", label: "Below Standard" }
  return { grade: "F", label: "Poor" }
}

export function getActiveRestrictions(animal: AnimalProfile): Set<string> {
  const types = new Set<string>()
  for (const record of animal.healthRecords) {
    if (!record.isActive) continue
    for (const t of record.treatmentRecords) {
      if (!t.isActive) continue
      for (const rd of t.treatmentDef.restrictionDefs) {
        types.add(rd.restrictionType)
      }
      for (const r of t.activityRestriction) {
        if (r.isActive) types.add(r.restrictionType)
      }
    }
  }
  return types
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
