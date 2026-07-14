import { db } from "@sim-engine/db";

type Client = typeof db

export async function advanceAnimalAging(client: Client, animalId: string): Promise<{ pregnancyCompleted?: string }> {
  return client.$transaction(async (tx) => {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      include: { lifeStage: true },
    })

    const [gameConfig, lifeStageDefs] = await Promise.all([
      tx.gameConfig.findUniqueOrThrow({ where: { gameId: animal.gameId } }),
      tx.lifeStageDef.findMany({
        where: { gameId: animal.gameId },
        orderBy: { stageIndex: "asc" },
      }),
    ])

    const newAge = animal.ageInCycles + 1

    const correctStage = lifeStageDefs.find(
      s => newAge >= s.minCycle && newAge <= s.ageCap
    )

    if (!correctStage) {
      await tx.animal.update({
        where: { id: animalId },
        data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "old_age" },
      })
      return {}
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
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "natural" },
        })
        return {}
      }
    }

    // Fatal condition death checks
    const fatalRecords = await tx.animalHealthRecord.findMany({
      where: { animalId, isActive: true, conditionDef: { isFatal: true } },
      include: { conditionDef: true },
    })

    for (const record of fatalRecords) {
      if (record.conditionDef.fatalMaxCycle !== null && newAge >= record.conditionDef.fatalMaxCycle) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: record.conditionDef.name },
        })
        return {}
      }
      if (record.conditionDef.fatalityChance !== null && Math.random() < record.conditionDef.fatalityChance) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: record.conditionDef.name },
        })
        return {}
      }
    }

    // Survived
    await tx.animal.update({
      where: { id: animalId },
      data: {
        ageInCycles: newAge,
        ...(correctStage.id !== animal.lifeStageId && { lifeStageId: correctStage.id }),
      },
    })

    // Illness contraction roll
    const immunity = await tx.animalImmunity.findUnique({ where: { animalId } })
    if (immunity && immunity.innateMax > 0) {
      const immunityRatio = immunity.value / immunity.innateMax
      if (Math.random() > immunityRatio) {
        const eligible = await tx.healthConditionDef.findMany({
          where: {
            gameId: animal.gameId,
            conditionType: "ILLNESS",
            isGenetic: false,
            healthRecords: { none: { animalId, isActive: true } },
          },
        })
        if (eligible.length > 0) {
          const picked = eligible[Math.floor(Math.random() * eligible.length)]!
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: picked.id, diagnosedCycle: newAge, isActive: true },
          })
        }
      }
    }

    // Genetic condition onset rolls
    const genotypes = await tx.animalGenotype.findMany({ where: { animalId } })
    for (const genotype of genotypes) {
      const rule = await tx.expressionRule.findUnique({
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

      const alreadyActive = await tx.animalHealthRecord.findFirst({
        where: { animalId, conditionDefId: condDef.id, isActive: true },
      })
      if (alreadyActive) continue

      if (Math.random() < (rule.penetrance ?? 1.0)) {
        await tx.animalHealthRecord.create({
          data: { animalId, conditionDefId: condDef.id, diagnosedCycle: newAge, isActive: true },
        })
      }
    }

    // Advance gestation if pregnant
    const pregnancy = await tx.pregnancy.findFirst({
      where: { animalId, isCompleted: false },
    })

    let pregnancyCompleted: string | undefined
    if (pregnancy) {
      const newCycles = pregnancy.currentCycles + 1
      const justCompleted = newCycles >= pregnancy.requiredCycles
      await tx.pregnancy.update({
        where: { id: pregnancy.id },
        data: {
          currentCycles: newCycles,
          ...(justCompleted && { isCompleted: true, completedAt: new Date() }),
        },
      })
      if (justCompleted) pregnancyCompleted = pregnancy.id
    }

    // Check if work was done this cycle — suppresses condition decay
    const currentCycle = animal.ageInCycles
    const [workedThisCycle, energy, mood, condition, careScore, activeHealthRecords] = await Promise.all([
      Promise.all([
        tx.trainingLog.count({ where: { animalId, cycleNumber: currentCycle } }),
        tx.competitionEntry.count({ where: { animalId, cycleNumber: currentCycle } }),
      ]).then(([t, c]) => t + c > 0),
      tx.animalEnergy.findUnique({ where: { animalId } }),
      tx.animalMood.findUnique({ where: { animalId } }),
      tx.animalCondition.findUnique({ where: { animalId } }),
      tx.animalCareScore.findUnique({ where: { animalId } }),
      tx.animalHealthRecord.findMany({
        where: { animalId, isActive: true },
        include: { conditionDef: true },
      }),
    ])

    const conditionEnergyEffect = activeHealthRecords.reduce(
      (sum, r) => sum + (r.conditionDef.energyEffect ?? 0), 0
    )
    const neglected = careScore != null && careScore.score < gameConfig.energyLowCareThreshold
    const carePenalty = neglected ? gameConfig.energyLowCarePenalty : 0

    const newEnergy = energy
      ? Math.max(0, (neglected ? energy.currentEnergy : energy.maxEnergy) + conditionEnergyEffect - carePenalty)
      : null

    // Neglect death: energy drained to 0 by care penalty → rolling death chance each cycle
    if (neglected && newEnergy === 0 && energy && energy.maxEnergy > 0) {
      const neglectDeathChance = carePenalty / energy.maxEnergy
      if (Math.random() < neglectDeathChance) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "neglect" },
        })
        return {}
      }
    }

    await Promise.all([
      newEnergy !== null && tx.animalEnergy.update({
        where: { animalId },
        data: { currentEnergy: newEnergy },
      }),
      mood && tx.animalMood.update({
        where: { animalId },
        data: { value: Math.max(0, mood.value - gameConfig.moodDecayRate) },
      }),
      condition && !workedThisCycle && tx.animalCondition.update({
        where: { animalId },
        data: { value: Math.max(0, condition.value - gameConfig.conditionDecayRate) },
      }),
      careScore && tx.animalCareScore.update({
        where: { animalId },
        data: { score: Math.max(gameConfig.careScoreFloor, careScore.score - gameConfig.careScoreDecayRate) },
      }),
      immunity && tx.animalImmunity.update({
        where: { animalId },
        data: { value: Math.max(0, immunity.value - gameConfig.immunityDecayRate) },
      }),
    ].filter(Boolean))

    return { pregnancyCompleted }
  })
}
