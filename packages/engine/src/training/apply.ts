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
      const mood = await tx.animalMood.findUnique({ where: { animalId: animalId } })
      if ((mood?.value ?? 9) < tier.minMood) {
        throw new Error("Mood too low for this intensity tier")
      }
    }

    if (tier.minCondition !== null) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId: animalId } })
      if ((condition?.value ?? 9) < tier.minCondition) {
        throw new Error("Condition too low for this intensity tier")
      }
    }

    const statGained = action.baseGain * tier.gainMultiplier
    const energyUsed = tier.energyCost

    const energy = await tx.animalEnergy.findUnique({ where: { animalId: animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)

    await tx.animalEnergy.update({
      where: { animalId: animalId },
      data: { currentEnergy: Math.max(energy.currentEnergy - energyUsed, 0) },
    })

    const stat = await tx.animalStat.upsert({
      where: { animalId_statDefId: { animalId: animalId, statDefId: action.statDefId } },
      create: { animalId: animalId, statDefId: action.statDefId, innateValue: 0, trainedValue: statGained },
      update: { trainedValue: { increment: statGained } },
    })

    await tx.animalStatHistory.upsert({
      where: {
        animalId_statDefId_cycleNumber: {
          animalId: animalId,
          statDefId: action.statDefId,
          cycleNumber: cycleNumber,
        },
      },
      create: { animalId: animalId, statDefId: action.statDefId, cycleNumber: cycleNumber, trainedValue: stat.trainedValue },
      update: { trainedValue: stat.trainedValue },
    })

    return tx.trainingLog.create({
      data: {
        animalId: animalId,
        trainingActionDefId: trainingActionDefId,
        intensityTierDefId: intensityTierDefId,
        cycleNumber: cycleNumber,
        statGained,
        energyUsed,
        performedByPlayerId: performedByPlayerId,
      },
    })

  })
}