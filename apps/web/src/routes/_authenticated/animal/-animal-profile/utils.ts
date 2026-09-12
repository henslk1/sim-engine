import type { AnimalProfile } from "./types"

export function displaySex(sex: string, isCastrated: boolean): string {
  if (sex === "MALE" && isCastrated) return "Gelding"
  if (sex === "MALE") return "Male"
  if (sex === "FEMALE") return "Female"
  return sex
}

export const BREEDING_GRADE_COLOR: Record<string, string> = {
  S: "text-red-500",
  A: "text-yellow-600",
  B: "text-violet-500",
  C: "text-sky-600",
  D: "text-emerald-600",
  F: "text-zinc-400",
}

export const BREEDING_GRADE_BG: Record<string, string> = {
  S: "bg-red-500/15 border border-red-500/30",
  A: "bg-yellow-600/15 border border-yellow-600/30",
  B: "bg-violet-500/15 border border-violet-500/30",
  C: "bg-sky-600/15 border border-sky-600/30",
  D: "bg-emerald-600/15 border border-emerald-600/30",
  F: "bg-zinc-400/10 border border-zinc-400/20",
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
  return animal.breed?.name ?? animal.breedName ?? ""
}

export function getTrainingCap(
  innateValue: number,
  config: AnimalProfile["game"]["gameConfig"],
  personality?: AnimalProfile["personality"]
): number {
  const baseMultiplier = config?.trainingCeilingMultiplier ?? 1.5
  const personalityCapMod = personality?.reduce((sum, p) => {
    const effective = p.value + p.personalityModifier
    const range = p.traitDef.labelRanges.find(r => effective >= r.minValue && effective <= r.maxValue)
    return sum + (range?.trainingModifier ?? 0)
  }, 0) ?? 0
  return innateValue * (baseMultiplier + personalityCapMod)
}

export function getFertilityDisplay(fertility: number): { hearts: number; label: string } {
  const pct = fertility * 100
  if (pct === 0) return { hearts: 0, label: "Infertile" }
  if (pct <= 20) return { hearts: 1, label: "Low" }
  if (pct <= 40) return { hearts: 2, label: "Moderate" }
  if (pct <= 60) return { hearts: 3, label: "Good" }
  if (pct <= 80) return { hearts: 4, label: "High" }
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
  const care = (animal.careScore?.score ?? 0) / 100

  function discFraction(defId: string | null | undefined): number {
    if (!defId) return 0
    const tier = animal.compTiers.find((t) => t.disciplineDefId === defId)
    if (!tier) return 0
    const maxTierIndex = tier.disciplineDef.compTierDefs[0]?.tierIndex ?? tier.tierDef.tierIndex
    return (tier.tierDef.tierIndex + 1) / (maxTierIndex + 1)
  }

  const disc1 = discFraction(animal.disciplineDefId)
  const disc2 = discFraction(animal.secondaryDisciplineDefId)

  const coi = Math.max(0, 1 - animal.inbreedingCoefficient / 0.25)

  const stats = animal.stats.length > 0 && config
    ? animal.stats.reduce((sum, s) => {
        const cap = s.innateValue * config.trainingCeilingMultiplier
        return sum + Math.min(s.trainedValue / cap, 1)
      }, 0) / animal.stats.length
    : 0

  const healthLoci = animal.genotypes.filter((g) =>
    g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
  )
  const health = healthLoci.length > 0
    ? healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length
    : 1

  const conditions = Math.max(0, 1 - animal.healthRecords.filter((r) => r.isActive).length * 0.15)

  const sum = care + disc1 * 1.5 + disc2 * 1.5 + coi + stats + health + conditions
  const pct = (sum / 8) * 100

  function isAtMaxTier(defId: string | null | undefined): boolean {
    if (!defId) return false
    const tier = animal.compTiers.find((t) => t.disciplineDefId === defId)
    if (!tier) return false
    const maxTierIndex = tier.disciplineDef.compTierDefs[0]?.tierIndex ?? tier.tierDef.tierIndex
    return tier.tierDef.tierIndex >= maxTierIndex
  }

  const isPurebred = animal.breedComposition.length === 1
  const disc1Max = isAtMaxTier(animal.disciplineDefId)
  const disc2Max = isAtMaxTier(animal.secondaryDisciplineDefId)
  const avgConformation = animal.conformationScores.length > 0
    ? animal.conformationScores.reduce((s, c) => s + c.score, 0) / animal.conformationScores.length
    : 0
  const isS = pct >= 90 && disc1Max && disc2Max && isPurebred && avgConformation >= 85

  return isS ? "S" : pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 65 ? "C" : pct >= 50 ? "D" : "F"
}
