import { Prisma, AnimalSex, AnimalStatMode, PersonalityMode } from "@sim-engine/db"
import { weightedSample, canonicalize } from "../shop/restock.js"
import { computeFixedFields } from "./computeFixedFields.js"
import { computePhenotypeDescription } from "../breeding/computePhenotype.js"
import type { ExpressionRuleForPhenotype } from "../breeding/computePhenotype.js"

type Tx = Prisma.TransactionClient

interface TemplateInput {
  breedId: string | null
  breedName: string | null
  sex: AnimalSex
  name: string | null
  fertility: number | null
  startingAgeInCycles: number | null
  statMode: AnimalStatMode
  statFloor: number | null
  personalityMode: PersonalityMode
  personalityMin: number | null
  personalityMax: number | null
  stats: { statDefId: string; innateValue: number | null; trainedValue: number | null }[]
  compTiers: { disciplineDefId: string; tier: number }[]
  genotype: { locusId: string; alleleOneId: string; alleleTwoId: string; isTestedByOwner?: boolean }[]
  personalityValues?: { traitDefId: string; value: number }[]
  lore?: string | null
}

interface GenerateFromTemplateOpts {
  template: TemplateInput
  gameId: string
  ownerPlayerAccountId: string
  isTutorialAnimal: boolean
  breederId: string | null
  byLocus: Map<string, { id: string; symbol: string; frequency: number }[]>
  breedWeights: { statDefId: string; weight: number }[]
  defaultInnateRatio: number
  gameInnateMax: number | null
  breedPersonalityProfiles: { traitDefId: string; naturalMin: number; naturalMax: number }[]
  immunityMin: number | null
  immunityMax: number | null
  lifeExpectancyBaseline: number | null
  gameConfigLifeExpectancyBaseline: number | null
  ltcDefs: { id: string; intervalCycles: number }[]
  lifeStages: { id: string; minCycle: number; stageIndex: number }[]
  // key: `${disciplineId}:${tierIndex}` → CompetitionTierDef.id
  compTierLookup: Map<string, string>
}

export async function generateFromTemplate(tx: Tx, opts: GenerateFromTemplateOpts): Promise<string> {
  const { template } = opts

  // Resolve life stage
  const age = template.startingAgeInCycles ?? 0
  const sortedStages = [...opts.lifeStages].sort((a, b) => a.stageIndex - b.stageIndex)
  const lifeStage = [...sortedStages].filter((s) => s.minCycle <= age).pop() ?? sortedStages[0]!

  // Resolve genotypes - forced loci from template, rest sampled from breed frequencies
  const forcedLoci = new Set(template.genotype.map((g) => g.locusId))
  const genotypes = [...template.genotype]
  for (const [locusId, alleles] of opts.byLocus) {
    if (forcedLoci.has(locusId) || alleles.length === 0) continue
    const a = weightedSample(alleles)
    const b = weightedSample(alleles)
    const [alleleOneId, alleleTwoId] = canonicalize(a, b)
    genotypes.push({ locusId, alleleOneId, alleleTwoId })
  }

  // Resolve stats
  const templateStatMap = new Map(template.stats.map((s) => [s.statDefId, s]))
  const totalWeight = opts.breedWeights.reduce((s, w) => s + w.weight, 0) || 1
  const innateMax = opts.gameInnateMax ?? 100
  const stats = opts.breedWeights.map((sp) => {
    const tStat = templateStatMap.get(sp.statDefId)
    const normalizedWeight = sp.weight / totalWeight
    let innateValue: number
    let trainedValue: number
    if (template.statMode === "EXACT") {
      innateValue = tStat?.innateValue ?? 0
      trainedValue = tStat?.trainedValue ?? 0
    } else if (template.statMode === "BREED_MAX") {
      innateValue = innateMax * normalizedWeight
      trainedValue = tStat?.trainedValue ?? 0
    } else {
      // FLOOR
      const pool = opts.defaultInnateRatio * innateMax
      innateValue = Math.max(pool * normalizedWeight, template.statFloor ?? 0)
      trainedValue = tStat?.trainedValue ?? 0
    }
    return { statDefId: sp.statDefId, innateValue, trainedValue }
  })

  // Resolve personality
  const templatePersonalityMap = new Map((template.personalityValues ?? []).map(p => [p.traitDefId, p]))
  const personality = opts.breedPersonalityProfiles.map((pp) => {
    const tPersonality = templatePersonalityMap.get(pp.traitDefId)
    let value: number
    if (tPersonality != null) {
      value = tPersonality.value
    } else if (template.personalityMode === "RANGE" && template.personalityMin != null && template.personalityMax != null) {
      value = template.personalityMin + Math.random() * (template.personalityMax - template.personalityMin)
    } else {
      value = pp.naturalMin + Math.random() * (pp.naturalMax - pp.naturalMin)
    }
    return { traitDefId: pp.traitDefId, value }
  })

  const { structuralRisk, preferredTerrain, preferredClimate } = await computeFixedFields(tx, genotypes)

  // Apply numeric gene modifiers to life expectancy (e.g. longevity locus)
  const allMatchingRules = genotypes.length > 0
    ? await tx.expressionRule.findMany({
        where: {
          OR: genotypes.map(g => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId })),
        },
        select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true, numericModifier: true },
      })
    : []
  const lifeModifierRules = allMatchingRules.filter(r => r.numericModifier !== null)
  const phenotypeRules = allMatchingRules.filter(
    (r): r is ExpressionRuleForPhenotype => r.phenotype !== null
  )
  const phenotypeDescription = computePhenotypeDescription(genotypes, phenotypeRules)
  const totalModifier = lifeModifierRules.reduce((s, r) => s + (r.numericModifier ?? 0), 0)
  const lifeExpectancyBase = opts.lifeExpectancyBaseline ?? opts.gameConfigLifeExpectancyBaseline ?? null
  const lifeExpectancy = lifeExpectancyBase !== null ? Math.round(lifeExpectancyBase * (1 + totalModifier)) : null

  const breedDisplayName = template.breedId
    ? (await tx.breed.findUnique({ where: { id: template.breedId }, select: { name: true } }))?.name ?? "Unknown"
    : (template.breedName ?? "Unknown")

  const animal = await tx.animal.create({
    data: {
      gameId: opts.gameId,
      playerAccountId: opts.ownerPlayerAccountId,
      breedId: template.breedId ?? null,
      breedName: template.breedId ? null : (template.breedName ?? null),
      breederId: opts.breederId,
      lifeStageId: lifeStage.id,
      sex: template.sex,
      name: template.name ?? `${breedDisplayName} ${template.sex === "MALE" ? "Colt" : "Filly"}`,
      fertility: template.fertility ?? Math.random(),
      ageInCycles: age,
      status: "ALIVE",
      inbreedingCoefficient: 0,
      breedGeneration: 1,
      lifeExpectancy,
      isTutorialAnimal: opts.isTutorialAnimal,
      lore: template.lore ?? null,
      disciplineDefId: template.compTiers[0]?.disciplineDefId ?? null,
      phenotypeDescription,
      structuralRisk,
      preferredTerrain: preferredTerrain as any,
      preferredClimate: preferredClimate as any,
    },
    select: { id: true }
  })

   await Promise.all([
    tx.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 100, maxEnergy: 100 } }),
    tx.animalMood.create({ data: { animalId: animal.id, value: 75 } }),
    tx.animalCondition.create({ data: { animalId: animal.id, value: 75 } }),
    tx.animalImmunity.create({ data: { animalId: animal.id, innateMax: opts.immunityMax ?? 100, value: (opts.immunityMin ?? 60) + Math.random() * ((opts.immunityMax ?? 100) - (opts.immunityMin ?? 60)) } }),
    tx.animalCareScore.create({ data: { animalId: animal.id, score: 75 } }),
    ...(template.breedId ? [
      tx.animalBreedComposition.create({ data: { animalId: animal.id, breedId: template.breedId, percentage: 1.0 } }),
    ] : []),    
  ...stats.map((s) =>
      tx.animalStat.create({
        data: { animalId: animal.id, statDefId: s.statDefId, innateValue: s.innateValue, trainedValue: s.trainedValue },
      })
    ),
    ...personality.map((p) =>
      tx.animalPersonality.create({
        data: { animalId: animal.id, traitDefId: p.traitDefId, value: p.value },
      })
    ),
    ...genotypes.map((g) =>
      tx.animalGenotype.create({
        data: { animalId: animal.id, locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId, isTestedByOwner: g.isTestedByOwner ?? false },
      })
    ),
    ...opts.ltcDefs.map((def) =>
      tx.animalLongTermCareRecord.create({
        data: { animalId: animal.id, longTermCareActionDefId: def.id, nextDueCycle: def.intervalCycles },
      })
    ),
    ...template.compTiers.flatMap((ct) => {
      const tierDefId = opts.compTierLookup.get(`${ct.disciplineDefId}:${ct.tier}`)
      if (!tierDefId) return []
      return [tx.animalCompetitionTier.create({
        data: { animalId: animal.id, disciplineDefId: ct.disciplineDefId, tierDefId },
      })]
    }),
  ])

  return animal.id
}