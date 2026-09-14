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

    const trainingRestrictions = await tx.activityRestriction.findMany({
      where: { animalId, isActive: true, restrictionType: { in: ["TRAINING", "ALL"] } },
      select: { maxIntensityTier: true },
    })
    for (const restriction of trainingRestrictions) {
      if (restriction.maxIntensityTier !== null) {
        if (tier.tierIndex > restriction.maxIntensityTier) {
          throw new Error(`Training is restricted to intensity tier ${restriction.maxIntensityTier} or lower`)
        }
      } else {
        throw new Error("Training is currently restricted for this animal")
      }
    }

    const animalStage = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { isTutorialAnimal: true, lifeStage: { select: { energyCostMultiplier: true } } },
    })
    const energyUsed = tier.energyCost * animalStage.lifeStage.energyCostMultiplier
    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)
    if (energy.currentEnergy < energyUsed) throw new Error("Not enough energy")

    const [currentStat, config, personality] = await Promise.all([
      tx.animalStat.findUniqueOrThrow({
        where: { animalId_statDefId: { animalId, statDefId: action.statDefId } },
        select: { innateValue: true, trainedValue: true },
      }),
      tx.gameConfig.findUniqueOrThrow({
        where: { gameId: action.gameId },
        select: { trainingCeilingMultiplier: true, conditionWorkGain: true },
      }),
      tx.animalPersonality.findMany({
        where: { animalId },
        select: {
          value: true,
          personalityModifier: true,
          traitDef: { select: { labelRanges: { select: { minValue: true, maxValue: true, trainingModifier: true } } } },
        },
      }),
    ])

    const personalityCapMod = personality.reduce((sum, p) => {
      const effective = p.value + p.personalityModifier
      const range = p.traitDef.labelRanges.find(r => effective >= r.minValue && effective <= r.maxValue)
      return sum + (range?.trainingModifier ?? 0)
    }, 0)
    const cap = currentStat.innateValue * (config.trainingCeilingMultiplier + personalityCapMod)
    if (currentStat.trainedValue >= cap) throw new Error("Stat is already at training cap")

    const remaining = cap - currentStat.trainedValue
    const rawGain = (action.baseGain / 100) * remaining * tier.gainMultiplier
    const gained = Math.min(rawGain, remaining)
    const newTrainedValue = currentStat.trainedValue + gained
    const reachedCap = newTrainedValue >= cap * 0.95
    const statGained = reachedCap ? remaining : gained

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

    const statRecordDef = await tx.recordDef.findFirst({
      where: { statDefId: action.statDefId, gameId: action.gameId },
      select: { id: true },
    })
    if (statRecordDef) {
      const existingEntry = await tx.recordEntry.findFirst({
        where: { recordDefId: statRecordDef.id, animalId },
        select: { id: true, value: true },
      })
      if (!existingEntry) {
        await tx.recordEntry.create({
          data: { recordDefId: statRecordDef.id, animalId, value: stat.trainedValue },
        })
      } else if (stat.trainedValue > existingEntry.value) {
        await tx.recordEntry.update({
          where: { id: existingEntry.id },
          data: { value: stat.trainedValue, setAt: new Date() },
        })
      }
    }

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

    const trainingLog = await tx.trainingLog.create({
      data: {
        animalId,
        trainingActionDefId,
        intensityTierDefId,
        cycleNumber,
        statGained,
        energyUsed,
        performedByPlayerId,
        reachedCap,
      },
    })

    if (!animalStage.isTutorialAnimal) {
      // Check TRAINING_TIER condition triggers on the animal's genotypes
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
          include: {
            ruleConditions: {
              include: {
                healthConditionDef: {
                  include: { conditionTriggers: { where: { triggerType: "TRAINING_TIER" } } },
                },
              },
            },
          },
        })
        if (!rule?.ruleConditions.length) continue
        for (const rc of rule.ruleConditions) {
          const condDef = rc.healthConditionDef
          if (condDef.conditionType === "INJURY") continue
          if (!condDef.conditionTriggers.length) continue
          const matchingTriggers = condDef.conditionTriggers.filter(
            t => t.minTierIndex === null || tier.tierIndex >= t.minTierIndex
          )
          if (matchingTriggers.length === 0) continue

          const alreadyActive = await tx.animalHealthRecord.findFirst({
            where: { animalId, conditionDefId: condDef.id, isActive: true },
          })
          if (alreadyActive) continue

          if (condDef.flareupCooldownCycles) {
            const lastResolved = await tx.animalHealthRecord.findFirst({
              where: { animalId, conditionDefId: condDef.id, isActive: false },
              orderBy: { resolvedCycle: "desc" },
              select: { resolvedCycle: true },
            })
            if (lastResolved?.resolvedCycle != null && cycleNumber < lastResolved.resolvedCycle + condDef.flareupCooldownCycles) continue
          }

          const bestTrigger = matchingTriggers.reduce((best, t) =>
            (t.minTierIndex ?? -1) > (best.minTierIndex ?? -1) ? t : best
          )
          if (Math.random() < bestTrigger.triggerChance) {
            await tx.animalHealthRecord.create({
              data: { animalId, conditionDefId: condDef.id, isActive: true },
            })
          }
        }
      }

      // Check TRAINING_TIER triggers on INJURY conditions (not genotype-linked)
      const injuryTriggerDefs = await tx.healthConditionDef.findMany({
        where: {
          gameId: action.gameId,
          conditionType: "INJURY",
          conditionTriggers: { some: { triggerType: "TRAINING_TIER" } },
        },
        include: {
          conditionTriggers: { where: { triggerType: "TRAINING_TIER" } },
        },
      })

      for (const condDef of injuryTriggerDefs) {
        const matchingTriggers = condDef.conditionTriggers.filter(
          t => t.minTierIndex === null || tier.tierIndex >= t.minTierIndex
        )
        if (matchingTriggers.length === 0) continue

        const alreadyActive = await tx.animalHealthRecord.findFirst({
          where: { animalId, conditionDefId: condDef.id, isActive: true },
        })
        if (alreadyActive) continue

        if (condDef.flareupCooldownCycles) {
          const lastResolved = await tx.animalHealthRecord.findFirst({
            where: { animalId, conditionDefId: condDef.id, isActive: false },
            orderBy: { resolvedCycle: "desc" },
            select: { resolvedCycle: true },
          })
          if (lastResolved?.resolvedCycle != null && cycleNumber < lastResolved.resolvedCycle + condDef.flareupCooldownCycles) continue
        }

        const bestTrigger = matchingTriggers.reduce((best, t) =>
          (t.minTierIndex ?? -1) > (best.minTierIndex ?? -1) ? t : best
        )
        if (Math.random() < bestTrigger.triggerChance) {
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: condDef.id, isActive: true },
          })
        }
      }
    }

    return trainingLog

  })
}
