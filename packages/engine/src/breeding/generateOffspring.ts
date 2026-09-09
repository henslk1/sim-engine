import { computeCOI } from "./computeCOI.js"

// fertility is stored as 0–1 decimal in Animal (e.g. 0.93 = 93%).
// The conception formula treats it as 0–100 by multiplying × 100.

const CONCEPTION_FLOOR = 10

export type BlendedAlleleFrequency = { alleleId: string; symbol: string; frequency: number }

export type ParentData = {
  id: string
  fertility: number
  inbreedingCoefficient: number
  breedGeneration: number | null
  breedId: string
  quality: number
  stats: Array<{ statDefId: string; innateValue: number }>
  mood: { value: number } | null
  personality: Array<{ traitDefId: string; value: number; labelRanges: { minValue: number; maxValue: number; conceptionModifier: number }[] }>
  genotypes: Array<{
    locusId: string
    alleleOneId: string
    alleleTwoId: string
    alleleOne: { id: string; symbol: string }
    alleleTwo: { id: string; symbol: string }
    locus: { inheritanceWeight: number }
  }>
  breedComposition: Array<{ breedId: string; percentage: number }>
  immunity: { innateMax: number } | null
  ancestors: Array<{ ancestorId: string; depth: number; ancestor: { inbreedingCoefficient: number } }>
}

export type GameConfigForBreeding = {
  defaultInnateRatio: number
  breedingBaseGain: number
  breedingMinGain: number
  breedingVarianceFactor: number
  gestationCareFloor: number
  multiplesBirthCap: number
  multiplesChance: number
  identicalMultiplesChance: number
  topGradeDoubleBonusChance: number
}

export type GenerateOffspringInput = {
  sire: ParentData
  dam: ParentData
  damCareScore: number
  gameConfig: GameConfigForBreeding
  gameInnateMax: { maxTotalInnate: number; averageTotalInnate: number }
  gradeBreedId: string
  targetBreedId?: string
  skipConceptionRoll?: boolean
  // locusId → blended allele frequencies for hidden modifier loci
  breedAlleleFrequencies?: Map<string, BlendedAlleleFrequency[]>
}

export type OffspringData = {
  sex: "MALE" | "FEMALE"
  breedId: string
  breedGeneration: number | null
  fertility: number
  inbreedingCoefficient: number
  stats: Array<{ statDefId: string; innateValue: number }>
  immunity: { innateMax: number; startingValue: number }
  genotypes: Array<{ locusId: string; alleleOneId: string; alleleTwoId: string }>
  breedComposition: Array<{ breedId: string; percentage: number }>
  personality: Array<{ traitDefId: string; value: number }>
}

export type GenerateOffspringResult =
  | { conceived: false }
  | { conceived: true; offspring: OffspringData[] }

// Dominant allele (uppercase first char) goes to alleleOne.
// Both same case → sort alphabetically for a stable ordering.
function canonicalizeAlleles(
  a: { id: string; symbol: string },
  b: { id: string; symbol: string },
): [string, string] {
  const aUpper = a.symbol.length > 0 && a.symbol[0] !== a.symbol[0]!.toLowerCase()
  const bUpper = b.symbol.length > 0 && b.symbol[0] !== b.symbol[0]!.toLowerCase()
  if (aUpper && !bUpper) return [a.id, b.id]
  if (!aUpper && bUpper) return [b.id, a.id]
  return a.symbol <= b.symbol ? [a.id, b.id] : [b.id, a.id]
}

function isSameComposition(
  a: Array<{ breedId: string; percentage: number }>,
  b: Array<{ breedId: string; percentage: number }>,
): boolean {
  if (a.length !== b.length) return false
  const aMap = new Map(a.map((c) => [c.breedId, c.percentage]))
  for (const entry of b) {
    const aVal = aMap.get(entry.breedId)
    if (aVal === undefined || Math.abs(aVal - entry.percentage) > 0.001) return false
  }
  return true
}

function blendDraw(
  parent: { alleleOneId: string; alleleTwoId: string },
  entries: BlendedAlleleFrequency[],
  iw: number,
): { id: string; symbol: string } {
  const weights = entries.map(e => {
    const copies = (e.alleleId === parent.alleleOneId ? 1 : 0) + (e.alleleId === parent.alleleTwoId ? 1 : 0)
    return { id: e.alleleId, symbol: e.symbol, w: iw * (copies * 0.5) + (1 - iw) * e.frequency }
  })
  const total = weights.reduce((s, w) => s + w.w, 0)
  if (total <= 0) return { id: weights[0]!.id, symbol: weights[0]!.symbol }
  let r = Math.random() * total
  for (const w of weights) {
    r -= w.w
    if (r <= 0) return { id: w.id, symbol: w.symbol }
  }
  return { id: weights[weights.length - 1]!.id, symbol: weights[weights.length - 1]!.symbol }
}

export function generateOffspring(input: GenerateOffspringInput): GenerateOffspringResult {
  const { sire, dam, damCareScore, gameConfig, gameInnateMax, gradeBreedId, targetBreedId, breedAlleleFrequencies } = input

  // ── Conception roll ───────────────────────────────────────────────────────────
  if (!input.skipConceptionRoll) {
    const base =
      (sire.fertility * 100 + dam.fertility * 100 + (sire.mood?.value ?? 50) + (dam.mood?.value ?? 50)) / 4

    const personalityOffset = [...sire.personality, ...dam.personality].reduce((acc, p) => {
      const range = p.labelRanges.find(r => p.value >= r.minValue && p.value <= r.maxValue)
      return acc + (range?.conceptionModifier ?? 0)
    }, 0)

    const conceptionChance = Math.max(CONCEPTION_FLOOR, Math.min(100, base + personalityOffset))
    if (Math.random() * 100 > conceptionChance) return { conceived: false }
  }

  // ── Multiples ─────────────────────────────────────────────────────────────────
  let quantity = 1
  if (gameConfig.multiplesChance > 0 && Math.random() < gameConfig.multiplesChance) {
    quantity = 2 + Math.floor(Math.random() * (gameConfig.multiplesBirthCap - 1))
  }
  const isIdentical =
    quantity > 1 &&
    gameConfig.identicalMultiplesChance > 0 &&
    Math.random() < gameConfig.identicalMultiplesChance

  // ── Shared values (computed once, used for all offspring in the litter) ───────
  const coi = computeCOI(sire.id, sire.inbreedingCoefficient, sire.ancestors, dam.id, dam.inbreedingCoefficient, dam.ancestors)

  const sireTotal = sire.stats.reduce((s, x) => s + x.innateValue, 0)
  const damTotal = dam.stats.reduce((s, x) => s + x.innateValue, 0)
  const parentAvgTotal = (sireTotal + damTotal) / 2

  const statAvgs: Record<string, number> = {}
  for (const s of sire.stats) statAvgs[s.statDefId] = (statAvgs[s.statDefId] ?? 0) + s.innateValue * 0.5
  for (const s of dam.stats) statAvgs[s.statDefId] = (statAvgs[s.statDefId] ?? 0) + s.innateValue * 0.5

  const isFirstGenCross = !isSameComposition(sire.breedComposition, dam.breedComposition)

  const allBreedIds = new Set([
    ...sire.breedComposition.map((c) => c.breedId),
    ...dam.breedComposition.map((c) => c.breedId),
  ])
  const sireCompMap = new Map(sire.breedComposition.map((c) => [c.breedId, c.percentage]))
  const damCompMap = new Map(dam.breedComposition.map((c) => [c.breedId, c.percentage]))
  const offspringComposition = Array.from(allBreedIds).map((id) => ({
    breedId: id,
    percentage: ((sireCompMap.get(id) ?? 0) + (damCompMap.get(id) ?? 0)) / 2,
  }))

  const offspringBreedId =
    targetBreedId ??
    (sire.breedId === dam.breedId && sire.breedId !== gradeBreedId ? sire.breedId : gradeBreedId)

  const offspringBreedGen =
    sire.breedGeneration != null || dam.breedGeneration != null
      ? Math.max(sire.breedGeneration ?? 0, dam.breedGeneration ?? 0) + 1
      : null

  const offspringInnateMax = Math.max(
    0,
    ((sire.immunity?.innateMax ?? 100) + (dam.immunity?.innateMax ?? 100)) / 2 - coi * 40
  )
  const careMultiplier = Math.max(gameConfig.gestationCareFloor, damCareScore / 100)

  // Fertility: parent average ± small variance. No systematic gain.
  const parentAvgFertility = (sire.fertility + dam.fertility) / 2
  const fertilityVariance = (Math.random() * 2 - 1) * 0.05
  const offspringFertility = Math.min(1.0, Math.max(0, parentAvgFertility + fertilityVariance))

  // Quality multiplier for stat gains — average of both parents, 0–1 scale.
  const pairQuality = (sire.quality + dam.quality) / 200

  // Personality: parent average per trait ± small variance.
  const sirePersonalityMap = new Map(sire.personality.map((p) => [p.traitDefId, p.value]))
  const offspringPersonality = dam.personality.map((dp) => {
    const sireValue = sirePersonalityMap.get(dp.traitDefId) ?? dp.value
    const raw = (sireValue + dp.value) / 2 + (Math.random() * 2 - 1) * 3
    return { traitDefId: dp.traitDefId, value: Math.max(0, Math.min(100, raw)) }
  })

  // ── Per-offspring genetics roll ───────────────────────────────────────────────
  function rollGenetics() {
    // Stat total
    // S-grade double bonus: each S-grade parent (quality >= 100) adds a stacking roll chance
    const sGradeBonusChance =
      (sire.quality >= 100 ? gameConfig.topGradeDoubleBonusChance : 0) +
      (dam.quality >= 100 ? gameConfig.topGradeDoubleBonusChance : 0)

    const FALLBACK_HEADROOM = 0.035
    let totalInnate: number
    if (isFirstGenCross) {
      const crossBase = gameConfig.defaultInnateRatio * gameInnateMax.averageTotalInnate
      const headroom = Math.max(FALLBACK_HEADROOM, (gameInnateMax.maxTotalInnate - crossBase) / gameInnateMax.maxTotalInnate)
      const gain = Math.max(
        gameConfig.breedingMinGain,
        gameConfig.breedingBaseGain * Math.sqrt(headroom) * pairQuality,
      )
      const variance = gain * (Math.random() * 2 - 1) * gameConfig.breedingVarianceFactor
      const bonus = sGradeBonusChance > 0 && Math.random() < sGradeBonusChance ? gameConfig.breedingMinGain : 0
      totalInnate = Math.max(crossBase, crossBase + gain + variance + bonus)
    } else {
      const headroom = Math.max(
        FALLBACK_HEADROOM,
        (gameInnateMax.maxTotalInnate - parentAvgTotal) / gameInnateMax.maxTotalInnate,
      )
      const gain = Math.max(
        gameConfig.breedingMinGain,
        gameConfig.breedingBaseGain * Math.sqrt(headroom) * pairQuality,
      )
      const variance = gain * (Math.random() * 2 - 1) * gameConfig.breedingVarianceFactor
      const bonus = sGradeBonusChance > 0 && Math.random() < sGradeBonusChance ? gameConfig.breedingMinGain : 0
      totalInnate = Math.max(parentAvgTotal, parentAvgTotal + gain + variance + bonus)
    }

    // Distribute via parent-average ratios, then apply gestation care modifier
    const stats =
      parentAvgTotal > 0
        ? Object.entries(statAvgs).map(([statDefId, avg]) => ({
            statDefId,
            innateValue: totalInnate * (avg / parentAvgTotal) * careMultiplier,
          }))
        : Object.entries(statAvgs).map(([statDefId]) => ({
            statDefId,
            innateValue: 0,
          }))

    // Allele inheritance — Mendelian by default, blended for hidden modifier loci (inheritanceWeight < 1)
    const damGenotypeMap = new Map(dam.genotypes.map((g) => [g.locusId, g]))
    const genotypes = sire.genotypes.flatMap((sireGt) => {
      const damGt = damGenotypeMap.get(sireGt.locusId)
      if (!damGt) return []

      const iw = sireGt.locus.inheritanceWeight
      const entries = iw < 1.0 ? breedAlleleFrequencies?.get(sireGt.locusId) : undefined

      let sireAllele: { id: string; symbol: string }
      let damAllele: { id: string; symbol: string }

      if (entries && entries.length > 0) {
        sireAllele = blendDraw(sireGt, entries, iw)
        damAllele = blendDraw(damGt, entries, iw)
      } else {
        sireAllele = Math.random() < 0.5 ? sireGt.alleleOne : sireGt.alleleTwo
        damAllele = Math.random() < 0.5 ? damGt.alleleOne : damGt.alleleTwo
      }

      const [alleleOneId, alleleTwoId] = canonicalizeAlleles(sireAllele, damAllele)
      return [{ locusId: sireGt.locusId, alleleOneId, alleleTwoId }]
    })

    return { stats, genotypes }
  }

  const firstRoll = rollGenetics()

  const offspring: OffspringData[] = Array.from({ length: quantity }, (_, i) => {
    const { stats, genotypes } = i === 0 ? firstRoll : isIdentical ? firstRoll : rollGenetics()
    return {
      sex: Math.random() < 0.5 ? "MALE" : "FEMALE",
      breedId: offspringBreedId,
      breedGeneration: offspringBreedGen,
      fertility: offspringFertility,
      inbreedingCoefficient: coi,
      stats,
      immunity: {
        innateMax: offspringInnateMax,
        startingValue: offspringInnateMax * careMultiplier,
      },
      genotypes,
      breedComposition: offspringComposition,
      personality: offspringPersonality,
    }
  })

  return { conceived: true, offspring }
}
