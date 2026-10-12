import { db } from "@sim-engine/db"
import { computeFixedFields } from "../animal/computeFixedFields.js"

export function weightedSample(items: { id: string; symbol: string; frequency: number }[]): { id: string; symbol: string } {
  const total = items.reduce((s, i) => s + i.frequency, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.frequency
    if (r <= 0) return item
  }
  return items[items.length - 1]!
}

export function canonicalize(a: { id: string; symbol: string }, b: { id: string; symbol: string }): [string, string] {
  const aUp = a.symbol.length > 0 && a.symbol[0] !== a.symbol[0]!.toLowerCase()
  const bUp = b.symbol.length > 0 && b.symbol[0] !== b.symbol[0]!.toLowerCase()
  if (aUp && !bUp) return [a.id, b.id]
  if (!aUp && bUp) return [b.id, a.id]
  return a.symbol <= b.symbol ? [a.id, b.id] : [b.id, a.id]
}

/**
 * Whether a breed is taking part in the rotation at this moment.
 *
 * Both dates null is the ordinary case and means yes, always. A breed with a
 * window joins on the first rotation after `rotationStartsAt` and is gone once
 * `rotationEndsAt` has passed.
 *
 * Exported because two callers need the same answer: the rotation, deciding
 * what to count as stocking, and `restockShop` below, which has to refuse a
 * breed whose run is over even when something else asks it to top that breed
 * up — the opportunistic restock after a purchase, for instance, which would
 * otherwise quietly put a retired breed back on the shelf.
 */
export function shopConfigIsOpen(
  config: { rotationStartsAt: Date | null; rotationEndsAt: Date | null },
  now: Date
): boolean {
  if (config.rotationStartsAt && now < config.rotationStartsAt) return false
  if (config.rotationEndsAt && now >= config.rotationEndsAt) return false
  return true
}

export async function restockShop(
  gameId: string,
  shopBreedConfigId?: string,
  now: Date = new Date()
): Promise<number> {
  const [configs, firstLifeStage, shopAccount, ltcDefs, gameConfig, gameInnateMax] = await Promise.all([
    db.gameShopBreedConfig.findMany({
      where: {
        gameId,
        isActive: true,
        // The window, in the query rather than the loop, so a breed outside its
        // run is not even loaded.
        AND: [
          { OR: [{ rotationStartsAt: null }, { rotationStartsAt: { lte: now } }] },
          { OR: [{ rotationEndsAt: null }, { rotationEndsAt: { gt: now } }] },
        ],
        ...(shopBreedConfigId ? { id: shopBreedConfigId } : {}),
      },
      include: {
        breed: { include: { statProfile: true, personalityProfiles: true } },
        _count: { select: { shopAnimals: { where: { isAvailable: true } } } },
      },
    }),
    db.lifeStageDef.findFirst({
      where: { gameId, canTrain: true },
      orderBy: { stageIndex: "asc" },
      select: { id: true, minCycle: true },
    }),
    db.playerAccount.findFirst({
      where: { gameId },
      select: { id: true },
    }),
    db.longTermCareActionDef.findMany({
      where: { gameId },
      select: { id: true, intervalCycles: true },
    }),
    db.gameConfig.findUnique({
      where: { gameId },
      select: { lifeExpectancyBaseline: true, defaultInnateRatio: true },
    }),
    db.gameInnateMax.findFirst({
      where: { gameId },
      select: { averageTotalInnate: true },
    }),
  ])

  if (!firstLifeStage) throw new Error("No life stages configured")
  if (!shopAccount) throw new Error("No player accounts found for this game")

  let created = 0

  for (const config of configs) {
    const needed = config.targetStock - config._count.shopAnimals
    if (needed <= 0) continue

    // Load allele frequencies for this breed, grouped by locus
    const [freqs, allLoci] = await Promise.all([
      db.breedAlleleFrequency.findMany({
        where: { breedId: config.breedId },
        include: { allele: { select: { id: true, symbol: true, locusId: true } } },
      }),
      db.locus.findMany({
        where: { gameId },
        select: { id: true, alleles: { select: { id: true, symbol: true } } },
      }),
    ])

    // Build weighted map from breed frequencies
    const byLocus = new Map<string, { id: string; symbol: string; frequency: number }[]>()
    for (const f of freqs) {
      const entry = { id: f.allele.id, symbol: f.allele.symbol, frequency: f.frequency }
      const list = byLocus.get(f.allele.locusId)
      if (list) list.push(entry)
      else byLocus.set(f.allele.locusId, [entry])
    }

    // Fall back to equal-weight sampling for loci with no breed frequencies
    for (const locus of allLoci) {
      if (!byLocus.has(locus.id) && locus.alleles.length > 0) {
        byLocus.set(locus.id, locus.alleles.map((a) => ({ ...a, frequency: 1 })))
      }
    }

    for (let i = 0; i < needed; i++) {
      const sex = Math.random() < 0.5 ? ("MALE" as const) : ("FEMALE" as const)
      const suffix = sex === "MALE" ? "Colt" : "Filly"
      const name = `${config.breed.name} ${suffix}`

      // Sample genotypes from breed frequencies
      const genotypes: { locusId: string; alleleOneId: string; alleleTwoId: string }[] = []
      for (const [locusId, alleles] of byLocus) {
        if (alleles.length === 0) continue
        const a = weightedSample(alleles)
        const b = weightedSample(alleles)
        const [alleleOneId, alleleTwoId] = canonicalize(a, b)
        genotypes.push({ locusId, alleleOneId, alleleTwoId })
      }

      // Apply numeric gene modifiers to life expectancy
      const lifeModifierRules = genotypes.length > 0 ? (await db.expressionRule.findMany({
        where: {
          OR: genotypes.map(g => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId })),
        },
        select: { numericModifier: true },
      })).filter(r => r.numericModifier !== null) : []
      const totalModifier = lifeModifierRules.reduce((s, r) => s + (r.numericModifier ?? 0), 0)
      const lifeExpectancyBase = config.breed.lifeExpectancyBaseline ?? gameConfig?.lifeExpectancyBaseline ?? null
      const lifeExpectancy = lifeExpectancyBase !== null ? Math.round(lifeExpectancyBase * (1 + totalModifier)) : null

      await db.$transaction(async (tx) => {
        const { structuralRisk, preferredTerrain, preferredClimate } = await computeFixedFields(tx, genotypes)

        // Resolved before the animal is created so `totalInnate` can be written
        // with it, rather than as a second pass over rows this already has.
        const totalPool = (gameConfig?.defaultInnateRatio ?? 0.5) * (gameInnateMax?.averageTotalInnate ?? 1000)
        const statWeightTotal = config.breed.statProfile.reduce((s, sp) => s + sp.weight, 0) || 1
        const stats = config.breed.statProfile.map((sp) => ({
          statDefId: sp.statDefId,
          innateValue: totalPool * (sp.weight / statWeightTotal),
        }))

        const animal = await tx.animal.create({
          data: {
            gameId,
            playerAccountId: shopAccount.id,
            breedId: config.breedId,
            lifeStageId: firstLifeStage.id,
            sex,
            name,
            fertility: Math.random(),
            ageInCycles: firstLifeStage.minCycle,
            status: "ALIVE",
            inbreedingCoefficient: 0,
            breedGeneration: 1,
            lifeExpectancy,
            structuralRisk,
            preferredTerrain: preferredTerrain as any,
            preferredClimate: preferredClimate as any,
            totalInnate: stats.reduce((sum, s) => sum + s.innateValue, 0),
          },
          select: { id: true },
        })

        await Promise.all([
          tx.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 100, maxEnergy: 100 } }),
          tx.animalMood.create({ data: { animalId: animal.id, value: 75 } }),
          tx.animalCondition.create({ data: { animalId: animal.id, value: 75 } }),
          tx.animalImmunity.create({ data: { animalId: animal.id, innateMax: config.breed.immunityMax ?? 100, value: (config.breed.immunityMin ?? 60) + Math.random() * ((config.breed.immunityMax ?? 100) - (config.breed.immunityMin ?? 60)) } }),
          tx.animalCareScore.create({ data: { animalId: animal.id, score: 75 } }),
          tx.animalBreedComposition.create({ data: { animalId: animal.id, breedId: config.breedId, percentage: 1.0 } }),
          ...stats.map((s) =>
            tx.animalStat.create({
              data: { animalId: animal.id, statDefId: s.statDefId, innateValue: s.innateValue, trainedValue: 0 },
            })
          ),
          ...config.breed.personalityProfiles.map((pp) => {
            const range = pp.naturalMax - pp.naturalMin
            const value = pp.naturalMin + Math.random() * range
            return tx.animalPersonality.create({
              data: { animalId: animal.id, traitDefId: pp.traitDefId, value },
            })
          }),
          ...genotypes.map((g) =>
            tx.animalGenotype.create({
              data: { animalId: animal.id, locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId },
            })
          ),
          tx.gameShopAnimal.create({
            data: { gameId, animalId: animal.id, shopBreedConfigId: config.id, isAvailable: true },
          }),
          ...ltcDefs.map((def) =>
            tx.animalLongTermCareRecord.create({
              data: { animalId: animal.id, longTermCareActionDefId: def.id, nextDueCycle: def.intervalCycles },
            })
          ),
        ])
      })

      created++
    }
  }

  return created
}
