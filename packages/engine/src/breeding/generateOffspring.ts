// fertility is stored as 0–1 decimal in Animal (e.g. 0.93 = 93%).
// The conception formula treats it as 0–100 by multiplying × 100.

const CONCEPTION_FLOOR = 10

export type ParentData = {
  id: string
  fertility: number
  inbreedingCoefficient: number
  breedGeneration: number | null
  breedId: string
  stats: Array<{ statDefId: string; innateValue: number }>
  mood: { value: number } | null
  personality: Array<{ traitDef: { conceptionModifier: number }; value: number }>
  genotypes: Array<{
    locusId: string
    alleleOneId: string
    alleleTwoId: string
    alleleOne: { id: string; symbol: string }
    alleleTwo: { id: string; symbol: string }
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
}

export type GenerateOffspringInput = {
  sire: ParentData
  dam: ParentData
  damCareScore: number
  gameConfig: GameConfigForBreeding
  gameInnateMax: { maxTotalInnate: number; averageTotalInnate: number }
  gradeBreedId: string
  targetBreedId?: string
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

// Wright's path coefficient over the AnimalAncestor tree.
// One record per ancestor (shortest path stored), so this is an approximation
// for pedigrees with multiple paths to the same ancestor.
function computeCOI(
  sireAncestors: ParentData["ancestors"],
  damAncestors: ParentData["ancestors"],
): number {
  const sireMap = new Map(sireAncestors.map((a) => [a.ancestorId, a]))
  const damMap = new Map(damAncestors.map((a) => [a.ancestorId, a]))

  let coi = 0
  for (const [id, sireEntry] of sireMap) {
    const damEntry = damMap.get(id)
    if (damEntry !== undefined) {
      const fa = sireEntry.ancestor.inbreedingCoefficient
      coi += Math.pow(0.5, sireEntry.depth + damEntry.depth + 1) * (1 + fa)
    }
  }
  return Math.min(1, coi)
}

export function generateOffspring(input: GenerateOffspringInput): GenerateOffspringResult {
  const { sire, dam, damCareScore, gameConfig, gameInnateMax, gradeBreedId, targetBreedId } = input

  // ── Conception roll ───────────────────────────────────────────────────────────
  const base =
    (sire.fertility * 100 + dam.fertility * 100 + (sire.mood?.value ?? 50) + (dam.mood?.value ?? 50)) / 4

  const personalityOffset = [...sire.personality, ...dam.personality].reduce(
    (acc, p) => acc + p.traitDef.conceptionModifier * p.value,
    0,
  )

  const conceptionChance = Math.max(CONCEPTION_FLOOR, Math.min(100, base + personalityOffset))
  if (Math.random() * 100 > conceptionChance) return { conceived: false }

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
  const coi = computeCOI(sire.ancestors, dam.ancestors)

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

  const offspringInnateMax = ((sire.immunity?.innateMax ?? 100) + (dam.immunity?.innateMax ?? 100)) / 2
  const careMultiplier = Math.max(gameConfig.gestationCareFloor, damCareScore / 100)

  // Fertility uses same headroom curve, scaled to 0–1 range.
  const parentAvgFertility = (sire.fertility + dam.fertility) / 2
  const fertilityHeadroom = Math.max(0, 1.0 - parentAvgFertility)
  const fertScale = 0.01
  const fertilityGain = Math.max(
    gameConfig.breedingMinGain * fertScale,
    gameConfig.breedingBaseGain * fertScale * Math.sqrt(fertilityHeadroom),
  )
  const fertilityVariance =
    fertilityGain * (Math.random() * 2 - 1) * gameConfig.breedingVarianceFactor
  const offspringFertility = Math.min(
    1.0,
    Math.max(parentAvgFertility, parentAvgFertility + fertilityGain + fertilityVariance),
  )

  // ── Per-offspring genetics roll ───────────────────────────────────────────────
  function rollGenetics() {
    // Stat total
    let totalInnate: number
    if (isFirstGenCross) {
      totalInnate = gameConfig.defaultInnateRatio * gameInnateMax.averageTotalInnate
    } else {
      const headroom = Math.max(
        0,
        (gameInnateMax.maxTotalInnate - parentAvgTotal) / gameInnateMax.maxTotalInnate,
      )
      const gain = Math.max(
        gameConfig.breedingMinGain,
        gameConfig.breedingBaseGain * Math.sqrt(headroom),
      )
      const variance = gain * (Math.random() * 2 - 1) * gameConfig.breedingVarianceFactor
      totalInnate = Math.max(parentAvgTotal, parentAvgTotal + gain + variance)
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

    // Mendelian allele inheritance
    const damGenotypeMap = new Map(dam.genotypes.map((g) => [g.locusId, g]))
    const genotypes = sire.genotypes.flatMap((sireGt) => {
      const damGt = damGenotypeMap.get(sireGt.locusId)
      if (!damGt) return []

      const sireAllele = Math.random() < 0.5 ? sireGt.alleleOne : sireGt.alleleTwo
      const damAllele = Math.random() < 0.5 ? damGt.alleleOne : damGt.alleleTwo
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
    }
  })

  return { conceived: true, offspring }
}
