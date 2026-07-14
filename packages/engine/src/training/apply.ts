import { db } from "@sim-engine/db";

type Client = typeof db

export async function applyTrainingAction(
  client: Client,
  input: {
    animalId: string
    trainingActionDefId: string
    intensityTierDefId: string
    performedByPlayerId: string | null
    cycleNumber: number
  }
) {
  return client.$transaction(async (tx) => {

    const { animalId, trainingActionDefId, intensityTierDefId, performedByPlayerId, cycleNumber } = input

    const action = await tx.trainingActionDef.findUniqueOrThrow({
      where: { id: trainingActionDefId },
    })

    const tier = await tx.intensityTierDef.findUniqueOrThrow({
      where: { id: intensityTierDefId },
    })

    if (tier.minMood !== null) {
      const mood = await tx.animalMood.findUnique({ where: { animalId } })
      if ((mood?.value ?? 0) < tier.minMood) {
        throw new Error("Mood too low for this intensity tier")
      }
    }

    if (tier.minCondition !== null) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId } })
      if ((condition?.value ?? 0) < tier.minCondition) {
        throw new Error("Condition too low for this intensity tier")
      }
    }

    const animalStage = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { lifeStage: { select: { energyCostMultiplier: true } } },
    })
    const energyUsed = tier.energyCost * animalStage.lifeStage.energyCostMultiplier
    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)
    if (energy.currentEnergy < energyUsed) throw new Error("Not enough energy")

    const currentStat = await tx.animalStat.findUniqueOrThrow({
      where: { animalId_statDefId: { animalId, statDefId: action.statDefId } },
      select: { innateValue: true, trainedValue: true },
    })

    const config = await tx.gameConfig.findUniqueOrThrow({
      where: { gameId: action.gameId },
      select: { trainingCeilingMultiplier: true, conditionWorkGain: true },
    })

    const cap = currentStat.innateValue * config.trainingCeilingMultiplier
    if (currentStat.trainedValue >= cap) throw new Error("Stat is already at training cap")

    const rawGain = action.baseGain * tier.gainMultiplier
    const statGained = Math.min(rawGain, cap - currentStat.trainedValue)

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: energy.currentEnergy - energyUsed },
    })

    if (config.conditionWorkGain > 0) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId } })
      if (condition) {
        await tx.animalCondition.update({
          where: { animalId },
          data: { value: Math.min(100, condition.value + config.conditionWorkGain) },
        })
      }
    }

    const stat = await tx.animalStat.update({
      where: { animalId_statDefId: { animalId, statDefId: action.statDefId } },
      data: { trainedValue: { increment: statGained } },
    })

    await tx.animalStatHistory.upsert({
      where: {
        animalId_statDefId_cycleNumber: {
          animalId,
          statDefId: action.statDefId,
          cycleNumber,
        },
      },
      create: { animalId, statDefId: action.statDefId, cycleNumber, trainedValue: stat.trainedValue },
      update: { trainedValue: stat.trainedValue },
    })

    return tx.trainingLog.create({
      data: {
        animalId,
        trainingActionDefId,
        intensityTierDefId,
        cycleNumber,
        statGained,
        energyUsed,
        performedByPlayerId,
      },
    })

  })
}
