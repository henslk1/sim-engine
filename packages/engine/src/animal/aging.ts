import { db } from "@sim-engine/db";

type Client = typeof db

export async function advanceAnimalAging(client: Client, animalId: string) {
  const animal = await client.animal.findUniqueOrThrow({
    where: { id: animalId },
    include: { lifeStage: true },
  })

  const [gameConfig, lifeStageDefs] = await Promise.all([
    client.gameConfig.findUniqueOrThrow({ where: { gameId: animal.gameId } }),
    client.lifeStageDef.findMany({
      where: { gameId: animal.gameId },
      orderBy: { stageIndex: "asc" },
    }),
  ])

  const newAge = animal.ageInCycles + 1

  const correctStage = lifeStageDefs.find(
    s => newAge >= s.minCycle && newAge <= s.ageCap
  )

  if (!correctStage) {
    await client.animal.update({
      where: { id: animalId },
      data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "old_age" },
    })
    return
  }

  // Death roll
  const letThreshold = animal.lifeExpectancy ?? correctStage.deathChanceStartCycle
  const rollStart = letThreshold !== null
    ? Math.min(letThreshold, correctStage.ageCap)
    : correctStage.ageCap
    
  if (correctStage.deathChancePerCycle !== null && newAge >= rollStart) {
    const cyclesPast = newAge - rollStart + 1
    const chance = Math.min(1, cyclesPast * correctStage.deathChancePerCycle)
    if (Math.random() < chance) {
      await client.animal.update({
        where: { id: animalId },
        data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "natural"},
      })
      return
    }
  }

  // Fatal condition death checks
  const fatalRecords = await client.animalHealthRecord.findMany({
    where: { animalId, isActive: true, conditionDef: { isFatal: true } },
    include: { conditionDef: true },
  })

  for (const record of fatalRecords) {
    if (record.conditionDef.fatalMaxCycle !== null && newAge >= record.conditionDef.fatalMaxCycle) {
      await client.animal.update({
        where: { id: animalId },
        data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: record.conditionDef.name },
      })
      return
    }
    if (record.conditionDef.fatalityChance !== null && Math.random() < record.conditionDef.fatalityChance) {
      await client.animal.update({
        where: { id: animalId },
        data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: record.conditionDef.name },
      })
      return
    }
  }

  // Survived
  await client.animal.update({
    where: { id: animalId },
    data: {
      ageInCycles: newAge,
      ...(correctStage.id !== animal.lifeStageId && { lifeStageId: correctStage.id }),
    },
  })

  // Illness contraction roll
  const immunity = await client.animalImmunity.findUnique({ where: { animalId } })
  if (immunity && immunity.innateMax > 0) {
    const immunityRatio = immunity.value / immunity.innateMax
    if (Math.random() > immunityRatio) {
      const eligible = await client.healthConditionDef.findMany({
        where: {
          gameId: animal.gameId,
          conditionType: "ILLNESS",
          isGenetic: false,
          healthRecords: { none: { animalId, isActive: true } },
        },
      })
      if (eligible.length > 0) {
        const picked = eligible[Math.floor(Math.random() * eligible.length)]!
        await client.animalHealthRecord.create({
          data: { animalId, conditionDefId: picked.id, diagnosedCycle: newAge, isActive: true },
        })
      }
    }
  }

  // Genetic condition onset rolls
  const genotypes = await client.animalGenotype.findMany({ where: {animalId } })
  for (const genotype of genotypes) {
    const rule = await client.expressionRule.findUnique({
      where: {
        locusId_alleleOneId_alleleTwoId: {
          locusId: genotype.locusId,
          alleleOneId: genotype.alleleOneId,
          alleleTwoId: genotype.alleleTwoId,
        },
      },
      include: { healthConditionDef: true },
    })

    if (!rule?.healthConditionDef) continue

    const condDef = rule.healthConditionDef
    if (condDef.onsetMinCycle !== null && newAge < condDef.onsetMinCycle) continue

    const alreadyActive = await client.animalHealthRecord.findFirst({
      where: { animalId, conditionDefId: condDef.id, isActive: true },
    })
    if (alreadyActive) continue

    if (Math.random() < (rule.penetrance ?? 1.0)) {
      await client.animalHealthRecord.create({
        data: { animalId, conditionDefId: condDef.id, diagnosedCycle: newAge, isActive: true },
      })
    }
  }


  // Advance gestation if pregnant
  const pregnancy = await client.pregnancy.findFirst({
    where: { animalId, isCompleted: false},
  })

  if (pregnancy) {
    const newCycles = pregnancy.currentCycles + 1
    await client.pregnancy.update({
      where: { id: pregnancy.id },
      data: {
        currentCycles: newCycles,
        ...(newCycles >= pregnancy.requiredCycles && {
          isCompleted: true,
          completedAt: new Date(),
        }),
      },
    })
  }

  // Fetch stats and health conditions
  const [energy, mood, condition, careScore, activeHealthRecords] = await Promise.all([
    client.animalEnergy.findUnique({ where: { animalId } }),
    client.animalMood.findUnique({ where: { animalId } }),
    client.animalCondition.findUnique({ where: { animalId } }),
    client.animalCareScore.findUnique({ where: { animalId } }),
    client.animalHealthRecord.findMany({
      where: { animalId, isActive: true },
      include: { conditionDef: true },
    })
  ])

  const conditionEnergyEffect = activeHealthRecords.reduce(
    (sum, r) => sum + (r.conditionDef.energyEffect ?? 0), 0
  )
  const carePenalty = careScore && careScore.score < gameConfig.energyLowCareThreshold
    ? gameConfig.energyLowCarePenalty
    : 0

  await Promise.all([
    energy && client.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: Math.max(0, energy.maxEnergy + conditionEnergyEffect - carePenalty) },
    }),
    mood && client.animalMood.update({
      where: { animalId },
      data: { value: Math.max(0, mood.value - gameConfig.moodDecayRate) },
    }),
    condition && client.animalCondition.update({
      where: { animalId },
      data: { value: Math.max(0, condition.value - gameConfig.conditionDecayRate) },
    }),
    careScore && client.animalCareScore.update({
      where: { animalId },
      data: { score: Math.max(gameConfig.careScoreFloor, careScore.score - gameConfig.careScoreDecayRate) },
    }),
    immunity && client.animalImmunity.update({
      where: { animalId },
      data: { value: Math.max(0, immunity.value - gameConfig.immunityDecayRate) },
    }),
  ].filter(Boolean))
}