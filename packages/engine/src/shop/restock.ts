import { db } from "@sim-engine/db"

function weightedSample(items: { id: string; symbol: string; frequency: number }[]): { id: string; symbol: string } {
  const total = items.reduce((s, i) => s + i.frequency, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.frequency
    if (r <= 0) return item
  }
  return items[items.length - 1]!
}

function canonicalize(a: { id: string; symbol: string }, b: { id: string; symbol: string }): [string, string] {
  const aUp = a.symbol.length > 0 && a.symbol[0] !== a.symbol[0]!.toLowerCase()
  const bUp = b.symbol.length > 0 && b.symbol[0] !== b.symbol[0]!.toLowerCase()
  if (aUp && !bUp) return [a.id, b.id]
  if (!aUp && bUp) return [b.id, a.id]
  return a.symbol <= b.symbol ? [a.id, b.id] : [b.id, a.id]
}

export async function restockShop(gameId: string, shopBreedConfigId?: string): Promise<number> {
  const [configs, firstLifeStage, shopAccount, ltcDefs] = await Promise.all([
    db.gameShopBreedConfig.findMany({
      where: { gameId, isActive: true, ...(shopBreedConfigId ? { id: shopBreedConfigId } : {}) },
      include: {
        breed: { include: { statProfile: true, personalityProfiles: true } },
        _count: { select: { shopAnimals: { where: { isAvailable: true } } } },
      },
    }),
    db.lifeStageDef.findFirst({
      where: { gameId, canCompete: true },
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
  ])

  if (!firstLifeStage) throw new Error("No life stages configured")
  if (!shopAccount) throw new Error("No player accounts found for this game")

  let created = 0

  for (const config of configs) {
    const needed = config.targetStock - config._count.shopAnimals
    if (needed <= 0) continue

    // Load allele frequencies for this breed, grouped by locus
    const freqs = await db.breedAlleleFrequency.findMany({
      where: { breedId: config.breedId },
      include: { allele: { select: { id: true, symbol: true, locusId: true } } },
    })

    // Group by locusId → { locusId → [{id, symbol, frequency}] }
    const byLocus = new Map<string, { id: string; symbol: string; frequency: number }[]>()
    for (const f of freqs) {
      const entry = { id: f.allele.id, symbol: f.allele.symbol, frequency: f.frequency }
      const list = byLocus.get(f.allele.locusId)
      if (list) list.push(entry)
      else byLocus.set(f.allele.locusId, [entry])
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

      await db.$transaction(async (tx) => {
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
          },
          select: { id: true },
        })

        await Promise.all([
          tx.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 100, maxEnergy: 100 } }),
          tx.animalMood.create({ data: { animalId: animal.id, value: 75 } }),
          tx.animalCondition.create({ data: { animalId: animal.id, value: 75 } }),
          tx.animalImmunity.create({ data: { animalId: animal.id, value: 60, innateMax: 100 } }),
          tx.animalCareScore.create({ data: { animalId: animal.id, score: 75 } }),
          tx.animalBreedComposition.create({ data: { animalId: animal.id, breedId: config.breedId, percentage: 1.0 } }),
          ...config.breed.statProfile.map((sp) => {
            const range = sp.naturalMax - sp.naturalMin
            const innateValue = sp.naturalMin + Math.random() * range
            return tx.animalStat.create({
              data: { animalId: animal.id, statDefId: sp.statDefId, innateValue, trainedValue: 0 },
            })
          }),
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
