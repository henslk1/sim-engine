import { PrismaClient } from "./generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"

// Run via: pnpm --filter @sim-engine/db db:add-animal
// Safe to run against the live dev DB — does NOT reset anything.

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! })
const db = new PrismaClient({ adapter })

// ── CONFIGURE ─────────────────────────────────────────────────────────────────
const ANIMAL_NAME = "Nova"
const ANIMAL_SEX: "MALE" | "FEMALE" = "FEMALE"
const BREED_NAME = "Thoroughbred"
const LIFE_STAGE = "Adult"        // Foal | Adolescent | Adult | Senior
const AGE_IN_CYCLES = 48

// Locus name → [allele1Symbol, allele2Symbol]
// Only include loci you want the animal to carry genotypes for.
// Loci omitted here will simply have no genotype on this animal.
const GENOTYPE_CONFIG: Record<string, [string, string]> = {
  "Base Color": ["E", "e"],
  "Cream":      ["cr", "cr"],
  "Leg Length": ["L", "l"],
  "Nose":       ["N", "n"],
  "Shoulder":   ["Sh", "sh"],
  "Topline":    ["T", "t"],
  "HYPP":       ["HYPP", "hypp"],
  // Add your configured loci below, e.g.:
  // "HYPP":    ["N", "H"],
}

// Locus names to mark as tested by owner
const TESTED_LOCI: string[] = ["Base Color"]
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const game = await db.game.findFirstOrThrow({
    where: { slug: "equine-legends-seed" },
    include: { gameConfig: true },
  })
  const player = await db.playerAccount.findFirstOrThrow({ where: { gameId: game.id } })
  const breed = await db.breed.findFirstOrThrow({ where: { gameId: game.id, name: BREED_NAME } })
  const lifeStage = await db.lifeStageDef.findFirstOrThrow({ where: { gameId: game.id, name: LIFE_STAGE } })
  const discipline = await db.disciplineDef.findFirstOrThrow({ where: { gameId: game.id } })
  const noviceTier = await db.competitionTierDef.findFirstOrThrow({
    where: { gameId: game.id, disciplineDefId: discipline.id },
    orderBy: { tierIndex: "asc" },
  })
  const breedStatProfiles = await db.breedStatProfile.findMany({
    where: { breedId: breed.id },
    include: { statDef: true },
  })
  const breedPersonalityProfiles = await db.breedPersonalityProfile.findMany({
    where: { breedId: breed.id },
    include: { traitDef: { include: { labelRanges: true } } },
  })

  const lifeExpectancy =
    breed.lifeExpectancyBaseline ??
    game.gameConfig?.lifeExpectancyBaseline ??
    120

  const animal = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: breed.id,
      name: ANIMAL_NAME,
      sex: ANIMAL_SEX,
      lifeStageId: lifeStage.id,
      generation: 3,
      ageInCycles: AGE_IN_CYCLES,
      lifeExpectancy,
      disciplineDefId: discipline.id,
      fertility: 0.90,
      breedGeneration: 5,
    },
  })

  // Vitals
  await Promise.all([
    db.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 78, maxEnergy: 100 } }),
    db.animalMood.create({ data: { animalId: animal.id, value: 72 } }),
    db.animalCondition.create({ data: { animalId: animal.id, value: 82 } }),
    db.animalCareScore.create({ data: { animalId: animal.id, score: 80 } }),
    db.animalImmunity.create({ data: { animalId: animal.id, value: 68, innateMax: 90 } }),
  ])

  // Stats from breed profile baselines
  for (const sp of breedStatProfiles) {
    await db.animalStat.create({
      data: {
        animalId: animal.id,
        statDefId: sp.statDefId,
        innateValue: sp.baseline,
        trainedValue: 10,
      },
    })
  }

  // Personality from breed profile baselines
  for (const pp of breedPersonalityProfiles) {
    const label =
      pp.traitDef.labelRanges.find(
        (r) => pp.baseline >= r.minValue && pp.baseline < r.maxValue
      )?.label ?? "—"
    await db.animalPersonality.create({
      data: {
        animalId: animal.id,
        traitDefId: pp.traitDefId,
        value: pp.baseline,
        traitLabel: label,
      },
    })
  }

  // Breed composition + conformation score + competition tier
  await db.animalBreedComposition.create({
    data: { animalId: animal.id, breedId: breed.id, percentage: 100 },
  })
  await db.animalConformationScore.create({
    data: { animalId: animal.id, breedId: breed.id, score: 85.0 },
  })

  // Section scores — placeholder values until engine calculates real ones
  const sections = await db.conformationSection.findMany({
    where: { gameId: game.id },
    orderBy: { displayOrder: "asc" },
  })
  const placeholderScores = [82, 75, 88, 71, 79, 84, 68]
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (!section) continue
    await db.animalConformationSectionScore.create({
      data: {
        animalId: animal.id,
        breedId: breed.id,
        sectionId: section.id,
        score: placeholderScores[i % placeholderScores.length] ?? 75,
      },
    })
  }
  await db.animalCompetitionTier.create({
    data: { animalId: animal.id, disciplineDefId: discipline.id, tierDefId: noviceTier.id },
  })

  // Genotypes
  let genotypeCount = 0
  for (const [locusName, [sym1, sym2]] of Object.entries(GENOTYPE_CONFIG)) {
    const locus = await db.locus.findFirst({
      where: { gameId: game.id, name: locusName },
      include: { alleles: true },
    })
    if (!locus) {
      console.warn(`  ⚠ Locus "${locusName}" not found — skipping`)
      continue
    }
    const a1 = locus.alleles.find((a) => a.symbol === sym1)
    const a2 = locus.alleles.find((a) => a.symbol === sym2)
    if (!a1) { console.warn(`  ⚠ Allele "${sym1}" not found on locus "${locusName}" — skipping`); continue }
    if (!a2) { console.warn(`  ⚠ Allele "${sym2}" not found on locus "${locusName}" — skipping`); continue }
    const isTested = TESTED_LOCI.includes(locusName)
    await db.animalGenotype.create({
      data: {
        animalId: animal.id,
        locusId: locus.id,
        alleleOneId: a1.id,
        alleleTwoId: a2.id,
        isTestedByOwner: isTested,
        testedAt: isTested ? new Date() : null,
      },
    })
    genotypeCount++
  }

  console.log(`\nCreated "${ANIMAL_NAME}" (ID: ${animal.id})`)
  console.log(`  Breed: ${BREED_NAME} · Stage: ${LIFE_STAGE} · Age: ${AGE_IN_CYCLES} cycles`)
  console.log(`  Stats: ${breedStatProfiles.length} · Genotypes: ${genotypeCount}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
