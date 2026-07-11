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
          pedigreeDisplayDepth: 3,
          predictorDailyLimitFree: 3,
          containerLabel: "Stable",
          subContainerLabel: "Stall",
          maxLocusTestsPerCycle: 2,
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
  const species = await db.species.create({ data: { gameId: game.id, name: "Horse" } })

  // ── LIFE STAGES ───────────────────────────────────────────────────────────
  const foalStage = await db.lifeStageDef.create({ data: { gameId: game.id, name: "Foal", stageIndex: 0, minCycle: 0, ageCap: 12, canCompete: false, canBreed: false, canTrain: false, canReceiveCare: true, profileLayout: "foal", immunityCapMultiplier: 0.6 } })
  const adolescentStage = await db.lifeStageDef.create({ data: { gameId: game.id, name: "Adolescent", stageIndex: 1, minCycle: 12, ageCap: 36, canCompete: false, canBreed: false, canTrain: true, canReceiveCare: true, profileLayout: "adolescent", immunityCapMultiplier: 0.8 } })
  const adultStage = await db.lifeStageDef.create({ data: { gameId: game.id, name: "Adult", stageIndex: 2, minCycle: 36, ageCap: 96, canCompete: true, canBreed: true, canTrain: true, canReceiveCare: true, profileLayout: "adult", immunityCapMultiplier: 1.0 } })
  const seniorStage = await db.lifeStageDef.create({ data: { gameId: game.id, name: "Senior", stageIndex: 3, minCycle: 96, ageCap: 144, canCompete: true, canBreed: false, canTrain: false, canReceiveCare: true, profileLayout: "senior", immunityCapMultiplier: 0.7, deathChanceStartCycle: 96, deathChancePerCycle: 0.05 } })

  // ── STAT DEFS (6) ─────────────────────────────────────────────────────────
  const speedStat      = await db.statDef.create({ data: { gameId: game.id, name: "Speed" } })
  const enduranceStat  = await db.statDef.create({ data: { gameId: game.id, name: "Endurance" } })
  const agilityStat    = await db.statDef.create({ data: { gameId: game.id, name: "Agility" } })
  const strengthStat   = await db.statDef.create({ data: { gameId: game.id, name: "Strength" } })
  const flexibilityStat = await db.statDef.create({ data: { gameId: game.id, name: "Flexibility" } })
  const balanceStat    = await db.statDef.create({ data: { gameId: game.id, name: "Balance" } })

  // ── PERSONALITY TRAIT DEFS (4) ────────────────────────────────────────────
  const temperamentTrait = await db.personalityTraitDef.create({ data: { gameId: game.id, name: "Temperament", description: "How calm or spirited the horse is", trainingModifier: 0.05, moodModifier: 0.03, labelRanges: { createMany: { data: [{ label: "Gentle", minValue: 0, maxValue: 33 }, { label: "Even-Keeled", minValue: 33, maxValue: 66 }, { label: "Spirited", minValue: 66, maxValue: 100 }] } } } })
  const driveTrait       = await db.personalityTraitDef.create({ data: { gameId: game.id, name: "Drive", description: "Motivation during training and competition", trainingModifier: 0.08, labelRanges: { createMany: { data: [{ label: "Relaxed", minValue: 0, maxValue: 33 }, { label: "Focused", minValue: 33, maxValue: 66 }, { label: "Driven", minValue: 66, maxValue: 100 }] } } } })
  const focusTrait       = await db.personalityTraitDef.create({ data: { gameId: game.id, name: "Focus", description: "Ability to maintain attention during work", trainingModifier: 0.06, labelRanges: { createMany: { data: [{ label: "Distracted", minValue: 0, maxValue: 33 }, { label: "Attentive", minValue: 33, maxValue: 66 }, { label: "Laser-Focused", minValue: 66, maxValue: 100 }] } } } })
  const boldnessTrait    = await db.personalityTraitDef.create({ data: { gameId: game.id, name: "Boldness", description: "Willingness to face new challenges", trainingModifier: 0.04, labelRanges: { createMany: { data: [{ label: "Timid", minValue: 0, maxValue: 33 }, { label: "Steady", minValue: 33, maxValue: 66 }, { label: "Bold", minValue: 66, maxValue: 100 }] } } } })

  // ── CARE ACTION DEFS (4 daily + 2 long-term) ─────────────────────────────
  const feedAction      = await db.careActionDef.create({ data: { gameId: game.id, name: "Feed", costType: "FREE", careScoreGain: 5.0, energyRestore: 15.0, moodBoost: 3.0 } })
  const groomAction     = await db.careActionDef.create({ data: { gameId: game.id, name: "Groom", costType: "FREE", careScoreGain: 8.0, energyRestore: 0.0, moodBoost: 8.0 } })
  const walkAction      = await db.careActionDef.create({ data: { gameId: game.id, name: "Hand Walk", costType: "FREE", careScoreGain: 4.0, energyRestore: 5.0, moodBoost: 6.0 } })
  await db.careActionDef.create({ data: { gameId: game.id, name: "Electrolyte Supplement", costType: "CURRENCY", currencyAmount: 50, careScoreGain: 3.0, energyRestore: 10.0, moodBoost: 2.0 } })

  const dentalCheck = await db.longTermCareActionDef.create({ data: { gameId: game.id, name: "Dental Check", intervalCycles: 12, gracePeriodCycles: 2, currencyAmount: 150 } })
  const hoofTrim    = await db.longTermCareActionDef.create({ data: { gameId: game.id, name: "Hoof Trim", intervalCycles: 6, gracePeriodCycles: 1, currencyAmount: 80 } })

  // ── CURRENCY ──────────────────────────────────────────────────────────────
  const goldCurrency = await db.currencyDef.create({ data: { gameId: game.id, name: "Gold", currencyType: "BASE", symbol: "G" } })

  // ── ITEMS (3 equipment) ───────────────────────────────────────────────────
  const racingSaddle = await db.itemDef.create({ data: { gameId: game.id, name: "Racing Saddle", description: "Lightweight flat racing saddle", itemType: "EQUIPMENT", category: "EQUIPMENT" } })
  const jumpSaddle   = await db.itemDef.create({ data: { gameId: game.id, name: "Jump Saddle", description: "All-purpose jumping saddle", itemType: "EQUIPMENT", category: "EQUIPMENT" } })
  const jumpBoots    = await db.itemDef.create({ data: { gameId: game.id, name: "Jump Boots", description: "Protective boots for show jumping", itemType: "EQUIPMENT", category: "EQUIPMENT" } })

  // ── DISCIPLINES (2 sport + 1 conformation) ────────────────────────────────
  const racingDiscipline = await db.disciplineDef.create({
    data: {
      gameId: game.id,
      name: "Racing",
      description: "Flat track racing",
      isConformation: false,
      statWeights: { createMany: { data: [{ statDefId: speedStat.id, weight: 0.55 }, { statDefId: enduranceStat.id, weight: 0.30 }, { statDefId: agilityStat.id, weight: 0.15 }] } },
      personalityWeights: { createMany: { data: [{ traitDefId: driveTrait.id, weight: 0.6 }, { traitDefId: temperamentTrait.id, weight: 0.4 }] } },
      equipmentRequirements: { create: { itemDefId: racingSaddle.id, quantity: 1 } },
    },
  })

  const showJumpingDiscipline = await db.disciplineDef.create({
    data: {
      gameId: game.id,
      name: "Show Jumping",
      description: "Timed obstacle jumping",
      isConformation: false,
      statWeights: { createMany: { data: [{ statDefId: agilityStat.id, weight: 0.40 }, { statDefId: strengthStat.id, weight: 0.35 }, { statDefId: balanceStat.id, weight: 0.25 }] } },
      personalityWeights: { createMany: { data: [{ traitDefId: boldnessTrait.id, weight: 0.5 }, { traitDefId: focusTrait.id, weight: 0.3 }, { traitDefId: driveTrait.id, weight: 0.2 }] } },
      equipmentRequirements: { createMany: { data: [{ itemDefId: jumpSaddle.id, quantity: 1 }, { itemDefId: jumpBoots.id, quantity: 4 }] } },
    },
  })

  const halterDiscipline = await db.disciplineDef.create({
    data: { gameId: game.id, name: "Halter", description: "In-hand conformation showing", isConformation: true },
  })

  // ── COMPETITION TIER DEFS ─────────────────────────────────────────────────
  const racingNovice = await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: racingDiscipline.id, name: "Novice", tierIndex: 0, minScore: 0, advancementThreshold: 75, energyCost: 10, entryFee: 50, tierPrizes: { createMany: { data: [{ placement: 1, currencyDefId: goldCurrency.id, amount: 200 }, { placement: 2, currencyDefId: goldCurrency.id, amount: 100 }, { placement: 3, currencyDefId: goldCurrency.id, amount: 50 }] } } } })
  const racingOpen   = await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: racingDiscipline.id, name: "Open", tierIndex: 1, minScore: 75, advancementThreshold: 90, energyCost: 20, entryFee: 150, tierPrizes: { createMany: { data: [{ placement: 1, currencyDefId: goldCurrency.id, amount: 500 }, { placement: 2, currencyDefId: goldCurrency.id, amount: 250 }, { placement: 3, currencyDefId: goldCurrency.id, amount: 100 }] } } } })
  const racingElite  = await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: racingDiscipline.id, name: "Elite", tierIndex: 2, minScore: 90, energyCost: 30, entryFee: 300, minWeeklyPointsForInvitational: 85.0, tierPrizes: { createMany: { data: [{ placement: 1, currencyDefId: goldCurrency.id, amount: 1000 }, { placement: 2, currencyDefId: goldCurrency.id, amount: 500 }, { placement: 3, currencyDefId: goldCurrency.id, amount: 250 }] } } } })
  const jumpNovice   = await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: showJumpingDiscipline.id, name: "Novice", tierIndex: 0, minScore: 0, advancementThreshold: 70, energyCost: 12, entryFee: 60 } })
  const jumpOpen     = await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: showJumpingDiscipline.id, name: "Open", tierIndex: 1, minScore: 70, advancementThreshold: 85, energyCost: 22, entryFee: 180 } })
  await db.competitionTierDef.create({ data: { gameId: game.id, disciplineDefId: halterDiscipline.id, name: "Open", tierIndex: 0, energyCost: 5, entryFee: 30 } })

  // ── INTENSITY TIER DEFS ───────────────────────────────────────────────────
  const lowIntensity  = await db.intensityTierDef.create({ data: { gameId: game.id, name: "Light", tierIndex: 0, energyCost: 5, gainMultiplier: 0.7, minMood: 20 } })
  const highIntensity = await db.intensityTierDef.create({ data: { gameId: game.id, name: "Intense", tierIndex: 1, energyCost: 15, gainMultiplier: 1.3, minMood: 40, minCondition: 50 } })

  // ── TRAINING ACTION DEFS (6) ──────────────────────────────────────────────
  const speedTraining      = await db.trainingActionDef.create({ data: { gameId: game.id, name: "Sprint Drills", statDefId: speedStat.id, baseGain: 2.0 } })
  const enduranceTraining  = await db.trainingActionDef.create({ data: { gameId: game.id, name: "Distance Run", statDefId: enduranceStat.id, baseGain: 2.0 } })
  const agilityTraining    = await db.trainingActionDef.create({ data: { gameId: game.id, name: "Pole Work", statDefId: agilityStat.id, baseGain: 2.0 } })
  const strengthTraining   = await db.trainingActionDef.create({ data: { gameId: game.id, name: "Hill Work", statDefId: strengthStat.id, baseGain: 1.8 } })
  await db.trainingActionDef.create({ data: { gameId: game.id, name: "Stretch Work", statDefId: flexibilityStat.id, baseGain: 1.5 } })
  await db.trainingActionDef.create({ data: { gameId: game.id, name: "Cavaletti Work", statDefId: balanceStat.id, baseGain: 1.8 } })

  // ── HEALTH CONDITIONS ─────────────────────────────────────────────────────
  const lamenessCondition = await db.healthConditionDef.create({ data: { gameId: game.id, name: "Lameness", conditionType: "INJURY", isGenetic: false, isFatal: false, moodEffect: -15, energyEffect: -20 } })
  const lamenessTreatment = await db.treatmentDef.create({ data: { conditionDefId: lamenessCondition.id, name: "Rest & Poultice", treatmentType: "PLAYER_ACTION", durationCycles: 3 } })

  const hyppCondition  = await db.healthConditionDef.create({ data: { gameId: game.id, name: "HYPP", conditionType: "ILLNESS", isGenetic: true, isFatal: false, moodEffect: -10, energyEffect: -15 } })
  const gbedCondition  = await db.healthConditionDef.create({ data: { gameId: game.id, name: "GBED", conditionType: "ILLNESS", isGenetic: true, isFatal: true, fatalityChance: 1.0, fatalMaxCycle: 3 } })
  const herdaCondition = await db.healthConditionDef.create({ data: { gameId: game.id, name: "HERDA", conditionType: "ILLNESS", isGenetic: true, isFatal: false, moodEffect: -15, energyEffect: -10 } })
  const pssm1Condition = await db.healthConditionDef.create({ data: { gameId: game.id, name: "PSSM1", conditionType: "ILLNESS", isGenetic: true, isFatal: false, moodEffect: -12, energyEffect: -20 } })
  await db.healthConditionDef.create({ data: { gameId: game.id, name: "Malignant Hyperthermia", conditionType: "ILLNESS", isGenetic: true, isFatal: true, fatalityChance: 0.4 } })
  await db.healthConditionDef.create({ data: { gameId: game.id, name: "OLWS", conditionType: "ILLNESS", isGenetic: true, isFatal: true, fatalityChance: 1.0, fatalMaxCycle: 1 } })

  // ── HEALTH CERT DEFS ──────────────────────────────────────────────────────
  const cogginsTest = await db.healthCertificateDef.create({ data: { gameId: game.id, name: "Coggins Test", validForCycles: 12, requiredForCompetition: true } })
  await db.healthCertificateDef.create({ data: { gameId: game.id, name: "Vaccination Record", validForCycles: 24, requiredForCompetition: false } })

  // ── VET SERVICE ───────────────────────────────────────────────────────────
  const examService = await db.vetServiceDef.create({ data: { gameId: game.id, name: "Wellness Exam", serviceType: "EXAM", baseCost: 100, currencyDefId: goldCurrency.id } })

  // ── COLOR LOCI (6) ────────────────────────────────────────────────────────
  const baseColorLocus = await db.locus.create({ data: { gameId: game.id, name: "Base Color", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "E" }, { symbol: "e" }] } } }, include: { alleles: true } })
  const agoutiLocus    = await db.locus.create({ data: { gameId: game.id, name: "Agouti", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "A" }, { symbol: "a" }] } } }, include: { alleles: true } })
  const creamLocus     = await db.locus.create({ data: { gameId: game.id, name: "Cream", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "Cr" }, { symbol: "cr" }] } } }, include: { alleles: true } })
  const greyLocus      = await db.locus.create({ data: { gameId: game.id, name: "Grey", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "G" }, { symbol: "g" }] } } }, include: { alleles: true } })
  const roanLocus      = await db.locus.create({ data: { gameId: game.id, name: "Roan", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "Rn" }, { symbol: "rn" }] } } }, include: { alleles: true } })
  const tobianoLocus   = await db.locus.create({ data: { gameId: game.id, name: "Tobiano", displayGroup: "Color", biasTarget: "NONE", alleles: { createMany: { data: [{ symbol: "T" }, { symbol: "t" }] } } }, include: { alleles: true } })

  // ── HEALTH LOCI (6) ───────────────────────────────────────────────────────
  const hyppLocus  = await db.locus.create({ data: { gameId: game.id, name: "HYPP", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 0, alleles: { createMany: { data: [{ symbol: "H" }, { symbol: "h" }] } } }, include: { alleles: true } })
  const gbedLocus  = await db.locus.create({ data: { gameId: game.id, name: "GBED", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 0, alleles: { createMany: { data: [{ symbol: "Gb" }, { symbol: "gb" }] } } }, include: { alleles: true } })
  const herdaLocus = await db.locus.create({ data: { gameId: game.id, name: "HERDA", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 12, alleles: { createMany: { data: [{ symbol: "Hr" }, { symbol: "hr" }] } } }, include: { alleles: true } })
  const pssm1Locus = await db.locus.create({ data: { gameId: game.id, name: "PSSM1", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 12, alleles: { createMany: { data: [{ symbol: "P1" }, { symbol: "p1" }] } } }, include: { alleles: true } })
  const mhLocus    = await db.locus.create({ data: { gameId: game.id, name: "MH", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 0, alleles: { createMany: { data: [{ symbol: "Mh" }, { symbol: "mh" }] } } }, include: { alleles: true } })
  const olwsLocus  = await db.locus.create({ data: { gameId: game.id, name: "OLWS", displayGroup: "Health", biasTarget: "NONE", minTestCycle: 0, alleles: { createMany: { data: [{ symbol: "O" }, { symbol: "o" }] } } }, include: { alleles: true } })

  // ── CONFORMATION LOCI (6) ─────────────────────────────────────────────────
  const limbAlignmentLocus  = await db.locus.create({ data: { gameId: game.id, name: "Limb Alignment", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "La" }, { symbol: "la" }] } } }, include: { alleles: true } })
  const backLengthLocus     = await db.locus.create({ data: { gameId: game.id, name: "Back Length", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "Bl" }, { symbol: "bl" }] } } }, include: { alleles: true } })
  const neckSetLocus        = await db.locus.create({ data: { gameId: game.id, name: "Neck Set", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "Ns" }, { symbol: "ns" }] } } }, include: { alleles: true } })
  const hoofQualityLocus    = await db.locus.create({ data: { gameId: game.id, name: "Hoof Quality", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "Hq" }, { symbol: "hq" }] } } }, include: { alleles: true } })
  const hipAngleLocus       = await db.locus.create({ data: { gameId: game.id, name: "Hip Angle", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "Ha" }, { symbol: "ha" }] } } }, include: { alleles: true } })
  const shoulderSlopeLocus  = await db.locus.create({ data: { gameId: game.id, name: "Shoulder Slope", displayGroup: "Conformation", biasTarget: "FAVORABILITY", alleles: { createMany: { data: [{ symbol: "Ss" }, { symbol: "ss" }] } } }, include: { alleles: true } })

  // ── ALLELE REFERENCES ─────────────────────────────────────────────────────
  const f = (locus: { alleles: { symbol: string; id: string }[] }, sym: string) =>
    locus.alleles.find((a) => a.symbol === sym)!.id

  const bcE = f(baseColorLocus, "E"),  bce  = f(baseColorLocus, "e")
  const agA = f(agoutiLocus, "A"),     aga  = f(agoutiLocus, "a")
  const crCr = f(creamLocus, "Cr"),    crcr = f(creamLocus, "cr")
  const grG = f(greyLocus, "G"),       grg  = f(greyLocus, "g")
  const rnRn = f(roanLocus, "Rn"),     rnrn = f(roanLocus, "rn")
  const toT = f(tobianoLocus, "T"),    tot  = f(tobianoLocus, "t")
  const hpH = f(hyppLocus, "H"),       hph  = f(hyppLocus, "h")
  const gbGb = f(gbedLocus, "Gb"),     gbgb = f(gbedLocus, "gb")
  const hdHr = f(herdaLocus, "Hr"),    hdhr = f(herdaLocus, "hr")
  const psP1 = f(pssm1Locus, "P1"),    psp1 = f(pssm1Locus, "p1")
  const mhMh = f(mhLocus, "Mh"),       mhmh = f(mhLocus, "mh")
  const owO = f(olwsLocus, "O"),       owo  = f(olwsLocus, "o")
  const laLa = f(limbAlignmentLocus, "La"),  lala = f(limbAlignmentLocus, "la")
  const blBl = f(backLengthLocus, "Bl"),     blbl = f(backLengthLocus, "bl")
  const nsNs = f(neckSetLocus, "Ns"),        nsns = f(neckSetLocus, "ns")
  const hqHq = f(hoofQualityLocus, "Hq"),    hqhq = f(hoofQualityLocus, "hq")
  const haHa = f(hipAngleLocus, "Ha"),       haha = f(hipAngleLocus, "ha")
  const ssSs = f(shoulderSlopeLocus, "Ss"),  ssss = f(shoulderSlopeLocus, "ss")

  // ── EXPRESSION RULES ──────────────────────────────────────────────────────
  // Color
  await db.expressionRule.createMany({ data: [
    { locusId: baseColorLocus.id, alleleOneId: bcE, alleleTwoId: bcE, phenotype: "Black Base" },
    { locusId: baseColorLocus.id, alleleOneId: bcE, alleleTwoId: bce, phenotype: "Black Base" },
    { locusId: baseColorLocus.id, alleleOneId: bce, alleleTwoId: bce, phenotype: "Chestnut Base" },
    { locusId: agoutiLocus.id, alleleOneId: agA, alleleTwoId: agA, phenotype: "Bay Pattern" },
    { locusId: agoutiLocus.id, alleleOneId: agA, alleleTwoId: aga, phenotype: "Bay Pattern" },
    { locusId: agoutiLocus.id, alleleOneId: aga, alleleTwoId: aga, phenotype: "Non-Agouti" },
    { locusId: creamLocus.id, alleleOneId: crCr, alleleTwoId: crCr, phenotype: "Double Cream" },
    { locusId: creamLocus.id, alleleOneId: crCr, alleleTwoId: crcr, phenotype: "Single Cream" },
    { locusId: creamLocus.id, alleleOneId: crcr, alleleTwoId: crcr, phenotype: "No Dilution" },
    { locusId: greyLocus.id, alleleOneId: grG, alleleTwoId: grG, phenotype: "Grey" },
    { locusId: greyLocus.id, alleleOneId: grG, alleleTwoId: grg, phenotype: "Grey" },
    { locusId: greyLocus.id, alleleOneId: grg, alleleTwoId: grg, phenotype: "Non-Grey" },
    { locusId: roanLocus.id, alleleOneId: rnRn, alleleTwoId: rnRn, phenotype: "Classic Roan" },
    { locusId: roanLocus.id, alleleOneId: rnRn, alleleTwoId: rnrn, phenotype: "Classic Roan" },
    { locusId: roanLocus.id, alleleOneId: rnrn, alleleTwoId: rnrn, phenotype: "Solid" },
    { locusId: tobianoLocus.id, alleleOneId: toT, alleleTwoId: toT, phenotype: "Bold Tobiano" },
    { locusId: tobianoLocus.id, alleleOneId: toT, alleleTwoId: tot, phenotype: "Tobiano" },
    { locusId: tobianoLocus.id, alleleOneId: tot, alleleTwoId: tot, phenotype: "Solid" },
  ] })

  // Health — link affected/carrier genotypes to conditions
  await db.expressionRule.createMany({ data: [
    { locusId: hyppLocus.id, alleleOneId: hpH, alleleTwoId: hpH, phenotype: "HYPP Affected", healthConditionDefId: hyppCondition.id },
    { locusId: hyppLocus.id, alleleOneId: hpH, alleleTwoId: hph, phenotype: "HYPP Carrier" },
    { locusId: hyppLocus.id, alleleOneId: hph, alleleTwoId: hph, phenotype: "Normal" },
    { locusId: gbedLocus.id, alleleOneId: gbGb, alleleTwoId: gbGb, phenotype: "GBED Affected", healthConditionDefId: gbedCondition.id },
    { locusId: gbedLocus.id, alleleOneId: gbGb, alleleTwoId: gbgb, phenotype: "GBED Carrier" },
    { locusId: gbedLocus.id, alleleOneId: gbgb, alleleTwoId: gbgb, phenotype: "Normal" },
    { locusId: herdaLocus.id, alleleOneId: hdHr, alleleTwoId: hdHr, phenotype: "HERDA Affected", healthConditionDefId: herdaCondition.id },
    { locusId: herdaLocus.id, alleleOneId: hdHr, alleleTwoId: hdhr, phenotype: "HERDA Carrier" },
    { locusId: herdaLocus.id, alleleOneId: hdhr, alleleTwoId: hdhr, phenotype: "Normal" },
    { locusId: pssm1Locus.id, alleleOneId: psP1, alleleTwoId: psP1, phenotype: "PSSM1 Affected", healthConditionDefId: pssm1Condition.id },
    { locusId: pssm1Locus.id, alleleOneId: psP1, alleleTwoId: psp1, phenotype: "PSSM1 Mild", healthConditionDefId: pssm1Condition.id },
    { locusId: pssm1Locus.id, alleleOneId: psp1, alleleTwoId: psp1, phenotype: "Normal" },
    { locusId: mhLocus.id, alleleOneId: mhMh, alleleTwoId: mhMh, phenotype: "MH Affected" },
    { locusId: mhLocus.id, alleleOneId: mhMh, alleleTwoId: mhmh, phenotype: "MH Carrier" },
    { locusId: mhLocus.id, alleleOneId: mhmh, alleleTwoId: mhmh, phenotype: "Normal" },
    { locusId: olwsLocus.id, alleleOneId: owO, alleleTwoId: owO, phenotype: "OLWS Affected" },
    { locusId: olwsLocus.id, alleleOneId: owO, alleleTwoId: owo, phenotype: "OLWS Carrier" },
    { locusId: olwsLocus.id, alleleOneId: owo, alleleTwoId: owo, phenotype: "Normal" },
  ] })

  // Conformation — numericModifier used by scoring engine
  await db.expressionRule.createMany({ data: [
    { locusId: limbAlignmentLocus.id, alleleOneId: laLa, alleleTwoId: laLa, phenotype: "Ideal Alignment", numericModifier: 2.0 },
    { locusId: limbAlignmentLocus.id, alleleOneId: laLa, alleleTwoId: lala, phenotype: "Moderate Alignment", numericModifier: 0.0 },
    { locusId: limbAlignmentLocus.id, alleleOneId: lala, alleleTwoId: lala, phenotype: "Angular Deviation", numericModifier: -2.0 },
    { locusId: backLengthLocus.id, alleleOneId: blBl, alleleTwoId: blBl, phenotype: "Ideal Back Length", numericModifier: 2.0 },
    { locusId: backLengthLocus.id, alleleOneId: blBl, alleleTwoId: blbl, phenotype: "Slightly Long Back", numericModifier: -0.5 },
    { locusId: backLengthLocus.id, alleleOneId: blbl, alleleTwoId: blbl, phenotype: "Long Back", numericModifier: -2.0 },
    { locusId: neckSetLocus.id, alleleOneId: nsNs, alleleTwoId: nsNs, phenotype: "High Neck Set", numericModifier: 2.0 },
    { locusId: neckSetLocus.id, alleleOneId: nsNs, alleleTwoId: nsns, phenotype: "Moderate Neck Set", numericModifier: 0.0 },
    { locusId: neckSetLocus.id, alleleOneId: nsns, alleleTwoId: nsns, phenotype: "Low Neck Set", numericModifier: -1.5 },
    { locusId: hoofQualityLocus.id, alleleOneId: hqHq, alleleTwoId: hqHq, phenotype: "Excellent Hooves", numericModifier: 2.0 },
    { locusId: hoofQualityLocus.id, alleleOneId: hqHq, alleleTwoId: hqhq, phenotype: "Good Hooves", numericModifier: 0.5 },
    { locusId: hoofQualityLocus.id, alleleOneId: hqhq, alleleTwoId: hqhq, phenotype: "Poor Hoof Quality", numericModifier: -2.5 },
    { locusId: hipAngleLocus.id, alleleOneId: haHa, alleleTwoId: haHa, phenotype: "Well-Angled Hips", numericModifier: 2.0 },
    { locusId: hipAngleLocus.id, alleleOneId: haHa, alleleTwoId: haha, phenotype: "Moderate Hip Angle", numericModifier: 0.0 },
    { locusId: hipAngleLocus.id, alleleOneId: haha, alleleTwoId: haha, phenotype: "Straight Croup", numericModifier: -1.5 },
    { locusId: shoulderSlopeLocus.id, alleleOneId: ssSs, alleleTwoId: ssSs, phenotype: "Well-Sloped Shoulder", numericModifier: 2.0 },
    { locusId: shoulderSlopeLocus.id, alleleOneId: ssSs, alleleTwoId: ssss, phenotype: "Moderate Shoulder", numericModifier: 0.0 },
    { locusId: shoulderSlopeLocus.id, alleleOneId: ssss, alleleTwoId: ssss, phenotype: "Upright Shoulder", numericModifier: -2.0 },
  ] })

  // ── GENETIC PANELS (3) ────────────────────────────────────────────────────
  const heredPanel = await db.geneticPanelDef.create({ data: { gameId: game.id, name: "Hereditary Disease Panel", panelType: "HEALTH", loci: { createMany: { data: [{ locusId: hyppLocus.id }, { locusId: gbedLocus.id }, { locusId: herdaLocus.id }, { locusId: olwsLocus.id }] } } } })
  await db.geneticPanelDef.create({ data: { gameId: game.id, name: "Performance Health Panel", panelType: "HEALTH", loci: { createMany: { data: [{ locusId: pssm1Locus.id }, { locusId: mhLocus.id }] } } } })
  await db.geneticPanelDef.create({ data: { gameId: game.id, name: "Color Panel", panelType: "CONFORMATION", loci: { createMany: { data: [{ locusId: baseColorLocus.id }, { locusId: agoutiLocus.id }, { locusId: creamLocus.id }, { locusId: greyLocus.id }, { locusId: roanLocus.id }, { locusId: tobianoLocus.id }] } } } })
  await db.geneticPanelDef.create({ data: { gameId: game.id, name: "Structural Panel", panelType: "CONFORMATION", loci: { createMany: { data: [{ locusId: limbAlignmentLocus.id }, { locusId: backLengthLocus.id }, { locusId: neckSetLocus.id }, { locusId: hoofQualityLocus.id }, { locusId: hipAngleLocus.id }, { locusId: shoulderSlopeLocus.id }] } } } })

  // ── CONFORMATION SECTIONS (5) ─────────────────────────────────────────────
  const headSection = await db.conformationSection.create({ data: { gameId: game.id, name: "Head", displayOrder: 0, entries: { createMany: { data: [{ locusId: neckSetLocus.id, displayOrder: 0 }, { locusId: shoulderSlopeLocus.id, displayOrder: 1 }] } } } })
  const neckSection = await db.conformationSection.create({ data: { gameId: game.id, name: "Neck", displayOrder: 1, entries: { createMany: { data: [{ locusId: neckSetLocus.id, displayOrder: 0 }] } } } })
  const backSection = await db.conformationSection.create({ data: { gameId: game.id, name: "Back", displayOrder: 2, entries: { createMany: { data: [{ locusId: backLengthLocus.id, displayOrder: 0 }, { locusId: hipAngleLocus.id, displayOrder: 1 }] } } } })
  const legsSection = await db.conformationSection.create({ data: { gameId: game.id, name: "Legs", displayOrder: 3, entries: { createMany: { data: [{ locusId: limbAlignmentLocus.id, displayOrder: 0 }, { locusId: hoofQualityLocus.id, displayOrder: 1 }] } } } })
  const coatSection = await db.conformationSection.create({ data: { gameId: game.id, name: "Coat", displayOrder: 4, entries: { createMany: { data: [{ locusId: baseColorLocus.id, displayOrder: 0 }, { locusId: roanLocus.id, displayOrder: 1 }] } } } })

  // ── TITLE DEFS ────────────────────────────────────────────────────────────
  const championTitle = await db.titleDef.create({ data: { gameId: game.id, name: "Champion", description: "Won 3+ Open class races", disciplineDefId: racingDiscipline.id, rankOrder: 1 } })
  await db.titleDef.create({ data: { gameId: game.id, name: "Grand Prix Winner", description: "Won an Elite class race", disciplineDefId: racingDiscipline.id, rankOrder: 2 } })

  // ── VENUES ────────────────────────────────────────────────────────────────
  const greenfieldVenue = await db.venue.create({
    data: {
      gameId: game.id, name: "Greenfield Park", climate: "TEMPERATE", terrain: "FLAT",
      disciplines: { create: { disciplineDefId: racingDiscipline.id, defaultMaxEntries: 12, defaultMaxWaitHours: 24, isInvitationalEligible: true, invitationalMaxEntries: 8, invitationalMaxWaitHours: 48, maxOpenAtOnce: 2 } },
    },
  })
  await db.venue.create({
    data: {
      gameId: game.id, name: "Willowbrook Arena", climate: "TEMPERATE", terrain: "HILLY",
      disciplines: { createMany: { data: [{ disciplineDefId: showJumpingDiscipline.id, defaultMaxEntries: 10, defaultMaxWaitHours: 24, maxOpenAtOnce: 1 }, { disciplineDefId: halterDiscipline.id, defaultMaxEntries: 20, defaultMaxWaitHours: 48, maxOpenAtOnce: 1 }] } },
    },
  })

  // ── STAGE ACTIVITIES ──────────────────────────────────────────────────────
  const foalPlayActivity = await db.stageActivityDef.create({ data: { gameId: game.id, lifeStageId: foalStage.id, traitDefId: driveTrait.id, name: "Playful Exploration", traitEffect: 3.0, energyCost: 5, description: "Let the foal explore and play freely" } })
  const adolescentBoldActivity = await db.stageActivityDef.create({ data: { gameId: game.id, lifeStageId: adolescentStage.id, traitDefId: boldnessTrait.id, name: "Bold Challenge", traitEffect: 4.0, energyCost: 8, description: "Introduce the adolescent to challenging environments" } })

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
      statProfile: { createMany: { data: [
        { statDefId: speedStat.id, weight: 0.40, naturalMin: 62, naturalMax: 95, baseline: 78 },
        { statDefId: enduranceStat.id, weight: 0.25, naturalMin: 55, naturalMax: 90, baseline: 72 },
        { statDefId: agilityStat.id, weight: 0.15, naturalMin: 50, naturalMax: 86, baseline: 67 },
        { statDefId: strengthStat.id, weight: 0.10, naturalMin: 48, naturalMax: 84, baseline: 64 },
        { statDefId: flexibilityStat.id, weight: 0.05, naturalMin: 45, naturalMax: 80, baseline: 60 },
        { statDefId: balanceStat.id, weight: 0.05, naturalMin: 48, naturalMax: 82, baseline: 62 },
      ] } },
      personalityProfiles: { createMany: { data: [
        { traitDefId: temperamentTrait.id, naturalMin: 40, naturalMax: 90, baseline: 65 },
        { traitDefId: driveTrait.id, naturalMin: 50, naturalMax: 95, baseline: 72 },
        { traitDefId: focusTrait.id, naturalMin: 45, naturalMax: 88, baseline: 68 },
        { traitDefId: boldnessTrait.id, naturalMin: 45, naturalMax: 92, baseline: 70 },
      ] } },
      alleleFrequencies: { createMany: { data: [
        { alleleId: bcE,  frequency: 0.70 }, { alleleId: bce,  frequency: 0.30 },
        { alleleId: agA,  frequency: 0.80 }, { alleleId: aga,  frequency: 0.20 },
        { alleleId: crCr, frequency: 0.10 }, { alleleId: crcr, frequency: 0.90 },
        { alleleId: grG,  frequency: 0.15 }, { alleleId: grg,  frequency: 0.85 },
        { alleleId: rnRn, frequency: 0.05 }, { alleleId: rnrn, frequency: 0.95 },
        { alleleId: toT,  frequency: 0.02 }, { alleleId: tot,  frequency: 0.98 },
        { alleleId: hpH,  frequency: 0.05 }, { alleleId: hph,  frequency: 0.95 },
        { alleleId: gbGb, frequency: 0.10 }, { alleleId: gbgb, frequency: 0.90 },
        { alleleId: hdHr, frequency: 0.05 }, { alleleId: hdhr, frequency: 0.95 },
        { alleleId: psP1, frequency: 0.08 }, { alleleId: psp1, frequency: 0.92 },
        { alleleId: mhMh, frequency: 0.03 }, { alleleId: mhmh, frequency: 0.97 },
        { alleleId: owO,  frequency: 0.01 }, { alleleId: owo,  frequency: 0.99 },
        { alleleId: laLa, frequency: 0.70 }, { alleleId: lala, frequency: 0.30 },
        { alleleId: blBl, frequency: 0.75 }, { alleleId: blbl, frequency: 0.25 },
        { alleleId: nsNs, frequency: 0.65 }, { alleleId: nsns, frequency: 0.35 },
        { alleleId: hqHq, frequency: 0.70 }, { alleleId: hqhq, frequency: 0.30 },
        { alleleId: haHa, frequency: 0.68 }, { alleleId: haha, frequency: 0.32 },
        { alleleId: ssSs, frequency: 0.72 }, { alleleId: ssss, frequency: 0.28 },
      ] } },
      conformationStandards: { createMany: { data: [
        { locusId: baseColorLocus.id, idealExpressionLabel: "Black Base", weight: 0.10 },
        { locusId: limbAlignmentLocus.id, idealExpressionLabel: "Ideal Alignment", weight: 0.20 },
        { locusId: backLengthLocus.id, idealExpressionLabel: "Ideal Back Length", weight: 0.20 },
        { locusId: neckSetLocus.id, idealExpressionLabel: "High Neck Set", weight: 0.15 },
        { locusId: hoofQualityLocus.id, idealExpressionLabel: "Excellent Hooves", weight: 0.15 },
        { locusId: hipAngleLocus.id, idealExpressionLabel: "Well-Angled Hips", weight: 0.10 },
        { locusId: shoulderSlopeLocus.id, idealExpressionLabel: "Well-Sloped Shoulder", weight: 0.10 },
      ] } },
    },
  })

  // ── USER & PLAYER ─────────────────────────────────────────────────────────
  const user = await db.user.create({ data: { email: "seed-player@equine-legends.dev", name: "Seed Player", emailVerified: true } })
  const player = await db.playerAccount.create({
    data: {
      userId: user.id,
      gameId: game.id,
      username: "SeedPlayer",
      playerBalances: { create: { currencyDefId: goldCurrency.id, balance: 5000 } },
    },
  })

  // ── HELPERS ───────────────────────────────────────────────────────────────
  type VitalsOpts = { energyCurrent?: number; moodValue?: number; conditionValue?: number; careScore?: number; immunityValue?: number; immunityInnateMax?: number }
  async function createVitals(animalId: string, opts: VitalsOpts = {}) {
    const { energyCurrent = 75, moodValue = 70, conditionValue = 80, careScore = 78, immunityValue = 65, immunityInnateMax = 88 } = opts
    await Promise.all([
      db.animalEnergy.create({ data: { animalId, currentEnergy: energyCurrent, maxEnergy: 100 } }),
      db.animalMood.create({ data: { animalId, value: moodValue } }),
      db.animalCondition.create({ data: { animalId, value: conditionValue } }),
      db.animalCareScore.create({ data: { animalId, score: careScore } }),
      db.animalImmunity.create({ data: { animalId, value: immunityValue, innateMax: immunityInnateMax } }),
    ])
  }

  // Default genome: black base (E/e), bay (A/a), no dilution, no grey, no roan, solid
  //                 all health clear, moderate-to-ideal conformation
  type GenomeEntry = [string, string]
  const defaultGenome: Record<string, GenomeEntry> = {
    [baseColorLocus.id]:    [bcE,  bce ],
    [agoutiLocus.id]:       [agA,  aga ],
    [creamLocus.id]:        [crcr, crcr],
    [greyLocus.id]:         [grg,  grg ],
    [roanLocus.id]:         [rnrn, rnrn],
    [tobianoLocus.id]:      [tot,  tot ],
    [hyppLocus.id]:         [hph,  hph ],
    [gbedLocus.id]:         [gbgb, gbgb],
    [herdaLocus.id]:        [hdhr, hdhr],
    [pssm1Locus.id]:        [psp1, psp1],
    [mhLocus.id]:           [mhmh, mhmh],
    [olwsLocus.id]:         [owo,  owo ],
    [limbAlignmentLocus.id]:[laLa, lala],
    [backLengthLocus.id]:   [blBl, blBl],
    [neckSetLocus.id]:      [nsNs, nsNs],
    [hoofQualityLocus.id]:  [hqHq, hqHq],
    [hipAngleLocus.id]:     [haHa, haha],
    [shoulderSlopeLocus.id]:[ssSs, ssSs],
  }

  async function createGenotypes(
    animalId: string,
    opts: { overrides?: Record<string, GenomeEntry>; testedLocusIds?: string[]; testedCycle?: number | null } = {}
  ) {
    const { overrides = {}, testedLocusIds = [], testedCycle = null } = opts
    const genome = { ...defaultGenome, ...overrides }
    await db.animalGenotype.createMany({
      data: Object.entries(genome).map(([locusId, [a1, a2]]) => {
        const isTested = testedLocusIds.includes(locusId)
        return { animalId, locusId, alleleOneId: a1, alleleTwoId: a2, isTestedByOwner: isTested, testedAt: isTested ? new Date() : null, testedCycle: isTested ? testedCycle : null }
      }),
    })
  }

  // ── ANIMAL 1: Adult Male "Blaze" — full dataset ───────────────────────────
  const blaze = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Blaze", sex: "MALE", lifeStageId: adultStage.id,
      generation: 3, ageInCycles: 52, lifeExpectancy: 118,
      disciplineDefId: racingDiscipline.id, inbreedingCoefficient: 0.03,
      fertility: 0.92, breedGeneration: 5,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: blaze.id, statDefId: speedStat.id, innateValue: 82, trainedValue: 18 },
    { animalId: blaze.id, statDefId: enduranceStat.id, innateValue: 74, trainedValue: 12 },
    { animalId: blaze.id, statDefId: agilityStat.id, innateValue: 69, trainedValue: 8 },
    { animalId: blaze.id, statDefId: strengthStat.id, innateValue: 71, trainedValue: 6 },
    { animalId: blaze.id, statDefId: flexibilityStat.id, innateValue: 65, trainedValue: 3 },
    { animalId: blaze.id, statDefId: balanceStat.id, innateValue: 68, trainedValue: 4 },
  ] })
  await createVitals(blaze.id, { energyCurrent: 80, moodValue: 75, conditionValue: 85, careScore: 88, immunityValue: 72, immunityInnateMax: 92 })
  await db.animalPersonality.createMany({ data: [
    { animalId: blaze.id, traitDefId: temperamentTrait.id, value: 65, traitLabel: "Even-Keeled" },
    { animalId: blaze.id, traitDefId: driveTrait.id,       value: 78, traitLabel: "Driven" },
    { animalId: blaze.id, traitDefId: focusTrait.id,       value: 70, traitLabel: "Attentive" },
    { animalId: blaze.id, traitDefId: boldnessTrait.id,    value: 74, traitLabel: "Bold" },
  ] })
  await createGenotypes(blaze.id, {
    overrides: {
      [hyppLocus.id]:          [hpH,  hph ],  // HYPP carrier
      [limbAlignmentLocus.id]: [laLa, laLa],  // ideal
      [hipAngleLocus.id]:      [haHa, haHa],  // ideal
    },
    testedLocusIds: [
      baseColorLocus.id, agoutiLocus.id, creamLocus.id, greyLocus.id, roanLocus.id, tobianoLocus.id,
      hyppLocus.id, gbedLocus.id,
    ],
    testedCycle: 50,
  })
  await db.animalBreedComposition.create({ data: { animalId: blaze.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalConformationScore.create({ data: { animalId: blaze.id, breedId: thoroughbred.id, score: 91.5 } })
  await db.animalConformationSectionScore.createMany({ data: [
    { animalId: blaze.id, breedId: thoroughbred.id, sectionId: headSection.id, score: 90.0 },
    { animalId: blaze.id, breedId: thoroughbred.id, sectionId: neckSection.id, score: 93.5 },
    { animalId: blaze.id, breedId: thoroughbred.id, sectionId: backSection.id, score: 88.0 },
    { animalId: blaze.id, breedId: thoroughbred.id, sectionId: legsSection.id, score: 94.0 },
    { animalId: blaze.id, breedId: thoroughbred.id, sectionId: coatSection.id, score: 91.5 },
  ] })
  await db.animalCompetitionTier.create({ data: { animalId: blaze.id, disciplineDefId: racingDiscipline.id, tierDefId: racingOpen.id } })
  await db.animalTitle.create({ data: { animalId: blaze.id, titleDefId: championTitle.id, cycleNumber: 46 } })
  await db.animalLongTermCareRecord.create({ data: { animalId: blaze.id, longTermCareActionDefId: dentalCheck.id, lastPerformedCycle: 48, nextDueCycle: 60 } })
  await db.animalLongTermCareRecord.create({ data: { animalId: blaze.id, longTermCareActionDefId: hoofTrim.id, lastPerformedCycle: 50, nextDueCycle: 56 } })
  await db.careLog.create({ data: { animalId: blaze.id, careActionDefId: feedAction.id, cycleNumber: 52, performedByPlayerId: player.id } })
  await db.trainingLog.create({ data: { animalId: blaze.id, trainingActionDefId: speedTraining.id, intensityTierDefId: highIntensity.id, cycleNumber: 52, statGained: 2.6, energyUsed: 15, performedByPlayerId: player.id } })
  const blazeHealthRecord = await db.animalHealthRecord.create({ data: { animalId: blaze.id, conditionDefId: lamenessCondition.id, diagnosedCycle: 38, resolvedCycle: 41, resolvedAt: new Date("2025-01-20"), isActive: false } })
  await db.animalTreatmentRecord.create({ data: { animalId: blaze.id, treatmentDefId: lamenessTreatment.id, healthRecordId: blazeHealthRecord.id, startedCycle: 38, completedCycle: 41, completedAt: new Date("2025-01-20"), isActive: false } })
  await db.vetVisitLog.create({ data: { animalId: blaze.id, playerAccountId: player.id, vetServiceDefId: examService.id, visitCycle: 50 } })
  await db.healthCertificate.create({ data: { animalId: blaze.id, certDefId: cogginsTest.id, issuedCycle: 48, expiresAtCycle: 60 } })
  await db.animalWeeklyPoints.create({ data: { animalId: blaze.id, disciplineDefId: racingDiscipline.id, weekStart: new Date("2026-06-30"), points: 145 } })
  await db.animalEquipment.create({ data: { animalId: blaze.id, itemDefId: racingSaddle.id, slot: "SADDLE" } })

  // ── PAST COMPETITION — Spring Stakes ─────────────────────────────────────
  const springStakes = await db.competition.create({
    data: { gameId: game.id, venueId: greenfieldVenue.id, disciplineDefId: racingDiscipline.id, name: "Spring Stakes", maxEntries: 8, maxWaitHours: 24, status: "COMPLETED", expiresAt: new Date("2026-06-30") },
  })

  // ── ANIMAL 2: Adult Female "Duchess" ──────────────────────────────────────
  const duchess = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Duchess", sex: "FEMALE", lifeStageId: adultStage.id,
      generation: 2, ageInCycles: 44, lifeExpectancy: 122,
      disciplineDefId: racingDiscipline.id, fertility: 0.88, breedGeneration: 4,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: duchess.id, statDefId: speedStat.id, innateValue: 79, trainedValue: 14 },
    { animalId: duchess.id, statDefId: enduranceStat.id, innateValue: 77, trainedValue: 10 },
    { animalId: duchess.id, statDefId: agilityStat.id, innateValue: 72, trainedValue: 6 },
    { animalId: duchess.id, statDefId: strengthStat.id, innateValue: 68, trainedValue: 4 },
    { animalId: duchess.id, statDefId: flexibilityStat.id, innateValue: 63, trainedValue: 2 },
    { animalId: duchess.id, statDefId: balanceStat.id, innateValue: 66, trainedValue: 3 },
  ] })
  await createVitals(duchess.id)
  await db.animalPersonality.createMany({ data: [
    { animalId: duchess.id, traitDefId: temperamentTrait.id, value: 55, traitLabel: "Even-Keeled" },
    { animalId: duchess.id, traitDefId: driveTrait.id,       value: 70, traitLabel: "Driven" },
    { animalId: duchess.id, traitDefId: focusTrait.id,       value: 65, traitLabel: "Attentive" },
    { animalId: duchess.id, traitDefId: boldnessTrait.id,    value: 60, traitLabel: "Steady" },
  ] })
  await createGenotypes(duchess.id, {
    overrides: { [limbAlignmentLocus.id]: [laLa, lala] },
    testedLocusIds: [baseColorLocus.id, agoutiLocus.id],
    testedCycle: 40,
  })
  await db.animalBreedComposition.create({ data: { animalId: duchess.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalCompetitionTier.create({ data: { animalId: duchess.id, disciplineDefId: racingDiscipline.id, tierDefId: racingNovice.id } })

  // Duchess competition entry in Spring Stakes
  const duchessEntry = await db.competitionEntry.create({ data: { competitionId: springStakes.id, animalId: duchess.id, playerAccountId: player.id, tierDefId: racingNovice.id } })
  await db.competitionResult.create({ data: { entryId: duchessEntry.id, placement: 1, score: 78.4 } })

  // ── ANIMAL 3: Pregnant Female "Meadow" ────────────────────────────────────
  const meadow = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Meadow", sex: "FEMALE", lifeStageId: adultStage.id,
      generation: 2, ageInCycles: 40, fertility: 0.91, breedGeneration: 3,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: meadow.id, statDefId: speedStat.id, innateValue: 76, trainedValue: 8 },
    { animalId: meadow.id, statDefId: enduranceStat.id, innateValue: 81, trainedValue: 5 },
    { animalId: meadow.id, statDefId: agilityStat.id, innateValue: 70, trainedValue: 3 },
    { animalId: meadow.id, statDefId: strengthStat.id, innateValue: 72, trainedValue: 2 },
    { animalId: meadow.id, statDefId: flexibilityStat.id, innateValue: 67, trainedValue: 1 },
    { animalId: meadow.id, statDefId: balanceStat.id, innateValue: 64, trainedValue: 1 },
  ] })
  await createVitals(meadow.id, { energyCurrent: 65, moodValue: 72, conditionValue: 76, careScore: 82, immunityValue: 60, immunityInnateMax: 85 })
  await db.animalPersonality.createMany({ data: [
    { animalId: meadow.id, traitDefId: temperamentTrait.id, value: 42, traitLabel: "Even-Keeled" },
    { animalId: meadow.id, traitDefId: driveTrait.id,       value: 58, traitLabel: "Focused" },
    { animalId: meadow.id, traitDefId: focusTrait.id,       value: 55, traitLabel: "Attentive" },
    { animalId: meadow.id, traitDefId: boldnessTrait.id,    value: 48, traitLabel: "Steady" },
  ] })
  await createGenotypes(meadow.id)
  await db.animalBreedComposition.create({ data: { animalId: meadow.id, breedId: thoroughbred.id, percentage: 100 } })
  const breedingRecord = await db.breedingRecord.create({ data: { gameId: game.id, sireId: blaze.id, damId: meadow.id, sireSnapshot: { name: "Blaze", generation: 3, breedName: "Thoroughbred" }, damSnapshot: { name: "Meadow", generation: 2, breedName: "Thoroughbred" } } })
  await db.pregnancy.create({ data: { animalId: meadow.id, breedingRecordId: breedingRecord.id, currentCycles: 5, requiredCycles: 12 } })

  // ── ANIMAL 4: Foal "Pip" ──────────────────────────────────────────────────
  const pip = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Pip", sex: "FEMALE", lifeStageId: foalStage.id,
      generation: 4, ageInCycles: 3, fertility: 0.85, breedGeneration: 6,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: pip.id, statDefId: speedStat.id, innateValue: 71 },
    { animalId: pip.id, statDefId: enduranceStat.id, innateValue: 68 },
    { animalId: pip.id, statDefId: agilityStat.id, innateValue: 73 },
    { animalId: pip.id, statDefId: strengthStat.id, innateValue: 65 },
    { animalId: pip.id, statDefId: flexibilityStat.id, innateValue: 62 },
    { animalId: pip.id, statDefId: balanceStat.id, innateValue: 67 },
  ] })
  await createVitals(pip.id, { energyCurrent: 90, moodValue: 85, conditionValue: 90, careScore: 70, immunityValue: 50, immunityInnateMax: 78 })
  await db.animalPersonality.createMany({ data: [
    { animalId: pip.id, traitDefId: temperamentTrait.id, value: 28, traitLabel: "Gentle" },
    { animalId: pip.id, traitDefId: driveTrait.id,       value: 45, traitLabel: "Relaxed" },
    { animalId: pip.id, traitDefId: focusTrait.id,       value: 38, traitLabel: "Distracted" },
    { animalId: pip.id, traitDefId: boldnessTrait.id,    value: 35, traitLabel: "Timid" },
  ] })
  await createGenotypes(pip.id)
  await db.animalBreedComposition.create({ data: { animalId: pip.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.stageActivityLog.create({ data: { animalId: pip.id, stageActivityDefId: foalPlayActivity.id, cycleNumber: 3, performedByPlayerId: player.id } })

  // ── ANIMAL 5: Adolescent "Sparks" ─────────────────────────────────────────
  const sparks = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Sparks", sex: "MALE", lifeStageId: adolescentStage.id,
      generation: 3, ageInCycles: 20, fertility: 0.87, breedGeneration: 4,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: sparks.id, statDefId: speedStat.id, innateValue: 79, trainedValue: 5 },
    { animalId: sparks.id, statDefId: enduranceStat.id, innateValue: 72, trainedValue: 3 },
    { animalId: sparks.id, statDefId: agilityStat.id, innateValue: 76, trainedValue: 2 },
    { animalId: sparks.id, statDefId: strengthStat.id, innateValue: 66, trainedValue: 1 },
    { animalId: sparks.id, statDefId: flexibilityStat.id, innateValue: 61 },
    { animalId: sparks.id, statDefId: balanceStat.id, innateValue: 64 },
  ] })
  await createVitals(sparks.id, { energyCurrent: 88, moodValue: 80, conditionValue: 85, careScore: 74, immunityValue: 68, immunityInnateMax: 86 })
  await db.animalPersonality.createMany({ data: [
    { animalId: sparks.id, traitDefId: temperamentTrait.id, value: 78, traitLabel: "Spirited" },
    { animalId: sparks.id, traitDefId: driveTrait.id,       value: 62, traitLabel: "Focused" },
    { animalId: sparks.id, traitDefId: focusTrait.id,       value: 55, traitLabel: "Attentive" },
    { animalId: sparks.id, traitDefId: boldnessTrait.id,    value: 68, traitLabel: "Steady" },
  ] })
  await createGenotypes(sparks.id)
  await db.animalBreedComposition.create({ data: { animalId: sparks.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.stageActivityLog.create({ data: { animalId: sparks.id, stageActivityDefId: adolescentBoldActivity.id, cycleNumber: 20, performedByPlayerId: player.id } })
  await db.trainingLog.create({ data: { animalId: sparks.id, trainingActionDefId: agilityTraining.id, intensityTierDefId: lowIntensity.id, cycleNumber: 19, statGained: 1.4, energyUsed: 5, performedByPlayerId: player.id } })

  // ── ANIMAL 6: Senior "Elder" ──────────────────────────────────────────────
  const elder = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Elder", sex: "MALE", lifeStageId: seniorStage.id,
      generation: 1, ageInCycles: 108, lifeExpectancy: 115,
      disciplineDefId: racingDiscipline.id, fertility: 0.3, breedGeneration: 2,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: elder.id, statDefId: speedStat.id, innateValue: 88, trainedValue: 42 },
    { animalId: elder.id, statDefId: enduranceStat.id, innateValue: 81, trainedValue: 35 },
    { animalId: elder.id, statDefId: agilityStat.id, innateValue: 76, trainedValue: 28 },
    { animalId: elder.id, statDefId: strengthStat.id, innateValue: 78, trainedValue: 20 },
    { animalId: elder.id, statDefId: flexibilityStat.id, innateValue: 70, trainedValue: 15 },
    { animalId: elder.id, statDefId: balanceStat.id, innateValue: 73, trainedValue: 18 },
  ] })
  await createVitals(elder.id, { energyCurrent: 55, moodValue: 65, conditionValue: 60, careScore: 90, immunityValue: 45, immunityInnateMax: 70 })
  await db.animalPersonality.createMany({ data: [
    { animalId: elder.id, traitDefId: temperamentTrait.id, value: 60, traitLabel: "Even-Keeled" },
    { animalId: elder.id, traitDefId: driveTrait.id,       value: 85, traitLabel: "Driven" },
    { animalId: elder.id, traitDefId: focusTrait.id,       value: 80, traitLabel: "Laser-Focused" },
    { animalId: elder.id, traitDefId: boldnessTrait.id,    value: 77, traitLabel: "Bold" },
  ] })
  await createGenotypes(elder.id, {
    overrides: {
      [limbAlignmentLocus.id]: [laLa, laLa],
      [hipAngleLocus.id]:      [haHa, haHa],
      [shoulderSlopeLocus.id]: [ssSs, ssSs],
    },
    testedLocusIds: [baseColorLocus.id, agoutiLocus.id, creamLocus.id, hyppLocus.id, gbedLocus.id, herdaLocus.id],
    testedCycle: 100,
  })
  await db.animalBreedComposition.create({ data: { animalId: elder.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalConformationScore.create({ data: { animalId: elder.id, breedId: thoroughbred.id, score: 87.0 } })
  await db.animalConformationSectionScore.createMany({ data: [
    { animalId: elder.id, breedId: thoroughbred.id, sectionId: headSection.id, score: 85.0 },
    { animalId: elder.id, breedId: thoroughbred.id, sectionId: neckSection.id, score: 88.0 },
    { animalId: elder.id, breedId: thoroughbred.id, sectionId: backSection.id, score: 86.0 },
    { animalId: elder.id, breedId: thoroughbred.id, sectionId: legsSection.id, score: 90.0 },
    { animalId: elder.id, breedId: thoroughbred.id, sectionId: coatSection.id, score: 84.0 },
  ] })
  await db.animalCompetitionTier.create({ data: { animalId: elder.id, disciplineDefId: racingDiscipline.id, tierDefId: racingOpen.id } })
  await db.animalTitle.create({ data: { animalId: elder.id, titleDefId: championTitle.id, cycleNumber: 60 } })

  // Elder competition entry in Spring Stakes
  const elderEntry = await db.competitionEntry.create({ data: { competitionId: springStakes.id, animalId: elder.id, playerAccountId: player.id, tierDefId: racingOpen.id } })
  await db.competitionResult.create({ data: { entryId: elderEntry.id, placement: 2, score: 91.2 } })

  // Blaze entry in Spring Stakes
  const blazeEntry = await db.competitionEntry.create({ data: { competitionId: springStakes.id, animalId: blaze.id, playerAccountId: player.id, tierDefId: racingOpen.id } })
  await db.competitionResult.create({ data: { entryId: blazeEntry.id, placement: 1, score: 95.4 } })

  // ── ANIMAL 7: Deceased "Ghost" ────────────────────────────────────────────
  const ghost = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Ghost", sex: "FEMALE", lifeStageId: seniorStage.id,
      status: "DECEASED", generation: 2, ageInCycles: 121,
      diedAt: new Date("2026-06-15"), causeOfDeath: "Natural causes",
      lifeExpectancy: 120, fertility: 0.0, breedGeneration: 3,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: ghost.id, statDefId: speedStat.id, innateValue: 75, trainedValue: 30 },
    { animalId: ghost.id, statDefId: enduranceStat.id, innateValue: 79, trainedValue: 25 },
    { animalId: ghost.id, statDefId: agilityStat.id, innateValue: 65, trainedValue: 18 },
    { animalId: ghost.id, statDefId: strengthStat.id, innateValue: 68, trainedValue: 12 },
    { animalId: ghost.id, statDefId: flexibilityStat.id, innateValue: 62, trainedValue: 8 },
    { animalId: ghost.id, statDefId: balanceStat.id, innateValue: 64, trainedValue: 10 },
  ] })
  await db.animalBreedComposition.create({ data: { animalId: ghost.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── ANIMAL 8: Buried "Ash" ────────────────────────────────────────────────
  const ash = await db.animal.create({
    data: {
      gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id,
      name: "Ash", sex: "MALE", lifeStageId: adultStage.id,
      status: "BURIED", generation: 2, ageInCycles: 67,
      diedAt: new Date("2026-05-01"), causeOfDeath: "Colic",
      fertility: 0.0, breedGeneration: 3,
    },
  })
  await db.animalStat.createMany({ data: [
    { animalId: ash.id, statDefId: speedStat.id, innateValue: 80, trainedValue: 22 },
    { animalId: ash.id, statDefId: enduranceStat.id, innateValue: 73, trainedValue: 15 },
    { animalId: ash.id, statDefId: agilityStat.id, innateValue: 70, trainedValue: 10 },
    { animalId: ash.id, statDefId: strengthStat.id, innateValue: 66, trainedValue: 8 },
    { animalId: ash.id, statDefId: flexibilityStat.id, innateValue: 60, trainedValue: 5 },
    { animalId: ash.id, statDefId: balanceStat.id, innateValue: 63, trainedValue: 6 },
  ] })
  await db.animalBreedComposition.create({ data: { animalId: ash.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── BLAZE PEDIGREE — Depth 1 (parents) ───────────────────────────────────
  const thunderstrike = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Thunderstrike", sex: "MALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 2, ageInCycles: 116, diedAt: new Date("2024-01-01"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 4 } })
  await db.animalBreedComposition.create({ data: { animalId: thunderstrike.id, breedId: thoroughbred.id, percentage: 100 } })

  const silverBell = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Silver Bell", sex: "FEMALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 2, ageInCycles: 114, diedAt: new Date("2024-06-01"), inbreedingCoefficient: 0.01, fertility: 0.0, breedGeneration: 4 } })
  await db.animalBreedComposition.create({ data: { animalId: silverBell.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── BLAZE PEDIGREE — Depth 2 (grandparents) ──────────────────────────────
  const ironDuke = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Iron Duke", sex: "MALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 1, ageInCycles: 120, diedAt: new Date("2022-03-01"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 3 } })
  await db.animalBreedComposition.create({ data: { animalId: ironDuke.id, breedId: thoroughbred.id, percentage: 100 } })

  const morningFrost = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Morning Frost", sex: "FEMALE", lifeStageId: seniorStage.id, generation: 1, ageInCycles: 98, inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 3 } })
  await db.animalBreedComposition.create({ data: { animalId: morningFrost.id, breedId: thoroughbred.id, percentage: 100 } })

  const nobleStar = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Noble Star", sex: "MALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 118, diedAt: new Date("2022-08-10"), inbreedingCoefficient: 0.02, fertility: 0.0, breedGeneration: 3 } })
  await db.animalBreedComposition.create({ data: { animalId: nobleStar.id, breedId: thoroughbred.id, percentage: 100 } })

  const velvetRose = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Velvet Rose", sex: "FEMALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 1, ageInCycles: 112, diedAt: new Date("2023-04-22"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 3 } })
  await db.animalBreedComposition.create({ data: { animalId: velvetRose.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── BLAZE PEDIGREE — Depth 3 (great-grandparents) ────────────────────────
  const midnightFury = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Midnight Fury", sex: "MALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 130, diedAt: new Date("2016-02-14"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: midnightFury.id, breedId: thoroughbred.id, percentage: 100 } })

  const goldenHaze = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Golden Haze", sex: "FEMALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 128, diedAt: new Date("2017-05-05"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: goldenHaze.id, breedId: thoroughbred.id, percentage: 100 } })

  const darkWind = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Dark Wind", sex: "MALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 126, diedAt: new Date("2018-11-30"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: darkWind.id, breedId: thoroughbred.id, percentage: 100 } })

  const riverMist = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "River Mist", sex: "FEMALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 1, ageInCycles: 122, diedAt: new Date("2019-01-18"), inbreedingCoefficient: 0.03, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: riverMist.id, breedId: thoroughbred.id, percentage: 100 } })

  const stormKing = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Storm King", sex: "MALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 135, diedAt: new Date("2015-08-08"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: stormKing.id, breedId: thoroughbred.id, percentage: 100 } })

  const crimsonDawn = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Crimson Dawn", sex: "FEMALE", lifeStageId: seniorStage.id, status: "BURIED", generation: 1, ageInCycles: 132, diedAt: new Date("2016-03-27"), inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: crimsonDawn.id, breedId: thoroughbred.id, percentage: 100 } })

  const ironCrown = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Iron Crown", sex: "MALE", lifeStageId: seniorStage.id, status: "DECEASED", generation: 1, ageInCycles: 120, diedAt: new Date("2017-12-01"), inbreedingCoefficient: 0.01, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: ironCrown.id, breedId: thoroughbred.id, percentage: 100 } })

  const silverMoon = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Silver Moon", sex: "FEMALE", lifeStageId: seniorStage.id, generation: 1, ageInCycles: 102, inbreedingCoefficient: 0.0, fertility: 0.0, breedGeneration: 2 } })
  await db.animalBreedComposition.create({ data: { animalId: silverMoon.id, breedId: thoroughbred.id, percentage: 100 } })

  // ── BLAZE ANCESTOR RECORDS (positions match pedigree tree layout) ─────────
  await db.animalAncestor.createMany({ data: [
    // Depth 1 — positions 2 (sire) and 3 (dam)
    { animalId: blaze.id, ancestorId: thunderstrike.id, depth: 1, position: 2 },
    { animalId: blaze.id, ancestorId: silverBell.id,    depth: 1, position: 3 },
    // Depth 2 — positions 4–7
    { animalId: blaze.id, ancestorId: ironDuke.id,      depth: 2, position: 4 },
    { animalId: blaze.id, ancestorId: morningFrost.id,  depth: 2, position: 5 },
    { animalId: blaze.id, ancestorId: nobleStar.id,     depth: 2, position: 6 },
    { animalId: blaze.id, ancestorId: velvetRose.id,    depth: 2, position: 7 },
    // Depth 3 — positions 8–15
    { animalId: blaze.id, ancestorId: midnightFury.id,  depth: 3, position: 8 },
    { animalId: blaze.id, ancestorId: goldenHaze.id,    depth: 3, position: 9 },
    { animalId: blaze.id, ancestorId: darkWind.id,      depth: 3, position: 10 },
    { animalId: blaze.id, ancestorId: riverMist.id,     depth: 3, position: 11 },
    { animalId: blaze.id, ancestorId: stormKing.id,     depth: 3, position: 12 },
    { animalId: blaze.id, ancestorId: crimsonDawn.id,   depth: 3, position: 13 },
    { animalId: blaze.id, ancestorId: ironCrown.id,     depth: 3, position: 14 },
    { animalId: blaze.id, ancestorId: silverMoon.id,    depth: 3, position: 15 },
  ] })

  // ── BLAZE OFFSPRING — Blaze × Duchess ────────────────────────────────────
  const pastBreedingRecord = await db.breedingRecord.create({ data: { gameId: game.id, sireId: blaze.id, damId: duchess.id, sireSnapshot: { name: "Blaze", generation: 3, breedName: "Thoroughbred" }, damSnapshot: { name: "Duchess", generation: 2, breedName: "Thoroughbred" } } })
  const completedPregnancy = await db.pregnancy.create({ data: { animalId: duchess.id, breedingRecordId: pastBreedingRecord.id, currentCycles: 12, requiredCycles: 12, isCompleted: true, completedAt: new Date("2025-10-01") } })

  const storm = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Storm", sex: "MALE", lifeStageId: foalStage.id, generation: 4, ageInCycles: 6, inbreedingCoefficient: 0.015, fertility: 0.9, breedGeneration: 6 } })
  await db.animalBreedComposition.create({ data: { animalId: storm.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalStat.createMany({ data: [
    { animalId: storm.id, statDefId: speedStat.id, innateValue: 80 },
    { animalId: storm.id, statDefId: enduranceStat.id, innateValue: 76 },
    { animalId: storm.id, statDefId: agilityStat.id, innateValue: 71 },
    { animalId: storm.id, statDefId: strengthStat.id, innateValue: 68 },
    { animalId: storm.id, statDefId: flexibilityStat.id, innateValue: 64 },
    { animalId: storm.id, statDefId: balanceStat.id, innateValue: 66 },
  ] })
  await createVitals(storm.id, { energyCurrent: 92, moodValue: 88, conditionValue: 92, careScore: 72, immunityValue: 52, immunityInnateMax: 80 })
  await createGenotypes(storm.id, { overrides: { [hyppLocus.id]: [hpH, hph] } }) // inherited carrier

  const ember = await db.animal.create({ data: { gameId: game.id, playerAccountId: player.id, breedId: thoroughbred.id, name: "Ember", sex: "FEMALE", lifeStageId: foalStage.id, generation: 4, ageInCycles: 6, inbreedingCoefficient: 0.015, fertility: 0.9, breedGeneration: 6 } })
  await db.animalBreedComposition.create({ data: { animalId: ember.id, breedId: thoroughbred.id, percentage: 100 } })
  await db.animalStat.createMany({ data: [
    { animalId: ember.id, statDefId: speedStat.id, innateValue: 77 },
    { animalId: ember.id, statDefId: enduranceStat.id, innateValue: 79 },
    { animalId: ember.id, statDefId: agilityStat.id, innateValue: 74 },
    { animalId: ember.id, statDefId: strengthStat.id, innateValue: 69 },
    { animalId: ember.id, statDefId: flexibilityStat.id, innateValue: 65 },
    { animalId: ember.id, statDefId: balanceStat.id, innateValue: 67 },
  ] })
  await createVitals(ember.id, { energyCurrent: 90, moodValue: 85, conditionValue: 90, careScore: 68, immunityValue: 50, immunityInnateMax: 78 })
  await createGenotypes(ember.id)

  await db.pregnancyOffspring.createMany({ data: [
    { animalId: storm.id, pregnancyId: completedPregnancy.id, birthOrder: 1 },
    { animalId: ember.id, pregnancyId: completedPregnancy.id, birthOrder: 2 },
  ] })

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(`\nSeed complete!`)
  console.log(`  Game:   ${game.name} (ID: ${game.id})`)
  console.log(`  Player: ${player.username} (ID: ${player.id})`)
  console.log(`  Animals: Blaze · Duchess · Meadow · Pip · Sparks · Elder · Ghost · Ash · Storm · Ember`)
  console.log(`  Ancestors seeded for Blaze: 14 (full 3-gen pedigree)`)
  console.log(`\nAnimal IDs for tRPC testing:`)
  console.log(`  Blaze (adult male, full pedigree + offspring): ${blaze.id}`)
  console.log(`  Duchess (adult female):                        ${duchess.id}`)
  console.log(`  Meadow (pregnant):                             ${meadow.id}`)
  console.log(`  Pip (foal):                                    ${pip.id}`)
  console.log(`  Sparks (adolescent):                           ${sparks.id}`)
  console.log(`  Elder (senior):                                ${elder.id}`)
  console.log(`  Ghost (deceased):                              ${ghost.id}`)
  console.log(`  Ash (buried):                                  ${ash.id}`)
  console.log(`  Storm (foal, Blaze offspring):                 ${storm.id}`)
  console.log(`  Ember (foal, Blaze offspring):                 ${ember.id}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
