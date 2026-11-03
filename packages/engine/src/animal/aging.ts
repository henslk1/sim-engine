import { db } from "@sim-engine/db";
import type { Prisma } from "@sim-engine/db"
import { genotypeKey, indexHealthRecords, loadGameAgingCache } from "./aging-cache.js";
import { isDailyCareComplete } from "../care/completion.js";
import type { GameAgingCache } from "./aging-cache.js";

type Client = typeof db

/**
 * Ages one animal by a cycle.
 *
 * `cache` holds the game-scoped definitions this reads. A nightly loads it once
 * and hands the same object to every animal; a one-off caller may leave it out
 * and the animal's own game is loaded for it, exactly as before.
 */
export type AgingResult = {
  pregnancyCompleted?: string
  lifeStageAdvanced?: boolean
  ageInCycles?: number
  alreadyAged?: boolean
}

/**
 * Age one animal, on a transaction the caller owns.
 *
 * Split out so the tutorial's manual "advance age" can run inside the
 * transaction holding the game's maintenance lock. Of every action in the game
 * that one is the most important to keep out of a nightly's way: it does
 * exactly what the nightly does, to an animal the nightly may be aging.
 */
export async function advanceAnimalAgingTx(
  tx: Prisma.TransactionClient,
  animalId: string,
  cache?: GameAgingCache,
  options?: { expectedCycle?: number }
): Promise<AgingResult> {
  return agingBody(tx, animalId, cache, options)
}

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
): Promise<AgingResult> {
  return client.$transaction((tx) => agingBody(tx, animalId, cache, options))
}

/** The work itself. Both entry points above run exactly this. */
async function agingBody(
  tx: Prisma.TransactionClient,
  animalId: string,
  cache?: GameAgingCache,
  options?: { expectedCycle?: number }
): Promise<AgingResult> {
  {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      include: {
        disciplineDef: { select: { minLifeStageIndex: true, maxLifeStageIndex: true } },
        secondaryDisciplineDef: { select: { minLifeStageIndex: true, maxLifeStageIndex: true } },
        // The five per-animal state rows, read here rather than one `findUnique`
        // each further down. They are all one-to-one with the animal and none of
        // them is written between this read and the point each is used, so
        // reading them early changes nothing except the number of round trips —
        // under `relationJoins` these are joins on a query that already runs.
        //
        // `lifeStage` used to be included here and was never read: the code
        // wants `animal.lifeStageId`, which is a scalar already on the row, and
        // the stage it actually works from is `correctStage`, found in the
        // run's cache by age.
        energy: true,
        mood: true,
        condition: true,
        careScore: true,
        immunity: true,
        // Four more reads on the same argument: nothing between here and the
        // point each was read writes to its table. `AnimalHealthRecord` is
        // written further down — by the illness roll, the genetic-onset pass,
        // the treatment close-out and the overwork injury — but every one of
        // those happens after both places this copy is used, and the second
        // read of it below deliberately stays where it is so that it sees them.
        //
        // `AnimalPersonality` and `AnimalLongTermCareRecord` are never written
        // by aging at all; `Pregnancy` is written only after it is read.
        healthRecords: { select: { conditionDefId: true, isActive: true, resolvedCycle: true } },
        // Was a lazy per-animal read, on the grounds that neither the illness
        // roll nor the genetic-onset pass might be reached. In a nightly that
        // is not what happens: the genetic pass runs unconditionally for every
        // animal that is not a tutorial animal, so the read fired every time
        // and the laziness only ever paid off on the death paths above, which
        // return before reaching it. One join beats one round trip per animal.
        genotypes: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
        pregnancies: { where: { isCompleted: false }, take: 1 },
        personality: {
          select: {
            value: true,
            personalityModifier: true,
            traitDef: { select: { labelRanges: { select: { minValue: true, maxValue: true, moodModifier: true } } } },
          },
        },
        longTermCareRecords: {
          select: {
            nextDueCycle: true,
            longTermCareActionDef: { select: { gracePeriodCycles: true } },
          },
        },
      },
    })
    const { energy, mood, condition, careScore, immunity } = animal
    const personalityRecords = animal.personality
    const ltcRecords = animal.longTermCareRecords

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
    const healthRecords = indexHealthRecords(animal.healthRecords)

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

    // Fatal condition death checks.
    //
    // The same rows the index above was built from, matched against the run's
    // condition definitions rather than asked for again with a `conditionDef:
    // { isFatal: true }` filter. A definition missing from the cache would mean
    // a record pointing at a condition from another game, which cannot happen —
    // but it is skipped rather than assumed, because the alternative is a crash
    // in the middle of the night.
    const fatalDefs = animal.healthRecords
      .filter(record => record.isActive)
      .map(record => game.conditionDefsById.get(record.conditionDefId))
      .filter((def): def is NonNullable<typeof def> => def != null && def.isFatal)

    for (const conditionDef of fatalDefs) {
      if (conditionDef.fatalMaxCycle !== null && newAge >= conditionDef.fatalMaxCycle) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: conditionDef.name },
        })
        return {}
      }
      if (conditionDef.fatalityChance !== null && Math.random() < conditionDef.fatalityChance) {
        await tx.animal.update({
          where: { id: animalId },
          data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: conditionDef.name },
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
          const genotypes = animal.genotypes
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
      const genotypes = animal.genotypes
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
    const pregnancy = animal.pregnancies[0] ?? null

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
    // Awaited one at a time rather than through `Promise.all`. Issuing
    // concurrent queries on one transaction's connection is a protocol
    // violation that `pg` warns about today and removes in pg@9 — and it never
    // bought anything: on a single connection the driver queues them, so the
    // five reads below take the same wall time either way. Measured: 7ms median
    // both ways.
    //
    // Only whether the animal worked at all, so each of these stops at the
    // first row it finds instead of counting every one. Nothing here reads how
    // many times it trained, and the `||` short-circuits — an animal that
    // trained never issues the other two.
    const workedThisCycle =
      (await tx.trainingLog.findFirst({ where: { animalId, cycleNumber: currentCycle }, select: { id: true } })) !== null ||
      (await tx.competitionEntry.findFirst({ where: { animalId, cycleNumber: currentCycle }, select: { id: true } })) !== null ||
      (await tx.stageActivityLog.findFirst({ where: { animalId, cycleNumber: currentCycle }, select: { id: true } })) !== null

    // Distinct actions, not log rows — see `isDailyCareComplete`. Counting
    // rows let the same free action, performed three times, pass for having
    // done three different ones.
    const careDone = await tx.careLog.findMany({
      where: { animalId, cycleNumber: currentCycle },
      select: { careActionDefId: true },
      distinct: ["careActionDefId"],
    })
    const allCareDone = isDailyCareComplete(careDone.length, game.careActionCount)

    const activeHealthRecords = await tx.animalHealthRecord.findMany({
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
    })

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

    // Each of the five values below is computed first and written only if it
    // actually moved. These are the clamped ends of decay curves, so a large
    // share of any population is sitting on one of them: measured against the
    // live database, the condition write was writing 0 over 0 for every animal
    // without exception, and energy was writing the maximum over the maximum
    // for 57% of them.
    //
    // Safe because the only other thing an update to these tables does is move
    // `updatedAt`, and nothing in the engine, the routers or the web app reads
    // `updatedAt` on any of the five.
    const newMood = mood
      ? Math.max(0, Math.min(100,
          mood.value
          - gameConfig.moodDecayRate * (isOverworked ? 3 : ltcOverdue ? 2 : 1)
          + conditionMoodEffect
          + personalityRecords.reduce((sum, p) => {
              const effective = p.value + p.personalityModifier
              const range = p.traitDef.labelRanges.find(r => effective >= r.minValue && effective <= r.maxValue)
              return sum + (range?.moodModifier ?? 0)
            }, 0)
        ))
      : null
    const newCondition = condition
      ? Math.max(0, condition.value - gameConfig.conditionDecayRate)
      : null
    const newCareScore = careScore
      ? Math.max(gameConfig.careScoreFloor, careScore.score - gameConfig.careScoreDecayRate)
      : null
    // The ceiling is the animal's own innate maximum scaled by its life stage.
    // `immunityCapMultiplier` has existed on `LifeStageDef` since the model was
    // written, is editable in the admin console, and was read by nothing — so a
    // youngster configured to cap at 60% of its adult immunity quietly
    // recovered to 100% like everything else.
    //
    // It defaults to 1.0, so this changes nothing until a stage is configured.
    // `correctStage` comes from the run's cache, so applying it costs no query.
    //
    // `Math.min` does both jobs: it stops a growing animal exceeding its
    // stage's ceiling, and brings one that is already above it — because the
    // stage changed, or the multiplier did — back down to it.
    const newImmunity = immunity
      ? allCareDone
        ? Math.min(
            immunity.innateMax * correctStage.immunityCapMultiplier,
            immunity.value + gameConfig.immunityRecoveryRate
          )
        : Math.max(gameConfig.immunityMin, immunity.value - gameConfig.immunityDecayRate)
      : null

    // Sequential for the same reason as the reads above. Written as plain `if`s
    // rather than the `&&` chains and `.filter(Boolean)` this replaces, which
    // said the same thing less legibly.
    if (energy && newEnergy !== null && newEnergy !== energy.currentEnergy) {
      await tx.animalEnergy.update({ where: { animalId }, data: { currentEnergy: newEnergy } })
    }
    if (mood && newMood !== null && newMood !== mood.value) {
      await tx.animalMood.update({ where: { animalId }, data: { value: newMood } })
    }
    if (condition && !workedThisCycle && newCondition !== null && newCondition !== condition.value) {
      await tx.animalCondition.update({ where: { animalId }, data: { value: newCondition } })
    }
    if (careScore && !allCareDone && newCareScore !== null && newCareScore !== careScore.score) {
      await tx.animalCareScore.update({ where: { animalId }, data: { score: newCareScore } })
    }
    if (immunity && newImmunity !== null && newImmunity !== immunity.value) {
      await tx.animalImmunity.update({ where: { animalId }, data: { value: newImmunity } })
    }

    return {
      ...(pregnancyCompleted ? { pregnancyCompleted } : {}),
      ...(lifeStageAdvanced ? { lifeStageAdvanced: true } : {}),
      ageInCycles: newAge,
    }
  }
}
