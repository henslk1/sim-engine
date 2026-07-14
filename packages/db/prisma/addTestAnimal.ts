import { PrismaClient } from "./generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"

// Run via: pnpm --filter @sim-engine/db db:add-animal
// Safe to run against the live dev DB — does NOT reset anything.

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! })
const db = new PrismaClient({ adapter })

// ── CONFIGURE: add entries to create multiple animals in one run ───────────────
type AnimalConfig = {
  name: string
  sex: "MALE" | "FEMALE"
  lifeStage: string   // Foal | Adolescent | Adult | Senior
  ageInCycles: number
  generation?: number
  breedGeneration?: number
  fertility?: number
  disciplineName?: string
  // locus name → [allele1Symbol, allele2Symbol]  (only overrides; all others get first allele homozygous by default)
  genotypeOverrides?: Record<string, [string, string]>
  testedLoci?: string[]
}

const ANIMALS: AnimalConfig[] = [
  {
    name: "Silverbell",
    sex: "FEMALE",
    lifeStage: "Adult",
    ageInCycles: 48,
    generation: 3,
    breedGeneration: 5,
    fertility: 0.91,
    genotypeOverrides: {
      "Base Color": ["E", "e"],
      "Agouti":     ["A", "a"],
      "Grey":       ["G", "g"],
      "Limb Alignment": ["La", "la"],
    },
    testedLoci: ["Base Color", "Agouti"],
  },
  {
    name: "Emberlace",
    sex: "FEMALE",
    lifeStage: "Adult",
    ageInCycles: 36,
    generation: 2,
    breedGeneration: 3,
    fertility: 0.85,
    genotypeOverrides: {
      "Base Color":  ["e", "e"],
      "Roan":        ["Rn", "rn"],
      "Back Length": ["Bl", "Bl"],
    },
    testedLoci: ["Base Color", "GBED"],
  },
  {
    name: "Goldenrod",
    sex: "FEMALE",
    lifeStage: "Adult",
    ageInCycles: 52,
    generation: 4,
    breedGeneration: 6,
    fertility: 0.88,
    genotypeOverrides: {
      "Base Color":     ["E", "E"],
      "Agouti":         ["A", "A"],
      "Shoulder Slope": ["Ss", "ss"],
      "Neck Set":       ["Ns", "ns"],
      "Hip Angle":      ["Ha", "ha"],
    },
    testedLoci: ["Base Color", "Agouti", "HYPP", "HERDA"],
  },
  {
    name: "Ironclad",
    sex: "MALE",
    lifeStage: "Adult",
    ageInCycles: 55,
    generation: 3,
    breedGeneration: 5,
    fertility: 0.93,
    genotypeOverrides: {
      "Base Color": ["E", "e"],
      "Agouti":     ["A", "a"],
      "Limb Alignment": ["La", "La"],
      "Hip Angle":  ["Ha", "Ha"],
    },
    testedLoci: ["Base Color", "Agouti", "HYPP", "GBED"],
  },
  {
    name: "Redstone",
    sex: "MALE",
    lifeStage: "Adult",
    ageInCycles: 42,
    generation: 2,
    breedGeneration: 4,
    fertility: 0.88,
    genotypeOverrides: {
      "Base Color":  ["e", "e"],  // chestnut base
      "Roan":        ["Rn", "rn"],
      "Shoulder Slope": ["Ss", "Ss"],
      "Neck Set":    ["Ns", "Ns"],
    },
    testedLoci: ["Base Color", "HYPP"],
  },
  {
    name: "Cobalt",
    sex: "MALE",
    lifeStage: "Adult",
    ageInCycles: 60,
    generation: 4,
    breedGeneration: 6,
    fertility: 0.91,
    genotypeOverrides: {
      "Base Color":  ["E", "E"],
      "Agouti":      ["A", "A"],
      "Grey":        ["G", "g"],
      "Limb Alignment": ["La", "La"],
      "Back Length": ["Bl", "Bl"],
      "Shoulder Slope": ["Ss", "Ss"],
    },
    testedLoci: ["Base Color", "Agouti", "Grey", "HYPP", "GBED", "HERDA"],
  },
]

const BREED_NAME = "Thoroughbred"
// ──────────────────────────────────────────────────────────────────────────────

async function createAnimal(config: AnimalConfig, ctx: {
  gameId: string
  playerId: string
  breedId: string
  lifeStageId: string
  disciplineId: string
  noviceTierId: string
  breedStatProfiles: Array<{ statDefId: string; baseline: number }>
  breedPersonalityProfiles: Array<{ traitDefId: string; baseline: number; traitDef: { labelRanges: Array<{ label: string; minValue: number; maxValue: number }> } }>
  allLoci: Array<{ id: string; name: string; alleles: Array<{ id: string; symbol: string }> }>
  sections: Array<{ id: string; displayOrder: number }>
  lifeExpectancy: number
}) {
  const animal = await db.animal.create({
    data: {
      gameId: ctx.gameId,
      playerAccountId: ctx.playerId,
      breedId: ctx.breedId,
      name: config.name,
      sex: config.sex,
      lifeStageId: ctx.lifeStageId,
      generation: config.generation ?? 3,
      ageInCycles: config.ageInCycles,
      lifeExpectancy: ctx.lifeExpectancy,
      disciplineDefId: ctx.disciplineId,
      fertility: config.fertility ?? 0.90,
      breedGeneration: config.breedGeneration ?? 5,
    },
  })

  // Vitals
  await Promise.all([
    db.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 80, maxEnergy: 100 } }),
    db.animalMood.create({ data: { animalId: animal.id, value: 72 } }),
    db.animalCondition.create({ data: { animalId: animal.id, value: 82 } }),
    db.animalCareScore.create({ data: { animalId: animal.id, score: 80 } }),
    db.animalImmunity.create({ data: { animalId: animal.id, value: 70, innateMax: 90 } }),
  ])

  // Stats from breed profile baselines
  for (const sp of ctx.breedStatProfiles) {
    await db.animalStat.create({
      data: { animalId: animal.id, statDefId: sp.statDefId, innateValue: sp.baseline, trainedValue: 10 },
    })
  }

  // Personality from breed profile baselines
  for (const pp of ctx.breedPersonalityProfiles) {
    const label = pp.traitDef.labelRanges.find(
      (r) => pp.baseline >= r.minValue && pp.baseline < r.maxValue
    )?.label ?? "—"
    await db.animalPersonality.create({
      data: { animalId: animal.id, traitDefId: pp.traitDefId, value: pp.baseline, traitLabel: label },
    })
  }

  // Breed composition + conformation score
  await db.animalBreedComposition.create({
    data: { animalId: animal.id, breedId: ctx.breedId, percentage: 100 },
  })
  await db.animalConformationScore.create({
    data: { animalId: animal.id, breedId: ctx.breedId, score: 85.0 },
  })
  const placeholderScores = [85, 82, 88, 80, 84]
  for (let i = 0; i < ctx.sections.length; i++) {
    const section = ctx.sections[i]
    if (!section) continue
    await db.animalConformationSectionScore.create({
      data: { animalId: animal.id, breedId: ctx.breedId, sectionId: section.id, score: placeholderScores[i % placeholderScores.length] ?? 80 },
    })
  }

  // Competition tier
  await db.animalCompetitionTier.create({
    data: { animalId: animal.id, disciplineDefId: ctx.disciplineId, tierDefId: ctx.noviceTierId },
  })

  // Genotypes — build from all loci; use overrides where provided, else use first allele homozygous
  const overrides = config.genotypeOverrides ?? {}
  const tested = new Set(config.testedLoci ?? [])
  let genotypeCount = 0

  for (const locus of ctx.allLoci) {
    let a1sym: string
    let a2sym: string

    if (overrides[locus.name]) {
      ;[a1sym, a2sym] = overrides[locus.name]!
    } else {
      const first = locus.alleles[0]?.symbol
      if (!first) continue
      a1sym = first
      a2sym = first
    }

    const a1 = locus.alleles.find((a) => a.symbol === a1sym)
    const a2 = locus.alleles.find((a) => a.symbol === a2sym)
    if (!a1) { console.warn(`  ⚠ Allele "${a1sym}" not found on "${locus.name}" — skipping`); continue }
    if (!a2) { console.warn(`  ⚠ Allele "${a2sym}" not found on "${locus.name}" — skipping`); continue }

    const isTested = tested.has(locus.name)
    await db.animalGenotype.create({
      data: {
        animalId: animal.id,
        locusId: locus.id,
        alleleOneId: a1.id,
        alleleTwoId: a2.id,
        isTestedByOwner: isTested,
        testedAt: isTested ? new Date() : null,
        testedCycle: isTested ? config.ageInCycles : null,
      },
    })
    genotypeCount++
  }

  console.log(`  Created "${config.name}" (ID: ${animal.id}) — ${genotypeCount} genotypes`)
  return animal
}

async function main() {
  const game = await db.game.findFirstOrThrow({
    where: { slug: "equine-legends-seed" },
    include: { gameConfig: true },
  })
  const player = await db.playerAccount.findFirstOrThrow({ where: { gameId: game.id } })
  const breed = await db.breed.findFirstOrThrow({ where: { gameId: game.id, name: BREED_NAME } })
  const lifeExpectancy = breed.lifeExpectancyBaseline ?? game.gameConfig?.lifeExpectancyBaseline ?? 120

  const breedStatProfiles = await db.breedStatProfile.findMany({
    where: { breedId: breed.id },
    include: { statDef: true },
  })
  const breedPersonalityProfiles = await db.breedPersonalityProfile.findMany({
    where: { breedId: breed.id },
    include: { traitDef: { include: { labelRanges: true } } },
  })
  const allLoci = await db.locus.findMany({
    where: { gameId: game.id },
    include: { alleles: true },
    orderBy: { id: "asc" },
  })
  const sections = await db.conformationSection.findMany({
    where: { gameId: game.id },
    orderBy: { displayOrder: "asc" },
  })
  const discipline = await db.disciplineDef.findFirstOrThrow({ where: { gameId: game.id } })
  const noviceTier = await db.competitionTierDef.findFirstOrThrow({
    where: { gameId: game.id, disciplineDefId: discipline.id },
    orderBy: { tierIndex: "asc" },
  })

  const sharedCtx = {
    gameId: game.id,
    playerId: player.id,
    breedId: breed.id,
    disciplineId: discipline.id,
    noviceTierId: noviceTier.id,
    breedStatProfiles,
    breedPersonalityProfiles,
    allLoci,
    sections,
    lifeExpectancy,
    lifeStageId: "",
  }

  console.log(`\nAdding ${ANIMALS.length} animal(s) to game "${game.name}"...`)

  for (const config of ANIMALS) {
    const lifeStage = await db.lifeStageDef.findFirstOrThrow({
      where: { gameId: game.id, name: config.lifeStage },
    })
    await createAnimal(config, { ...sharedCtx, lifeStageId: lifeStage.id })
  }

  console.log(`\nDone.`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
