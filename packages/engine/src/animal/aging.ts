import { db } from "@sim-engine/db";

type Client = typeof db

export async function advanceAnimalAging(client: Client, animalId: string): Promise<{ pregnancyCompleted?: string | undefined }> {
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
    const [immunity, careScore] = await Promise.all([
      tx.animalImmunity.findUnique({ where: { animalId } }),
      tx.animalCareScore.findUnique({ where: { animalId } }),
    ])
    if (immunity && immunity.innateMax > 0) {
      const immunityRatio = immunity.value / 100
      const careRatio = careScore ? careScore.score / 100 : 1
      const illnessChance = (1 - immunityRatio * careRatio) / 25
      if (Math.random() < illnessChance) {
        const eligible = await tx.healthConditionDef.findMany({
          where: {
            gameId: animal.gameId,
            conditionType: "ILLNESS",
            isGenetic: false,
            healthRecords: { none: { animalId, isActive: true } },
          },
          include: {
            healthRecords: {
              where: { animalId, isActive: false },
              orderBy: { resolvedCycle: "desc" },
              take: 1,
              select: { resolvedCycle: true },
            },
            ruleConditions: {
              where: { penetrance: { not: null } },
              select: {
                penetrance: true,
                expressionRule: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
              },
            },
          },
        })
        const eligibleFiltered = eligible.filter(cond => {
          if (!cond.flareupCooldownCycles) return true
          const lastResolved = cond.healthRecords[0]
          if (lastResolved?.resolvedCycle == null) return true
          return newAge >= lastResolved.resolvedCycle + cond.flareupCooldownCycles
        })
        if (eligibleFiltered.length > 0) {
          const genotypes = await tx.animalGenotype.findMany({
            where: { animalId },
            select: { locusId: true, alleleOneId: true, alleleTwoId: true },
          })
          const genotypeSet = new Set(genotypes.map(g => `${g.locusId}:${g.alleleOneId}:${g.alleleTwoId}`))
          const weights = eligibleFiltered.map(cond => {
            const bonus = cond.ruleConditions
              .filter(rc => genotypeSet.has(`${rc.expressionRule.locusId}:${rc.expressionRule.alleleOneId}:${rc.expressionRule.alleleTwoId}`))
              .reduce((sum, rc) => sum + (rc.penetrance ?? 0), 0)
            return cond.baseWeight + bonus
          })
          const totalWeight = weights.reduce((s, w) => s + w, 0)
          let roll = Math.random() * totalWeight
          let picked = eligibleFiltered[0]!
          for (let i = 0; i < eligibleFiltered.length; i++) {
            roll -= weights[i]!
            if (roll <= 0) { picked = eligibleFiltered[i]!; break }
          }
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: picked.id, isActive: true },
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
        include: { ruleConditions: { include: { healthConditionDef: true } } },
      })

      if (!rule?.ruleConditions.length) continue

      for (const rc of rule.ruleConditions) {
        const condDef = rc.healthConditionDef
        if (!condDef.isGenetic) continue
        if (condDef.onsetMinCycle !== null && newAge < condDef.onsetMinCycle) continue

        const alreadyExists = await tx.animalHealthRecord.findFirst({
          where: {
            animalId,
            conditionDefId: condDef.id,
            ...(condDef.isEpisodic ? { isActive: true } : {}),
          },
        })
        if (alreadyExists) continue

        if (condDef.isEpisodic && condDef.flareupCooldownCycles) {
          const lastResolved = await tx.animalHealthRecord.findFirst({
            where: { animalId, conditionDefId: condDef.id, isActive: false },
            orderBy: { resolvedCycle: "desc" },
            select: { resolvedCycle: true },
          })
          if (lastResolved?.resolvedCycle != null && newAge < lastResolved.resolvedCycle + condDef.flareupCooldownCycles) continue
        }

        if (Math.random() < (rc.penetrance ?? 1.0)) {
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: condDef.id, isActive: true },
          })
        }
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

    // Advance active treatment records
    const activeTreatments = await tx.animalTreatmentRecord.findMany({
      where: { animalId, isActive: true },
      select: {
        id: true,
        startedCycle: true,
        healthRecordId: true,
        treatmentDef: { select: { treatmentType: true, durationCycles: true } },
        activityRestriction: {
          where: { isActive: true },
          select: { id: true, remainingCycles: true, isLifelong: true },
        },
      },
    })

    for (const treatment of activeTreatments) {
      const { treatmentType, durationCycles } = treatment.treatmentDef

      for (const restriction of treatment.activityRestriction) {
        if (restriction.isLifelong) continue
        const newRemaining = restriction.remainingCycles - 1
        await tx.activityRestriction.update({
          where: { id: restriction.id },
          data: newRemaining <= 0
            ? { remainingCycles: 0, isActive: false }
            : { remainingCycles: newRemaining },
        })
      }

      let shouldClose = false
      if (treatmentType === "ACTIVITY_RESTRICTION") {
        const allDone = treatment.activityRestriction.length === 0 ||
          treatment.activityRestriction.every(r => r.isLifelong ? false : r.remainingCycles <= 1)
        if (allDone) shouldClose = true
      } else if (durationCycles !== null) {
        if (newAge >= treatment.startedCycle + durationCycles) shouldClose = true
      }

      if (shouldClose) {
        await tx.animalTreatmentRecord.update({
          where: { id: treatment.id },
          data: { isActive: false, completedCycle: newAge, completedAt: new Date() },
        })
        const remaining = await tx.animalTreatmentRecord.count({
          where: { healthRecordId: treatment.healthRecordId, isActive: true, id: { not: treatment.id } },
        })
        if (remaining === 0) {
          await tx.animalHealthRecord.update({
            where: { id: treatment.healthRecordId },
            data: { isActive: false, resolvedCycle: newAge, resolvedAt: new Date() },
          })
        }
      }
    }

    // Check if work was done this cycle — suppresses condition decay
    const currentCycle = animal.ageInCycles
    const [workedThisCycle, allCareDone, energy, mood, condition, activeHealthRecords, personalityRecords, ltcRecords] = await Promise.all([
      Promise.all([
        tx.trainingLog.count({ where: { animalId, cycleNumber: currentCycle } }),
        tx.competitionEntry.count({ where: { animalId, cycleNumber: currentCycle } }),
        tx.stageActivityLog.count({ where: { animalId, cycleNumber: currentCycle } }),
      ]).then(([t, c, s]) => t + c + s > 0),
      Promise.all([
        tx.careActionDef.count({ where: { gameId: animal.gameId } }),
        tx.careLog.count({ where: { animalId, cycleNumber: currentCycle } }),
      ]).then(([total, done]) => total === 0 || done >= total),
      tx.animalEnergy.findUnique({ where: { animalId } }),
      tx.animalMood.findUnique({ where: { animalId } }),
      tx.animalCondition.findUnique({ where: { animalId } }),
      tx.animalHealthRecord.findMany({
        where: { animalId, isActive: true },
        include: {
          conditionDef: {
            include: { treatments: { select: { id: true, treatmentType: true } } },
          },
          treatmentRecords: {
            where: { isActive: true },
            select: {
              lastAdministeredCycle: true,
              treatmentDef: { select: { treatmentType: true } },
            },
          },
        },
      }),
      tx.animalPersonality.findMany({
        where: { animalId },
        select: {
          value: true,
          personalityModifier: true,
          traitDef: { select: { labelRanges: { select: { minValue: true, maxValue: true, moodModifier: true } } } },
        },
      }),
      tx.animalLongTermCareRecord.findMany({
        where: { animalId },
        select: {
          nextDueCycle: true,
          longTermCareActionDef: { select: { gracePeriodCycles: true } },
        },
      }),
    ])

    const conditionEnergyEffect = activeHealthRecords.reduce((sum, r) => {
      const treatedThisCycle = r.treatmentRecords.some(
        (t) => t.lastAdministeredCycle === currentCycle
      )
      return treatedThisCycle ? sum : sum + (r.conditionDef.energyEffect ?? 0)
    }, 0)
    const conditionMoodEffect = activeHealthRecords.reduce((sum, r) => {
      const treatedThisCycle = r.treatmentRecords.some(
        (t) => t.lastAdministeredCycle === currentCycle
      )
      return treatedThisCycle ? sum : sum + (r.conditionDef.moodEffect ?? 0)
    }, 0)
    const neglected = careScore != null && careScore.score < gameConfig.energyLowCareThreshold
    const exhausted = !!(energy && energy.currentEnergy === 0 && mood && mood.value === 0)
    const ltcOverdue = ltcRecords.some(r => newAge > r.nextDueCycle + r.longTermCareActionDef.gracePeriodCycles)
    const carePenalty = neglected ? gameConfig.energyLowCarePenalty : 0

    const TIME_BASED = new Set(["OTC", "PRESCRIPTION", "PLAYER_ACTION"])
    const untreatedCondition = activeHealthRecords.some(r => {
      if (r.conditionDef.treatments.length === 0) return false
      if (r.treatmentRecords.length === 0) return true
      const hasTimeBasedActive = r.treatmentRecords.some(t => TIME_BASED.has(t.treatmentDef.treatmentType))
      if (!hasTimeBasedActive) return false
      return !r.treatmentRecords.some(t => TIME_BASED.has(t.treatmentDef.treatmentType) && t.lastAdministeredCycle === currentCycle)
    })
    const effectivelyNeglected = neglected || untreatedCondition || exhausted || ltcOverdue

    const isOverworked = !!(energy && gameConfig.overworkInjuryThreshold > 0 && energy.currentEnergy < gameConfig.overworkInjuryThreshold)

    // Overwork injury: fires if animal ends the cycle with critically low energy
    if (isOverworked) {
      if (Math.random() < gameConfig.overworkInjuryChance + animal.structuralRisk) {
        const injuryPool = await tx.healthConditionDef.findMany({
          where: {
            gameId: animal.gameId,
            conditionType: "INJURY",
            healthRecords: { none: { animalId, isActive: true } },
          },
        })
        if (injuryPool.length > 0) {
          const picked = injuryPool[Math.floor(Math.random() * injuryPool.length)]!
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: picked.id, isActive: true },
          })
        }
      }
    }

    const newEnergy = energy
      ? Math.max(0, (effectivelyNeglected ? energy.currentEnergy : isOverworked ? energy.maxEnergy * 0.5 : energy.maxEnergy) + conditionEnergyEffect - carePenalty)
      : null

    // Neglect death: energy drained to 0 → rolling death chance each cycle
    if (effectivelyNeglected && newEnergy === 0 && energy && energy.maxEnergy > 0) {
      const neglectDeathChance = carePenalty / energy.maxEnergy
      if (Math.random() < neglectDeathChance) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: exhausted ? "Exhaustion" : "Neglect" },
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
        data: {
          value: Math.max(0, Math.min(100,
            mood.value
            - gameConfig.moodDecayRate * (isOverworked ? 3 : 1)
            + conditionMoodEffect
            + personalityRecords.reduce((sum, p) => {
                const effective = p.value + p.personalityModifier
                const range = p.traitDef.labelRanges.find(r => effective >= r.minValue && effective <= r.maxValue)
                return sum + (range?.moodModifier ?? 0)
              }, 0)
          )),
        },
      }),
      condition && !workedThisCycle && tx.animalCondition.update({
        where: { animalId },
        data: { value: Math.max(0, condition.value - gameConfig.conditionDecayRate) },
      }),
      careScore && !allCareDone && tx.animalCareScore.update({
        where: { animalId },
        data: { score: Math.max(gameConfig.careScoreFloor, careScore.score - gameConfig.careScoreDecayRate) },
      }),
      immunity && tx.animalImmunity.update({
        where: { animalId },
        data: {
          value: allCareDone
            ? Math.min(immunity.innateMax, immunity.value + gameConfig.immunityRecoveryRate)
            : Math.max(gameConfig.immunityMin, immunity.value - gameConfig.immunityDecayRate),
        },
      }),
    ].filter(Boolean))

    return { pregnancyCompleted }
  })
}
