import { db } from "@sim-engine/db";
import { genotypeKey, indexHealthRecords, loadGameAgingCache } from "./aging-cache.js";
import type { GameAgingCache } from "./aging-cache.js";

type Client = typeof db

/**
 * Ages one animal by a cycle.
 *
 * `cache` holds the game-scoped definitions this reads. A nightly loads it once
 * and hands the same object to every animal; a one-off caller may leave it out
 * and the animal's own game is loaded for it, exactly as before.
 */
export async function advanceAnimalAging(
  client: Client,
  animalId: string,
  cache?: GameAgingCache,
  options?: {
    /**
     * Age the animal only if it is still on this cycle.
     *
     * The nightly's work queue passes the cycle its work item was created for.
     * Aging commits in this transaction; marking the work item done cannot be
     * inside it, so a crash between the two is possible and the item is retried.
     * Checked here, inside the transaction and against the row this transaction
     * read, the retry sees the animal has already moved on and does nothing —
     * which is what "a crash must never age the same animal twice" means in
     * practice. Checking it in the caller would leave a gap between the check
     * and the aging.
     */
    expectedCycle?: number
  }
): Promise<{ pregnancyCompleted?: string; lifeStageAdvanced?: boolean; ageInCycles?: number; alreadyAged?: boolean }> {
  return client.$transaction(async (tx) => {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      include: {
        lifeStage: true,
        disciplineDef: { select: { minLifeStageIndex: true, maxLifeStageIndex: true } },
        secondaryDisciplineDef: { select: { minLifeStageIndex: true, maxLifeStageIndex: true } },
      },
    })

    // The work this transaction was asked to do has already happened.
    if (options?.expectedCycle !== undefined && animal.ageInCycles !== options.expectedCycle) {
      return { alreadyAged: true, ageInCycles: animal.ageInCycles }
    }

    // A cache built for a different game would silently apply the wrong config
    // to every animal in the run, so it is checked rather than trusted.
    if (cache && cache.gameId !== animal.gameId) {
      throw new Error(`Aging cache is for game ${cache.gameId}, animal ${animalId} belongs to ${animal.gameId}`)
    }
    const game = cache ?? await loadGameAgingCache(tx, animal.gameId)
    const { gameConfig, lifeStageDefs } = game

    // Read once and answered in memory from here on. Every "does this animal
    // already have condition X" and "when did X last resolve" below used to be
    // its own round trip, several of them inside loops.
    const healthRecords = indexHealthRecords(
      await tx.animalHealthRecord.findMany({
        where: { animalId },
        select: { conditionDefId: true, isActive: true, resolvedCycle: true },
      })
    )

    // Both the illness roll and the genetic-onset pass walk the animal's
    // genotypes; neither may be reached, so this stays lazy.
    let genotypeRows: { locusId: string; alleleOneId: string; alleleTwoId: string }[] | null = null
    const loadGenotypes = async () => genotypeRows ??= await tx.animalGenotype.findMany({
      where: { animalId },
      select: { locusId: true, alleleOneId: true, alleleTwoId: true },
    })

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
    const lifeStageAdvanced = correctStage.id !== animal.lifeStageId
    // A discipline scoped to a life-stage range (e.g. Weanling Halter) no longer
    // applies once the animal ages out of it — drop the assignment so the player
    // can pick fresh ones for the new stage. Earned titles are untouched; only
    // the current assignment is cleared.
    const outOfRange = (discipline: { minLifeStageIndex: number | null; maxLifeStageIndex: number | null } | null) =>
      !!discipline && (
        (discipline.minLifeStageIndex !== null && correctStage.stageIndex < discipline.minLifeStageIndex) ||
        (discipline.maxLifeStageIndex !== null && correctStage.stageIndex > discipline.maxLifeStageIndex)
      )
    const clearPrimaryDiscipline = lifeStageAdvanced && outOfRange(animal.disciplineDef)
    const clearSecondaryDiscipline = lifeStageAdvanced && outOfRange(animal.secondaryDisciplineDef)
    await tx.animal.update({
      where: { id: animalId },
      data: {
        ageInCycles: newAge,
        ...(lifeStageAdvanced && { lifeStageId: correctStage.id }),
        ...(clearPrimaryDiscipline && { disciplineDefId: null }),
        ...(clearSecondaryDiscipline && { secondaryDisciplineDefId: null }),
      },
    })

    // Illness contraction roll
    const [immunity, careScore] = await Promise.all([
      tx.animalImmunity.findUnique({ where: { animalId } }),
      tx.animalCareScore.findUnique({ where: { animalId } }),
    ])
    if (!animal.isTutorialAnimal && immunity && immunity.innateMax > 0) {
      const immunityRatio = immunity.value / 100
      const careRatio = careScore ? careScore.score / 100 : 1
      const illnessChance = (1 - immunityRatio * careRatio) / 25
      if (Math.random() < illnessChance) {
        const eligibleFiltered = game.illnessPool.filter(cond => {
          if (healthRecords.hasActive(cond.id)) return false
          if (!cond.flareupCooldownCycles) return true
          const lastResolved = healthRecords.lastResolvedCycle(cond.id)
          if (lastResolved == null) return true
          return newAge >= lastResolved + cond.flareupCooldownCycles
        })
        if (eligibleFiltered.length > 0) {
          const genotypes = await loadGenotypes()
          const genotypeSet = new Set(genotypes.map(genotypeKey))
          const weights = eligibleFiltered.map(cond => {
            const bonus = cond.ruleConditions
              .filter(rc => genotypeSet.has(genotypeKey(rc.expressionRule)))
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
          healthRecords.markActive(picked.id)
        }
      }
    }

    if (!animal.isTutorialAnimal) {
      // Genetic condition onset rolls
      const genotypes = await loadGenotypes()
      for (const genotype of genotypes) {
        const rule = game.expressionRulesByGenotype.get(genotypeKey(genotype))

        if (!rule?.ruleConditions.length) continue

        for (const rc of rule.ruleConditions) {
          const condDef = rc.healthConditionDef
          if (!condDef.isGenetic) continue
          if (condDef.onsetMinCycle !== null && newAge < condDef.onsetMinCycle) continue

          const alreadyExists = condDef.isEpisodic
            ? healthRecords.hasActive(condDef.id)
            : healthRecords.hasAny(condDef.id)
          if (alreadyExists) continue

          if (condDef.isEpisodic && condDef.flareupCooldownCycles) {
            const lastResolved = healthRecords.lastResolvedCycle(condDef.id)
            if (lastResolved != null && newAge < lastResolved + condDef.flareupCooldownCycles) continue
          }

          if (Math.random() < (rc.penetrance ?? 1.0)) {
            await tx.animalHealthRecord.create({
              data: { animalId, conditionDefId: condDef.id, isActive: true },
            })
            healthRecords.markActive(condDef.id)
          }
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

      const restrictAt = gameConfig.gestationRestrictCycle
      if (restrictAt > 0 && newCycles === restrictAt && !justCompleted) {
        await tx.activityRestriction.createMany({
          data: [
            { animalId, pregnancyId: pregnancy.id, restrictionType: "TRAINING", remainingCycles: 0, isLifelong: true },
            { animalId, pregnancyId: pregnancy.id, restrictionType: "COMPETITION", remainingCycles: 0, isLifelong: true },
          ],
        })
      }

      if (justCompleted) {
        await tx.activityRestriction.updateMany({
          where: { pregnancyId: pregnancy.id, isActive: true },
          data: { isActive: false },
        })
        pregnancyCompleted = pregnancy.id
      }
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

      // A course is over only when both halves are: the medication's own
      // duration and every restriction it carries. `activityRestriction` still
      // holds this cycle's pre-decrement values, so <= 1 means "expired just now".
      const restrictionsDone = treatment.activityRestriction.every(r => !r.isLifelong && r.remainingCycles <= 1)
      // Neither of these carries a medication course: a procedure is a one-off
      // and a restriction is itself the treatment, so only recovery gates them.
      // A null duration on anything else means lifelong medication — never closes.
      const medicationDone = treatmentType === "ACTIVITY_RESTRICTION" || treatmentType === "VET_PROCEDURE"
        ? true
        : durationCycles !== null && newAge >= treatment.startedCycle + durationCycles
      const shouldClose = medicationDone && restrictionsDone

      if (shouldClose) {
        await tx.animalTreatmentRecord.update({
          where: { id: treatment.id },
          data: { isActive: false, completedCycle: newAge, completedAt: new Date() },
        })
        // The treatment record is the only path the profile walks to find these,
        // so a row left active here blocks training and competition invisibly —
        // the server checks restrictions by animalId alone. Matches the cleanup
        // vet.startTreatment already does when it supersedes a treatment.
        await tx.activityRestriction.updateMany({
          where: { treatmentRecordId: treatment.id, isActive: true },
          data: { isActive: false, remainingCycles: 0 },
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
      tx.careLog
        .count({ where: { animalId, cycleNumber: currentCycle } })
        .then(done => game.careActionCount === 0 || done >= game.careActionCount),
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
    if (!animal.isTutorialAnimal && isOverworked) {
      if (Math.random() < gameConfig.overworkInjuryChance + animal.structuralRisk) {
        const injuryPool = game.injuryPool.filter(cond => !healthRecords.hasActive(cond.id))
        if (injuryPool.length > 0) {
          const picked = injuryPool[Math.floor(Math.random() * injuryPool.length)]!
          await tx.animalHealthRecord.create({
            data: { animalId, conditionDefId: picked.id, isActive: true },
          })
          healthRecords.markActive(picked.id)
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
            - gameConfig.moodDecayRate * (isOverworked ? 3 : ltcOverdue ? 2 : 1)
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

    return {
      ...(pregnancyCompleted ? { pregnancyCompleted } : {}),
      ...(lifeStageAdvanced ? { lifeStageAdvanced: true } : {}),
      ageInCycles: newAge,
    }
  })
}
