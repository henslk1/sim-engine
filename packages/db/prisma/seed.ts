import { PrismaClient } from "./generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! })
const db = new PrismaClient({ adapter })

// Run via: pnpm --filter @sim-engine/db db:seed
// Or after a reset: pnpm --filter @sim-engine/db prisma migrate reset
// The seed is NOT idempotent — run against a fresh DB or after migrate reset.

async function main() {
  console.log("Seeding database...")

  // ── GAME ─────────────────────────────────────────────────────────────────
  const game = await db.game.create({
    data: {
      name: "Equine Legends",
      slug: "equine-legends-seed",
      isActive: true,
      gameConfig: {
        create: {
          defaultInnateRatio: 0.6,
          trainingCeilingMultiplier: 1.5,
          pedigreeDisplayDepth: 4,
          predictorDailyLimitFree: 3,
          containerLabel: "Stable",
          subContainerLabel: "Stall",
          gestationCycles: 12,
          moodDecayRate: 0.5,
          conditionDecayRate: 0.3,
          conditionWorkGain: 2.0,
          careScoreDecayRate: 1.0,
          careScoreFloor: 0,
          careScoreCeiling: 100,
          careScoreRecoveryRate: 5.0,
          immunityDecayRate: 0.2,
          immunityRecoveryRate: 1.0,
          immunityMin: 0,
          immunityMax: 100,
          energyLowCareThreshold: 20,
          energyLowCarePenalty: 5.0,
          cyclesPerYear: 12,
          lifeExpectancyBaseline: 120,
        },
      },
    },
  })

  // ── SPECIES ───────────────────────────────────────────────────────────────
  const species = await db.species.create({
    data: { gameId: game.id, name: "Horse" },
  })

  // ── LIFE STAGES ───────────────────────────────────────────────────────────
  const foalStage = await db.lifeStageDef.create({
    data: {
      gameId: game.id,
      name: "Foal",
      stageIndex: 0,
      minCycle: 0,
      ageCap: 12,
      canCompete: false,
      canBreed: false,
      canTrain: false,
      canReceiveCare: true,
      profileLayout: "foal",
      immunityCapMultiplier: 0.6,
    },
  })

  const adolescentStage = await db.lifeStageDef.create({
    data: {
      gameId: game.id,
      name: "Adolescent",
      stageIndex: 1,
      minCycle: 12,
      ageCap: 36,
      canCompete: false,
      canBreed: false,
      canTrain: true,
      canReceiveCare: true,
      profileLayout: "adolescent",
      immunityCapMultiplier: 0.8,
    },
  })

  const adultStage = await db.lifeStageDef.create({
    data: {
      gameId: game.id,
      name: "Adult",
      stageIndex: 2,
      minCycle: 36,
      ageCap: 96,
      canCompete: true,
      canBreed: true,
      canTrain: true,
      canReceiveCare: true,
      profileLayout: "adult",
      immunityCapMultiplier: 1.0,
    },
  })

  const seniorStage = await db.lifeStageDef.create({
    data: {
      gameId: game.id,
      name: "Senior",
      stageIndex: 3,
      minCycle: 96,
      ageCap: 144,
      canCompete: true,
      canBreed: false,
      canTrain: false,
      canReceiveCare: true,
      profileLayout: "senior",
      immunityCapMultiplier: 0.7,
      deathChanceStartCycle: 96,
      deathChancePerCycle: 0.05,
    },
  })

  // ── STAT DEFS ─────────────────────────────────────────────────────────────
  const speedStat = await db.statDef.create({ data: { gameId: game.id, name: "Speed" } })
  const enduranceStat = await db.statDef.create({ data: { gameId: game.id, name: "Endurance" } })
  const agilityStat = await db.statDef.create({ data: { gameId: game.id, name: "Agility" } })

  // ── PERSONALITY TRAIT DEFS ────────────────────────────────────────────────
  const temperamentTrait = await db.personalityTraitDef.create({
    data: {
      gameId: game.id,
      name: "Temperament",
      description: "How calm or spirited the horse is",
      trainingModifier: 0.05,
      moodModifier: 0.03,
      labelRanges: {
        createMany: {
          data: [
            { label: "Gentle", minValue: 0, maxValue: 33 },
            { label: "Even-Keeled", minValue: 33, maxValue: 66 },
            { label: "Spirited", minValue: 66, maxValue: 100 },
          ],
        },
      },
    },
  })

  const driveTrait = await db.personalityTraitDef.create({
    data: {
      gameId: game.id,
      name: "Drive",
      description: "How motivated the horse is during competition",
      trainingModifier: 0.08,
      labelRanges: {
        createMany: {
          data: [
            { label: "Relaxed", minValue: 0, maxValue: 33 },
            { label: "Focused", minValue: 33, maxValue: 66 },
            { label: "Driven", minValue: 66, maxValue: 100 },
          ],
        },
      },
    },
  })

  // ── CARE ACTION DEFS ──────────────────────────────────────────────────────
  const feedAction = await db.careActionDef.create({
    data: {
      gameId: game.id,
      name: "Feed",
      costType: "FREE",
      careScoreGain: 5.0,
      energyRestore: 15.0,
      moodBoost: 3.0,
    },
  })

  await db.careActionDef.create({
    data: {
      gameId: game.id,
      name: "Groom",
      costType: "FREE",
      careScoreGain: 8.0,
      energyRestore: 0.0,
      moodBoost: 8.0,
    },
  })

  // ── LONG TERM CARE ────────────────────────────────────────────────────────
  const dentalCheck = await db.longTermCareActionDef.create({
    data: {
      gameId: game.id,
      name: "Dental Check",
      intervalCycles: 12,
      gracePeriodCycles: 2,
    },
  })

  // ── CURRENCY ──────────────────────────────────────────────────────────────
  const goldCurrency = await db.currencyDef.create({
    data: {
      gameId: game.id,
      name: "Gold",
      currencyType: "BASE",
      symbol: "G",
    },
  })

  // ── DISCIPLINE ────────────────────────────────────────────────────────────
  const racingDiscipline = await db.disciplineDef.create({
    data: {
      gameId: game.id,
      name: "Racing",
      description: "Flat track racing",
      isConformation: false,
      statWeights: {
        createMany: {
          data: [
            { statDefId: speedStat.id, weight: 0.6 },
            { statDefId: enduranceStat.id, weight: 0.3 },
            { statDefId: agilityStat.id, weight: 0.1 },
          ],
        },
      },
      personalityWeights: {
        createMany: {
          data: [
            { traitDefId: driveTrait.id, weight: 0.7 },
            { traitDefId: temperamentTrait.id, weight: 0.3 },
          ],
        },
      },
    },
  })

  // ── COMPETITION TIER DEFS ─────────────────────────────────────────────────
  const noviceTier = await db.competitionTierDef.create({
    data: {
      gameId: game.id,
      disciplineDefId: racingDiscipline.id,
      name: "Novice",
      tierIndex: 0,
      minScore: 0,
      advancementThreshold: 75,
      energyCost: 10,
      entryFee: 50,
      tierPrizes: {
        createMany: {
          data: [
            { placement: 1, currencyDefId: goldCurrency.id, amount: 200, isInvitational: false },
            { placement: 2, currencyDefId: goldCurrency.id, amount: 100, isInvitational: false },
            { placement: 3, currencyDefId: goldCurrency.id, amount: 50, isInvitational: false },
          ],
        },
      },
    },
  })

  const openTier = await db.competitionTierDef.create({
    data: {
      gameId: game.id,
      disciplineDefId: racingDiscipline.id,
      name: "Open",
      tierIndex: 1,
      minScore: 75,
      advancementThreshold: 90,
      energyCost: 20,
      entryFee: 150,
    },
  })

  // ── INTENSITY TIER DEFS ───────────────────────────────────────────────────
  const lowIntensity = await db.intensityTierDef.create({
    data: {
      gameId: game.id,
      name: "Light",
      tierIndex: 0,
      energyCost: 5,
      gainMultiplier: 0.7,
      minMood: 20,
    },
  })

  const highIntensity = await db.intensityTierDef.create({
    data: {
      gameId: game.id,
      name: "Intense",
      tierIndex: 1,
      energyCost: 15,
      gainMultiplier: 1.3,
      minMood: 40,
      minCondition: 50,
    },
  })

  // ── TRAINING ACTION DEFS ──────────────────────────────────────────────────
  const speedTraining = await db.trainingActionDef.create({
    data: { gameId: game.id, name: "Sprint Drills", statDefId: speedStat.id, baseGain: 2.0 },
  })

  const agilityTraining = await db.trainingActionDef.create({
    data: { gameId: game.id, name: "Pole Work", statDefId: agilityStat.id, baseGain: 2.0 },
  })

  await db.trainingActionDef.create({
    data: { gameId: game.id, name: "Distance Run", statDefId: enduranceStat.id, baseGain: 2.0 },
  })

  // ── GENETICS ──────────────────────────────────────────────────────────────
  const baseColorLocus = await db.locus.create({
    data: {
      gameId: game.id,
      name: "Base Color",
      displayGroup: "Color",
      biasTarget: "NONE",
      alleles: {
        createMany: {
          data: [{ symbol: "E" }, { symbol: "e" }],
        },
      },
    },
    include: { alleles: true },
  })

  const creamLocus = await db.locus.create({
    data: {
      gameId: game.id,
      name: "Cream",
      displayGroup: "Color",
      biasTarget: "NONE",
      alleles: {
        createMany: {
          data: [{ symbol: "Cr" }, { symbol: "cr" }],
        },
      },
    },
    include: { alleles: true },
  })

  const alleleE = baseColorLocus.alleles.find((a) => a.symbol === "E")!
  const allelee = baseColorLocus.alleles.find((a) => a.symbol === "e")!
  const alleleCr = creamLocus.alleles.find((a) => a.symbol === "Cr")!
  const allelecr = creamLocus.alleles.find((a) => a.symbol === "cr")!

  await db.expressionRule.createMany({
    data: [
      { locusId: baseColorLocus.id, alleleOneId: alleleE.id, alleleTwoId: alleleE.id, phenotype: "Black" },
      { locusId: baseColorLocus.id, alleleOneId: alleleE.id, alleleTwoId: allelee.id, phenotype: "Black" },
      { locusId: baseColorLocus.id, alleleOneId: allelee.id, alleleTwoId: allelee.id, phenotype: "Chestnut" },
      { locusId: creamLocus.id, alleleOneId: alleleCr.id, alleleTwoId: alleleCr.id, phenotype: "Double Cream" },
      { locusId: creamLocus.id, alleleOneId: alleleCr.id, alleleTwoId: allelecr.id, phenotype: "Single Cream" },
      { locusId: creamLocus.id, alleleOneId: allelecr.id, alleleTwoId: allelecr.id, phenotype: "No Dilution" },
    ],
  })

  const colorPanel = await db.geneticPanelDef.create({
    data: {
      gameId: game.id,
      name: "Color Panel",
      panelType: "CONFORMATION",
      loci: {
        createMany: {
          data: [{ locusId: baseColorLocus.id }, { locusId: creamLocus.id }],
        },
      },
    },
  })

  // ── HEALTH ────────────────────────────────────────────────────────────────
  const lamenessCondition = await db.healthConditionDef.create({
    data: {
      gameId: game.id,
      name: "Lameness",
      conditionType: "INJURY",
      isGenetic: false,
      isFatal: false,
      moodEffect: -15,
      energyEffect: -20,
    },
  })

  const lamenessTreatment = await db.treatmentDef.create({
    data: {
      conditionDefId: lamenessCondition.id,
      name: "Rest & Poultice",
      treatmentType: "PLAYER_ACTION",
      durationCycles: 3,
    },
  })

  const cogginsTest = await db.healthCertificateDef.create({
    data: {
      gameId: game.id,
      name: "Coggins Test",
      validForCycles: 12,
      requiredForCompetition: true,
    },
  })

  // ── VET SERVICE ───────────────────────────────────────────────────────────
  const examService = await db.vetServiceDef.create({
    data: {
      gameId: game.id,
      name: "Wellness Exam",
      serviceType: "EXAM",
      baseCost: 100,
      currencyDefId: goldCurrency.id,
    },
  })

  // ── TITLE DEF ─────────────────────────────────────────────────────────────
  const championTitle = await db.titleDef.create({
    data: {
      gameId: game.id,
      name: "Champion",
      description: "Won 3+ open class competitions",
      disciplineDefId: racingDiscipline.id,
      rankOrder: 1,
    },
  })

  // ── VENUE ─────────────────────────────────────────────────────────────────
  await db.venue.create({
    data: {
      gameId: game.id,
      name: "Greenfield Park",
      climate: "TEMPERATE",
      terrain: "FLAT",
      disciplines: {
        create: {
          disciplineDefId: racingDiscipline.id,
          defaultMaxEntries: 12,
          defaultMaxWaitHours: 24,
          isInvitationalEligible: true,
          invitationalMaxEntries: 8,
          invitationalMaxWaitHours: 48,
          maxOpenAtOnce: 2,
        },
      },
    },
  })

  // ── STAGE ACTIVITIES ──────────────────────────────────────────────────────
  const foalPlayActivity = await db.stageActivityDef.create({
    data: {
      gameId: game.id,
      lifeStageId: foalStage.id,
      traitDefId: driveTrait.id,
      name: "Playful Exploration",
      traitEffect: 3.0,
      energyCost: 5,
      description: "Let the foal explore and play freely",
    },
  })

  const adolescentBoldActivity = await db.stageActivityDef.create({
    data: {
      gameId: game.id,
      lifeStageId: adolescentStage.id,
      traitDefId: temperamentTrait.id,
      name: "Bold Challenge",
      traitEffect: 4.0,
      energyCost: 8,
      description: "Introduce the adolescent to challenging environments",
    },
  })

  // ── BREED ─────────────────────────────────────────────────────────────────
  const thoroughbred = await db.breed.create({
    data: {
      gameId: game.id,
      name: "Thoroughbred",
      speciesId: species.id,
      categoryBadge: "BASE",
      lifeExpectancyBaseline: 120,
      immunityMin: 20,
      immunityMax: 95,
      statProfile: {
        createMany: {
          data: [
            { statDefId: speedStat.id, weight: 0.5, naturalMin: 60, naturalMax: 95, baseline: 78 },
            { statDefId: enduranceStat.id, weight: 0.3, naturalMin: 55, naturalMax: 90, baseline: 72 },
            { statDefId: agilityStat.id, weight: 0.2, naturalMin: 50, naturalMax: 85, baseline: 67 },
          ],
        },
      },
      personalityProfiles: {
        createMany: {
          data: [
            { traitDefId: temperamentTrait.id, naturalMin: 40, naturalMax: 90, baseline: 65 },
            { traitDefId: driveTrait.id, naturalMin: 50, naturalMax: 95, baseline: 72 },
          ],
        },
      },
      alleleFrequencies: {
        createMany: {
          data: [
            { alleleId: alleleE.id, frequency: 0.7 },
            { alleleId: allelee.id, frequency: 0.3 },
            { alleleId: alleleCr.id, frequency: 0.15 },
            { alleleId: allelecr.id, frequency: 0.85 },
          ],
        },
      },
      conformationStandards: {
        createMany: {
          data: [{ locusId: baseColorLocus.id, idealExpressionLabel: "Black", weight: 0.3 }],
        },
      },
    },
  })

  // ── USER & PLAYER ─────────────────────────────────────────────────────────
  const user = await db.user.create({
    data: {
      email: "seed-player@equine-legends.dev",
      name: "Seed Player",
      emailVerified: true,
    },
  })

  const player = await db.playerAccount.create({
    data: {
      userId: user.id,
      gameId: game.id,
      username: "SeedPlayer",
      playerBalances: {
        create: { currencyDefId: goldCurrency.id, balance: 5000 },
      },
    },
  })

  // ── HELPERS ───────────────────────────────────────────────────────────────
  type VitalsOpts = {
    energyCurrent?: number
    moodValue?: number
    conditionValue?: number
    careScore?: number
    immunityValue?: number
    immunityInnateMax?: number
  }

  async function createVitals(animalId: string, opts: VitalsOpts = {}) {
    const {
      energyCurrent = 75,
      moodValue = 70,
      conditionValue = 80,
      careScore = 78,
      immunityValue = 65,
      immunityInnateMax = 88,
    } = opts
    await Promise.all([
      db.animalEnergy.create({ data: { animalId, currentEnergy: energyCurrent, maxEnergy: 100 } }),
      db.animalMood.create({ data: { animalId, value: moodValue } }),
      db.animalCondition.create({ data: { animalId, value: conditionValue } }),
      db.animalCareScore.create({ data: { animalId, score: careScore } }),
      db.animalImmunity.create({ data: { animalId, value: immunityValue, innateMax: immunityInnateMax } }),
    ])
  }

  async function createGenotypes(animalId: string, testedBaseColor = false) {
    await db.animalGenotype.createMany({
      data: [
        {
          animalId,
          locusId: baseColorLocus.id,
          alleleOneId: alleleE.id,
          alleleTwoId: allelee.id,
          isTestedByOwner: testedBaseColor,
          testedAt: testedBaseColor ? new Date() : null,
        },
        {
          animalId,
          locusId: creamLocus.id,
          alleleOneId: allelecr.id,
          alleleTwoId: allelecr.id,
          isTestedByOwner: false,
        },
      ],
    })
  }

  // ── ANIMAL 1: Adult Male "Blaze" — full dataset ───────────────────────────
  const blaze = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Blaze",
      sex: "MALE",
      lifeStageId: adultStage.id,
      generation: 3,
      ageInCycles: 52,
      lifeExpectancy: 118,
      disciplineDefId: racingDiscipline.id,
      inbreedingCoefficient: 0.03,
      fertility: 0.92,
      breedGeneration: 5,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: blaze.id, statDefId: speedStat.id, innateValue: 82, trainedValue: 18 },
      { animalId: blaze.id, statDefId: enduranceStat.id, innateValue: 74, trainedValue: 12 },
      { animalId: blaze.id, statDefId: agilityStat.id, innateValue: 69, trainedValue: 8 },
    ],
  })
  await createVitals(blaze.id, { energyCurrent: 80, moodValue: 75, conditionValue: 85, careScore: 88, immunityValue: 72, immunityInnateMax: 92 })
  await db.animalPersonality.createMany({
    data: [
      { animalId: blaze.id, traitDefId: temperamentTrait.id, value: 65, traitLabel: "Even-Keeled" },
      { animalId: blaze.id, traitDefId: driveTrait.id, value: 78, traitLabel: "Driven" },
    ],
  })
  await createGenotypes(blaze.id, true)
  await db.animalBreedComposition.create({ data: { animalId: blaze.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalConformationScore.create({ data: { animalId: blaze.id, breedId: thoroughbred.id, score: 91.5 } })
  await db.animalCompetitionTier.create({ data: { animalId: blaze.id, disciplineDefId: racingDiscipline.id, tierDefId: openTier.id } })
  await db.animalTitle.create({ data: { animalId: blaze.id, titleDefId: championTitle.id, cycleNumber: 46 } })
  await db.animalLongTermCareRecord.create({
    data: { animalId: blaze.id, longTermCareActionDefId: dentalCheck.id, lastPerformedCycle: 48, nextDueCycle: 60 },
  })
  await db.careLog.create({
    data: { animalId: blaze.id, careActionDefId: feedAction.id, cycleNumber: 52, performedByPlayerId: player.id },
  })
  await db.trainingLog.create({
    data: {
      animalId: blaze.id,
      trainingActionDefId: speedTraining.id,
      intensityTierDefId: highIntensity.id,
      cycleNumber: 52,
      statGained: 2.6,
      energyUsed: 15,
      performedByPlayerId: player.id,
    },
  })
  const blazeHealthRecord = await db.animalHealthRecord.create({
    data: {
      animalId: blaze.id,
      conditionDefId: lamenessCondition.id,
      diagnosedCycle: 38,
      resolvedCycle: 41,
      resolvedAt: new Date("2025-01-20"),
      isActive: false,
    },
  })
  await db.animalTreatmentRecord.create({
    data: {
      animalId: blaze.id,
      treatmentDefId: lamenessTreatment.id,
      healthRecordId: blazeHealthRecord.id,
      startedCycle: 38,
      completedCycle: 41,
      completedAt: new Date("2025-01-20"),
      isActive: false,
    },
  })
  await db.vetVisitLog.create({
    data: { animalId: blaze.id, playerAccountId: player.id, vetServiceDefId: examService.id, visitCycle: 50 },
  })
  await db.healthCertificate.create({
    data: { animalId: blaze.id, certDefId: cogginsTest.id, issuedCycle: 48, expiresAtCycle: 60 },
  })
  await db.animalWeeklyPoints.create({
    data: { animalId: blaze.id, disciplineDefId: racingDiscipline.id, weekStart: new Date("2026-06-30"), points: 145 },
  })

  // ── ANIMAL 2: Adult Female "Duchess" ──────────────────────────────────────
  const duchess = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Duchess",
      sex: "FEMALE",
      lifeStageId: adultStage.id,
      generation: 2,
      ageInCycles: 44,
      lifeExpectancy: 122,
      disciplineDefId: racingDiscipline.id,
      fertility: 0.88,
      breedGeneration: 4,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: duchess.id, statDefId: speedStat.id, innateValue: 79, trainedValue: 14 },
      { animalId: duchess.id, statDefId: enduranceStat.id, innateValue: 77, trainedValue: 10 },
      { animalId: duchess.id, statDefId: agilityStat.id, innateValue: 72, trainedValue: 6 },
    ],
  })
  await createVitals(duchess.id)
  await db.animalPersonality.createMany({
    data: [
      { animalId: duchess.id, traitDefId: temperamentTrait.id, value: 55, traitLabel: "Even-Keeled" },
      { animalId: duchess.id, traitDefId: driveTrait.id, value: 70, traitLabel: "Driven" },
    ],
  })
  await createGenotypes(duchess.id)
  await db.animalBreedComposition.create({ data: { animalId: duchess.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalCompetitionTier.create({ data: { animalId: duchess.id, disciplineDefId: racingDiscipline.id, tierDefId: noviceTier.id } })

  // ── ANIMAL 3: Pregnant Female "Meadow" ────────────────────────────────────
  const meadow = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Meadow",
      sex: "FEMALE",
      lifeStageId: adultStage.id,
      generation: 2,
      ageInCycles: 40,
      fertility: 0.91,
      breedGeneration: 3,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: meadow.id, statDefId: speedStat.id, innateValue: 76, trainedValue: 8 },
      { animalId: meadow.id, statDefId: enduranceStat.id, innateValue: 81, trainedValue: 5 },
      { animalId: meadow.id, statDefId: agilityStat.id, innateValue: 70, trainedValue: 3 },
    ],
  })
  await createVitals(meadow.id, { energyCurrent: 65, moodValue: 72, conditionValue: 76, careScore: 82, immunityValue: 60, immunityInnateMax: 85 })
  await db.animalPersonality.createMany({
    data: [
      { animalId: meadow.id, traitDefId: temperamentTrait.id, value: 42, traitLabel: "Even-Keeled" },
      { animalId: meadow.id, traitDefId: driveTrait.id, value: 58, traitLabel: "Focused" },
    ],
  })
  await createGenotypes(meadow.id)
  await db.animalBreedComposition.create({ data: { animalId: meadow.id, breedId: thoroughbred.id, percentage: 100 } })

  const breedingRecord = await db.breedingRecord.create({
    data: {
      gameId: game.id,
      sireId: blaze.id,
      damId: meadow.id,
      sireSnapshot: { name: "Blaze", generation: 3, breedName: "Thoroughbred" },
      damSnapshot: { name: "Meadow", generation: 2, breedName: "Thoroughbred" },
    },
  })

  await db.pregnancy.create({
    data: {
      animalId: meadow.id,
      breedingRecordId: breedingRecord.id,
      currentCycles: 5,
      requiredCycles: 12,
    },
  })

  // ── ANIMAL 4: Foal "Pip" ──────────────────────────────────────────────────
  const pip = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Pip",
      sex: "FEMALE",
      lifeStageId: foalStage.id,
      generation: 4,
      ageInCycles: 3,
      fertility: 0.85,
      breedGeneration: 6,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: pip.id, statDefId: speedStat.id, innateValue: 71 },
      { animalId: pip.id, statDefId: enduranceStat.id, innateValue: 68 },
      { animalId: pip.id, statDefId: agilityStat.id, innateValue: 73 },
    ],
  })
  await createVitals(pip.id, { energyCurrent: 90, moodValue: 85, conditionValue: 90, careScore: 70, immunityValue: 50, immunityInnateMax: 78 })
  await db.animalPersonality.createMany({
    data: [
      { animalId: pip.id, traitDefId: temperamentTrait.id, value: 28, traitLabel: "Gentle" },
      { animalId: pip.id, traitDefId: driveTrait.id, value: 45, traitLabel: "Relaxed" },
    ],
  })
  await createGenotypes(pip.id)
  await db.animalBreedComposition.create({ data: { animalId: pip.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.stageActivityLog.create({
    data: { animalId: pip.id, stageActivityDefId: foalPlayActivity.id, cycleNumber: 3, performedByPlayerId: player.id },
  })

  // ── ANIMAL 5: Adolescent "Sparks" ─────────────────────────────────────────
  const sparks = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Sparks",
      sex: "MALE",
      lifeStageId: adolescentStage.id,
      generation: 3,
      ageInCycles: 20,
      fertility: 0.87,
      breedGeneration: 4,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: sparks.id, statDefId: speedStat.id, innateValue: 79, trainedValue: 5 },
      { animalId: sparks.id, statDefId: enduranceStat.id, innateValue: 72, trainedValue: 3 },
      { animalId: sparks.id, statDefId: agilityStat.id, innateValue: 76, trainedValue: 2 },
    ],
  })
  await createVitals(sparks.id, { energyCurrent: 88, moodValue: 80, conditionValue: 85, careScore: 74, immunityValue: 68, immunityInnateMax: 86 })
  await db.animalPersonality.createMany({
    data: [
      { animalId: sparks.id, traitDefId: temperamentTrait.id, value: 78, traitLabel: "Spirited" },
      { animalId: sparks.id, traitDefId: driveTrait.id, value: 62, traitLabel: "Focused" },
    ],
  })
  await createGenotypes(sparks.id)
  await db.animalBreedComposition.create({ data: { animalId: sparks.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.stageActivityLog.create({
    data: { animalId: sparks.id, stageActivityDefId: adolescentBoldActivity.id, cycleNumber: 20, performedByPlayerId: player.id },
  })
  await db.trainingLog.create({
    data: {
      animalId: sparks.id,
      trainingActionDefId: agilityTraining.id,
      intensityTierDefId: lowIntensity.id,
      cycleNumber: 19,
      statGained: 1.4,
      energyUsed: 5,
      performedByPlayerId: player.id,
    },
  })

  // ── ANIMAL 6: Senior "Elder" ──────────────────────────────────────────────
  const elder = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Elder",
      sex: "MALE",
      lifeStageId: seniorStage.id,
      generation: 1,
      ageInCycles: 108,
      lifeExpectancy: 115,
      disciplineDefId: racingDiscipline.id,
      fertility: 0.3,
      breedGeneration: 2,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: elder.id, statDefId: speedStat.id, innateValue: 88, trainedValue: 42 },
      { animalId: elder.id, statDefId: enduranceStat.id, innateValue: 81, trainedValue: 35 },
      { animalId: elder.id, statDefId: agilityStat.id, innateValue: 76, trainedValue: 28 },
    ],
  })
  await createVitals(elder.id, { energyCurrent: 55, moodValue: 65, conditionValue: 60, careScore: 90, immunityValue: 45, immunityInnateMax: 70 })
  await db.animalPersonality.createMany({
    data: [
      { animalId: elder.id, traitDefId: temperamentTrait.id, value: 60, traitLabel: "Even-Keeled" },
      { animalId: elder.id, traitDefId: driveTrait.id, value: 85, traitLabel: "Driven" },
    ],
  })
  await createGenotypes(elder.id, true)
  await db.animalBreedComposition.create({ data: { animalId: elder.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalConformationScore.create({ data: { animalId: elder.id, breedId: thoroughbred.id, score: 87.0 } })
  await db.animalCompetitionTier.create({ data: { animalId: elder.id, disciplineDefId: racingDiscipline.id, tierDefId: openTier.id } })
  await db.animalTitle.create({ data: { animalId: elder.id, titleDefId: championTitle.id, cycleNumber: 60 } })

  // ── ANIMAL 7: Deceased "Ghost" ────────────────────────────────────────────
  const ghost = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Ghost",
      sex: "FEMALE",
      lifeStageId: seniorStage.id,
      status: "DECEASED",
      generation: 2,
      ageInCycles: 121,
      diedAt: new Date("2026-06-15"),
      causeOfDeath: "Natural causes",
      lifeExpectancy: 120,
      fertility: 0.0,
      breedGeneration: 3,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: ghost.id, statDefId: speedStat.id, innateValue: 75, trainedValue: 30 },
      { animalId: ghost.id, statDefId: enduranceStat.id, innateValue: 79, trainedValue: 25 },
      { animalId: ghost.id, statDefId: agilityStat.id, innateValue: 65, trainedValue: 18 },
    ],
  })
  await db.animalBreedComposition.create({ data: { animalId: ghost.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── ANIMAL 8: Buried "Ash" ────────────────────────────────────────────────
  const ash = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Ash",
      sex: "MALE",
      lifeStageId: adultStage.id,
      status: "BURIED",
      generation: 2,
      ageInCycles: 67,
      diedAt: new Date("2026-05-01"),
      causeOfDeath: "Colic",
      fertility: 0.0,
      breedGeneration: 3,
    },
  })

  await db.animalStat.createMany({
    data: [
      { animalId: ash.id, statDefId: speedStat.id, innateValue: 80, trainedValue: 22 },
      { animalId: ash.id, statDefId: enduranceStat.id, innateValue: 73, trainedValue: 15 },
      { animalId: ash.id, statDefId: agilityStat.id, innateValue: 70, trainedValue: 10 },
    ],
  })
  await db.animalBreedComposition.create({ data: { animalId: ash.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── BLAZE ANCESTORS ──────────────────────────────────────────────────────
  const thunderstrike = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Thunderstrike",
      sex: "MALE",
      lifeStageId: seniorStage.id,
      status: "DECEASED",
      generation: 2,
      ageInCycles: 116,
      diedAt: new Date("2024-01-01"),
      inbreedingCoefficient: 0.0,
      fertility: 0.0,
      breedGeneration: 4,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: thunderstrike.id, breedId: thoroughbred.id, percentage: 100 } })

  const silverBell = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Silver Bell",
      sex: "FEMALE",
      lifeStageId: seniorStage.id,
      status: "DECEASED",
      generation: 2,
      ageInCycles: 114,
      diedAt: new Date("2024-06-01"),
      inbreedingCoefficient: 0.01,
      fertility: 0.0,
      breedGeneration: 4,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: silverBell.id, breedId: thoroughbred.id, percentage: 100 } })

  const ironDuke = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Iron Duke",
      sex: "MALE",
      lifeStageId: seniorStage.id,
      status: "DECEASED",
      generation: 1,
      ageInCycles: 120,
      diedAt: new Date("2022-03-01"),
      inbreedingCoefficient: 0.0,
      fertility: 0.0,
      breedGeneration: 3,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: ironDuke.id, breedId: thoroughbred.id, percentage: 100 } })

  const morningFrost = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Morning Frost",
      sex: "FEMALE",
      lifeStageId: seniorStage.id,
      generation: 1,
      ageInCycles: 98,
      inbreedingCoefficient: 0.0,
      fertility: 0.0,
      breedGeneration: 3,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: morningFrost.id, breedId: thoroughbred.id, percentage: 100 } })

  await db.animalAncestor.createMany({
    data: [
      { animalId: blaze.id, ancestorId: thunderstrike.id, depth: 1 },
      { animalId: blaze.id, ancestorId: silverBell.id, depth: 1 },
      { animalId: blaze.id, ancestorId: ironDuke.id, depth: 2 },
      { animalId: blaze.id, ancestorId: morningFrost.id, depth: 2 },
    ],
  })

  // ── BLAZE OFFSPRING ───────────────────────────────────────────────────────
  const pastBreedingRecord = await db.breedingRecord.create({
    data: {
      gameId: game.id,
      sireId: blaze.id,
      damId: duchess.id,
      sireSnapshot: { name: "Blaze", generation: 3, breedName: "Thoroughbred" },
      damSnapshot: { name: "Duchess", generation: 2, breedName: "Thoroughbred" },
    },
  })

  const completedPregnancy = await db.pregnancy.create({
    data: {
      animalId: duchess.id,
      breedingRecordId: pastBreedingRecord.id,
      currentCycles: 12,
      requiredCycles: 12,
      isCompleted: true,
      completedAt: new Date("2025-10-01"),
    },
  })

  const storm = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Storm",
      sex: "MALE",
      lifeStageId: foalStage.id,
      generation: 4,
      ageInCycles: 6,
      inbreedingCoefficient: 0.015,
      fertility: 0.9,
      breedGeneration: 6,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: storm.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalStat.createMany({
    data: [
      { animalId: storm.id, statDefId: speedStat.id, innateValue: 80 },
      { animalId: storm.id, statDefId: enduranceStat.id, innateValue: 76 },
      { animalId: storm.id, statDefId: agilityStat.id, innateValue: 71 },
    ],
  })
  await createVitals(storm.id, { energyCurrent: 92, moodValue: 88, conditionValue: 92, careScore: 72, immunityValue: 52, immunityInnateMax: 80 })

  const ember = await db.animal.create({
    data: {
      gameId: game.id,
      playerAccountId: player.id,
      breedId: thoroughbred.id,
      name: "Ember",
      sex: "FEMALE",
      lifeStageId: foalStage.id,
      generation: 4,
      ageInCycles: 6,
      inbreedingCoefficient: 0.015,
      fertility: 0.9,
      breedGeneration: 6,
    },
  })
  await db.animalBreedComposition.create({ data: { animalId: ember.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalStat.createMany({
    data: [
      { animalId: ember.id, statDefId: speedStat.id, innateValue: 77 },
      { animalId: ember.id, statDefId: enduranceStat.id, innateValue: 79 },
      { animalId: ember.id, statDefId: agilityStat.id, innateValue: 74 },
    ],
  })
  await createVitals(ember.id, { energyCurrent: 90, moodValue: 85, conditionValue: 90, careScore: 68, immunityValue: 50, immunityInnateMax: 78 })

  await db.pregnancyOffspring.createMany({
    data: [
      { animalId: storm.id, pregnancyId: completedPregnancy.id, birthOrder: 1 },
      { animalId: ember.id, pregnancyId: completedPregnancy.id, birthOrder: 2 },
    ],
  })

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(`\nSeed complete!`)
  console.log(`  Game:   ${game.name} (ID: ${game.id})`)
  console.log(`  Player: ${player.username} (ID: ${player.id})`)
  console.log(`  Animals: Blaze · Duchess · Meadow · Pip · Sparks · Elder · Ghost · Ash · Storm · Ember`)
  console.log(`\nAnimal IDs for tRPC testing:`)
  console.log(`  Blaze (adult male, ancestors + offspring): ${blaze.id}`)
  console.log(`  Duchess (adult female):                    ${duchess.id}`)
  console.log(`  Meadow (pregnant):                         ${meadow.id}`)
  console.log(`  Pip (foal):                                ${pip.id}`)
  console.log(`  Sparks (adolescent):                       ${sparks.id}`)
  console.log(`  Elder (senior):                            ${elder.id}`)
  console.log(`  Ghost (deceased):                          ${ghost.id}`)
  console.log(`  Ash (buried):                              ${ash.id}`)
  console.log(`  Storm (foal, offspring of Blaze):          ${storm.id}`)
  console.log(`  Ember (foal, offspring of Blaze):          ${ember.id}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
