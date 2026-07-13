import { db } from "@sim-engine/db"

type Client = typeof db

function labelForValue(value: number, ranges: { label: string; minValue: number; maxValue: number }[]): string | null {
  return ranges.find((r) => value >= r.minValue && value <= r.maxValue)?.label ?? null
}

export async function applyStageActivity(
  client: Client,
  input: {
    animalId: string
    stageActivityDefId: string
    performedByPlayerId: string | null
    cycleNumber: number
  }
) {
  return client.$transaction(async (tx) => {
    const { animalId, stageActivityDefId, performedByPlayerId, cycleNumber } = input

    const activity = await tx.stageActivityDef.findUniqueOrThrow({
      where: { id: stageActivityDefId },
      select: { traitDefId: true, traitEffect: true, energyCost: true, lifeStageId: true },
    })

    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { lifeStageId: true },
    })

    if (animal.lifeStageId !== activity.lifeStageId) {
      throw new Error("This activity is not available at the animal's current life stage")
    }

    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)
    if (energy.currentEnergy < activity.energyCost) throw new Error("Not enough energy")

    const personality = await tx.animalPersonality.findUniqueOrThrow({
      where: { animalId_traitDefId: { animalId, traitDefId: activity.traitDefId } },
      select: {
        value: true,
        personalityModifier: true,
        traitDef: { select: { labelRanges: { select: { label: true, minValue: true, maxValue: true } } } },
      },
    })

    const ranges = personality.traitDef.labelRanges
    const innateLabel = labelForValue(personality.value, ranges)
    const currentEffective = personality.value + personality.personalityModifier
    const currentLabel = labelForValue(currentEffective, ranges)

    if (innateLabel !== currentLabel) {
      throw new Error("This trait has already shifted and cannot be modified further")
    }

    const newModifier = personality.personalityModifier + activity.traitEffect
    const newEffective = Math.max(0, Math.min(100, personality.value + newModifier))
    const clampedModifier = newEffective - personality.value
    const newLabel = labelForValue(newEffective, ranges)

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: { decrement: activity.energyCost } },
    })

    await tx.animalPersonality.update({
      where: { animalId_traitDefId: { animalId, traitDefId: activity.traitDefId } },
      data: { personalityModifier: clampedModifier, traitLabel: newLabel },
    })

    return tx.stageActivityLog.create({
      data: { animalId, stageActivityDefId, cycleNumber, performedByPlayerId },
    })
  })
}
