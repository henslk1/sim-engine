import { db } from "@sim-engine/db";
import type { Prisma } from "@sim-engine/db"
import { markAnimalActive } from "../animal/activity.js";
import { nextBoundaryFor } from "../schedule/clock.js";
import { enqueueCompetitionResolution } from "./queue.js";
import { requireLifeStageAction } from "../animal/actionGuards.js"
import { grantConditionWorkGain } from "../animal/conditionWork.js"
import { buildScoringRules, readScoringRules, scoringRulesToJson, snapshotEntryScore } from "./scoring.js"
import { seedDisciplineStatRecords } from "./records.js"

type Client = typeof db

/**
 * How long one entry may hold its transaction.
 *
 * Prisma's unset default is five seconds, which was enough while entering was
 * fifteen quick reads and a few writes. It is not obviously enough now that an
 * entry can wait on the competition's row lock: the holder is a resolution, and
 * a resolution is allowed two minutes. Twenty seconds is the judgement that a
 * player would rather wait than be handed a transaction-closed error, without
 * tying up a connection for the whole of a pathological resolution.
 */
const ENTRY_TX = { timeout: 20_000, maxWait: 5_000 } as const

/**
 * enterCompetition, on a transaction the caller owns.
 *
 * Split out so a gameplay mutation can run it inside the transaction holding
 * the game's maintenance lock. A helper that opens its own transaction escapes
 * that lock however carefully the caller was written: its reads and writes land
 * on another connection, outside both the lock and the caller's rollback.
 */
export async function enterCompetitionTx(
  tx: Prisma.TransactionClient,
  input: {
    animalId: string
    competitionId: string
    playerAccountId: string
  },
  now: Date = new Date()
) {

    const { animalId, competitionId, playerAccountId } = input

    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: competitionId },
      include: {
        tierDef: true,
        venue: { select: { climate: true, terrain: true } },
        disciplineDef: {
          include: {
            equipmentRequirements: true
          }
        }
      }
    })
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { gameId: true, status: true, ageInCycles: true, breedId: true, lifeStage: { select: { canCompete: true, stageIndex: true, energyCostMultiplier: true } } },
    })
    requireLifeStageAction(animal, "canCompete")
    if (animal.gameId !== competition.gameId) throw new Error("Animal and competition must be in the same game")
    const { minLifeStageIndex, maxLifeStageIndex } = competition.disciplineDef
    if ((minLifeStageIndex != null && animal.lifeStage.stageIndex < minLifeStageIndex)
      || (maxLifeStageIndex != null && animal.lifeStage.stageIndex > maxLifeStageIndex)) {
      throw new Error("Animal is outside this discipline's life-stage range")
    }

    // Queued counts as closed.
    //
    // A competition stays OPEN between being enqueued and the resolver picking
    // it up - seconds normally, a minute if the wake was missed and the
    // fallback tick finds it. Entries arriving in that window are the worst
    // kind of loss: the player pays the fee and the energy, the entry commits,
    // and then resolution reads a field that may or may not include it
    // depending on which transaction got there first. Refusing is honest.
    //
    // FAILED is deliberately not here. A competition the resolver gave up on is
    // still open, nothing will touch it until somebody retries it from the
    // admin console, and freezing it out of new entries in the meantime would
    // punish players for an operational problem. When it is retried, the
    // entries made since count.
    const queued = await tx.competitionResolutionWork.findUnique({
      where: { competitionId },
      select: { status: true },
    })

    if (queued && (queued.status === "PENDING" || queued.status === "RETRYING" || queued.status === "RUNNING")) {
      throw new Error("This competition has closed and is waiting to be judged")
    }

    // Checked before the lock below rather than under it, so that a player
    // entering while a resolution is in flight is told no immediately instead
    // of sitting behind that resolution's row lock. Nothing is lost by the
    // window this leaves: work enqueued between this read and the lock cannot
    // start resolving until the lock is free, so an entry that commits is an
    // entry that is in the field when it does.

    // Take the competition's row before anything else happens.
    //
    // Reading `status` and believing it is not enough, for the same reason
    // `runCompetitionTx` does not believe its own read: under READ COMMITTED
    // two entries and a resolution can all see OPEN at the same moment.
    // Writing the row - even writing back the status it already has - takes
    // its exclusive lock, and because Postgres re-checks the `where` after the
    // wait, the whole statement is a compare-and-swap. Zero rows means somebody
    // else got there first and the competition is no longer open.
    //
    // This is also what orders the locks. `runCompetitionTx` takes this row
    // first and then touches balances, animals and records. An entry that
    // validated, spent energy and debited a fee before reaching for this row
    // would take the same locks in the opposite order, and the two would
    // deadlock as soon as a competition filled up while somebody was entering.
    //
    // And it is what makes the scoring freeze below safe. `scoringRules` comes
    // out of this statement rather than out of the pre-lock fetch above: two
    // players entering an empty competition at the same instant both read null
    // there, but only one of them is inside this lock at a time, and the second
    // re-reads the row the first committed. One competition, one rule set,
    // whoever got there first.
    //
    // The wait is a resolution's transaction, which the benchmark put at about
    // 70ms per competition.
    const claimed = await tx.competition.updateManyAndReturn({
      where: { id: competitionId, status: "OPEN" },
      data: { status: "OPEN" },
      select: { scoringRules: true },
    })

    if (claimed.length !== 1) {
      throw new Error("Competition is not open")
    }

    // `maxEntries` was never enforced here - it was only ever read to decide
    // whether the competition was now full enough to run. Two players entering
    // the last seat at once both succeeded, and a ten-horse field ran with
    // twelve in it. The count is taken under the lock above, so it cannot move
    // between this check and the insert below.
    const enteredBefore = await tx.competitionEntry.count({ where: { competitionId } })
    if (enteredBefore >= competition.maxEntries) {
      throw new Error("This competition is full")
    }

    if (!competition.disciplineDef.isConformation) {
      const animalDiscipline = await tx.animal.findUniqueOrThrow({
        where: { id: animalId },
        select: { disciplineDefId: true, secondaryDisciplineDefId: true },
      })
      if (
        animalDiscipline.disciplineDefId !== competition.disciplineDefId &&
        animalDiscipline.secondaryDisciplineDefId !== competition.disciplineDefId
      ) {
        throw new Error("Animal has not been assigned this discipline")
      }
    }

    let tier = await tx.animalCompetitionTier.findUnique({
      where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
      include: { tierDef: true }
    })

    if (!tier) {
      const lowestTierDef = await tx.competitionTierDef.findFirst({
        where: { disciplineDefId: competition.disciplineDefId },
        orderBy: { tierIndex: "asc" },
      })
      if (!lowestTierDef) throw new Error("No competition tiers configured for this discipline")
      tier = await tx.animalCompetitionTier.create({
        data: { animalId, disciplineDefId: competition.disciplineDefId, tierDefId: lowestTierDef.id },
        include: { tierDef: true },
      })
    }

    // tier match check
    if (competition.tierDefId && tier.tierDefId !== competition.tierDefId) {
      const compTierName = competition.tierDef?.name ?? competition.tierDefId
      throw new Error(`This competition is for ${compTierName} tier. Your animal competes at ${tier.tierDef.name} tier.`)
    }

    // condition score gate
    if (tier.tierDef.minConditionScore !== null && tier.tierDef.minConditionScore !== undefined) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId } })
      if (!condition || condition.value < tier.tierDef.minConditionScore) {
        throw new Error(`Animal condition score is too low to enter this tier (required: ${tier.tierDef.minConditionScore})`)
      }
    }

    // equipment check
    const equipmentRequirements = competition.disciplineDef.equipmentRequirements
    if (equipmentRequirements.length > 0) {
      const equippedItems = await tx.animalEquipment.findMany({ where: { animalId } })

      const grouped = new Map<string, typeof equipmentRequirements>()
      const individual: typeof equipmentRequirements = []
      for (const req of equipmentRequirements) {
        if (req.requirementGroup) {
          const g = grouped.get(req.requirementGroup) ?? []
          g.push(req)
          grouped.set(req.requirementGroup, g)
        } else {
          individual.push(req)
        }
      }

      for (const req of individual) {
        if (equippedItems.filter(e => e.itemDefId === req.itemDefId).length < req.quantity)
          throw new Error("Animal is missing required equipment for this discipline")
      }

      for (const reqs of grouped.values()) {
        const satisfied = reqs.some(req =>
          equippedItems.filter(e => e.itemDefId === req.itemDefId).length >= req.quantity
        )
        if (!satisfied)
          throw new Error("Animal is missing required equipment for this discipline")
      }
    }

    // invitational eligibility check
    if (competition.isInvitational) {
      const minPoints = tier.tierDef.minWeeklyPointsForInvitational
      if (minPoints !== null && minPoints !== undefined) {
        const now = new Date()
        const day = now.getUTCDay()
        const weekStart = new Date(now)
        weekStart.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1))
        weekStart.setUTCHours(0, 0, 0, 0)

        const weeklyPoints = await tx.animalWeeklyPoints.findUnique({
          where: { animalId_disciplineDefId_weekStart: { animalId, disciplineDefId: competition.disciplineDefId, weekStart } }
        })

        if (!weeklyPoints || weeklyPoints.points < minPoints) {
          throw new Error("Animal does not meet minimum weekly points for this invitational")
        }
      }
    }

    // Read off the animal already in hand. The second fetch this replaces
    // shadowed the outer `animal`, which is how a binding two hundred lines long
    // came to mean two different things inside one function.
    if (competition.breedId && animal.breedId !== competition.breedId) {
      throw new Error("This competition is restricted to a specific breed")
    }

    if (competition.disciplineDef.isConformation) {
      const conformationScore = await tx.animalConformationScore.findFirst({ where: { animalId } })
      if (!conformationScore) throw new Error("Animal must have a conformation score to enter this competition")
    }

    const baseEnergyCost = tier.tierDef.energyCost
    const entryFee = tier.tierDef.entryFee

    const competitionRestrictions = await tx.activityRestriction.count({
      where: { animalId, isActive: true, restrictionType: { in: ["COMPETITION", "ALL"] } },
    })
    if (competitionRestrictions > 0) {
      throw new Error("This animal is currently on a competition activity restriction")
    }

    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)

    const energyUsed = baseEnergyCost * animal.lifeStage.energyCostMultiplier
    if (energy.currentEnergy < energyUsed) {
      throw new Error("Not enough energy to enter this competition")
    }

    const requiredCertDefs = await tx.healthCertificateDef.findMany({
      where: { gameId: competition.gameId, requiredForCompetition: true },
      select: { id: true, name: true },
    })
    if (requiredCertDefs.length > 0) {
      const validCerts = await tx.healthCertificate.findMany({
        where: {
          animalId,
          certDefId: { in: requiredCertDefs.map((c) => c.id) },
          isValid: true,
          expiresAtCycle: { gte: animal.ageInCycles },
        },
        select: { certDefId: true },
      })
      const validCertIds = new Set(validCerts.map((c) => c.certDefId))
      const missing = requiredCertDefs.find((c) => !validCertIds.has(c.id))
      if (missing) {
        throw new Error(`Animal is missing required health certificate: ${missing.name}`)
      }
    }

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: energy.currentEnergy - energyUsed },
    })

    const gameConfig = await tx.gameConfig.findFirst({
      where: { gameId: competition.gameId },
      select: { conditionWorkGain: true },
    })
    await grantConditionWorkGain(tx, animalId, animal.ageInCycles, gameConfig?.conditionWorkGain ?? 0)

    if (entryFee > 0) {
      const baseCurrency = await tx.currencyDef.findFirstOrThrow({
        where: { gameId: competition.gameId, currencyType: "BASE" },
        select: { id: true },
      })

      const playerBal = await tx.playerBalance.findUnique({
        where: { playerAccountId_currencyDefId: { playerAccountId, currencyDefId: baseCurrency.id } },
        select: { balance: true },
      })
      if (!playerBal || playerBal.balance < entryFee) {
        throw new Error("Insufficient funds to enter this competition")
      }

      await tx.playerBalance.update({
        where: { playerAccountId_currencyDefId: { playerAccountId, currencyDefId: baseCurrency.id } },
        data: { balance: { decrement: entryFee } },
      })

      await tx.transaction.create({
        data: {
          gameId: competition.gameId,
          fromPlayerAccountId: playerAccountId,
          currencyDefId: baseCurrency.id,
          amount: entryFee,
          txnType: "COMPETITION_ENTRY",
        },
      })
    }

    // Freeze the competition's shared scoring rules, if this is the first entry
    // to reach here. Every part of the set is either configuration an admin can
    // edit or a number another player's training moves, so it is taken once and
    // shared by the whole field. The row lock above is what makes "once" true.
    let rules = readScoringRules(claimed[0]!.scoringRules)
    if (!rules) {
      rules = await buildScoringRules(tx, {
        gameId: competition.gameId,
        disciplineDefId: competition.disciplineDefId,
        isConformation: competition.disciplineDef.isConformation,
        climate: competition.venue.climate,
        terrain: competition.venue.terrain,
      })
      await tx.competition.update({
        where: { id: competitionId },
        data: { scoringRules: scoringRulesToJson(rules) },
      })
    }

    // Read once and used twice: written to CompetitionEntryStat, which the venue
    // page renders as a column per discipline stat, and folded into the snapshot
    // below. Reading them separately for each would let the number a player is
    // shown drift from the number they are scored on.
    //
    // Driven off the frozen weights rather than the discipline's current ones,
    // so a stat an admin adds mid-competition is not recorded for the entrants
    // who arrive after the edit and missing for the ones who arrived before.
    const entryStatValues = rules.statWeights.length > 0
      ? await tx.animalStat.findMany({
          where: { animalId, statDefId: { in: rules.statWeights.map((w) => w.statDefId) } },
          select: { statDefId: true, trainedValue: true },
        })
      : []

    const snapshot = await snapshotEntryScore(tx, {
      animalId,
      breedId: animal.breedId,
      rules,
      stats: entryStatValues,
    })

    const entry = await tx.competitionEntry.create({
      data: {
        competitionId,
        animalId,
        playerAccountId,
        tierDefId: tier.tierDefId,
        cycleNumber: animal.ageInCycles,
        // Written with the entry rather than updated onto it a statement later.
        // An entry that exists without its snapshot, even briefly, is an entry
        // resolution would have to guess about.
        scoredAt: now,
        ...snapshot,
      },
    })

    // Entering is the player's action, so it is what counts. The result, when
    // the competition eventually runs, is marked separately.
    await markAnimalActive(tx, { gameId: competition.gameId, animalId, cycleNumber: animal.ageInCycles })

    // This is the moment the horse becomes a competitor in this discipline, so
    // it is the moment the discipline's records come within its reach. They are
    // filled from where it already stands rather than left until its next
    // training session, because a horse at its training cap has no next one -
    // and training is the only thing that writes a record.
    await seedDisciplineStatRecords(tx, {
      gameId: competition.gameId,
      animalId,
      breedId: animal.breedId,
      disciplineDefId: competition.disciplineDefId,
    })

    if (entryStatValues.length > 0) {
      await tx.competitionEntryStat.createMany({
        data: entryStatValues.map((s) => ({
          entryId: entry.id,
          statDefId: s.statDefId,
          trainedValue: s.trainedValue,
        })),
      })
    }

    // No need to count again: the row lock taken at the top of this
    // transaction means nothing else can have entered since.
    const entryCount = enteredBefore + 1

    // A full competition is resolved by the resolver, not here. It used to run
    // inline, inside the entering player's mutation, which put a whole
    // competition's prizes and records on the critical path of one HTTP
    // request. Enqueueing in this transaction keeps it atomic with the entry
    // that filled it — an entry that rolls back leaves no work behind — and
    // the caller signals the resolver once this has committed.
    const shouldRun = entryCount >= competition.maxEntries
    if (shouldRun) {
      await enqueueCompetitionResolution(tx, competition.gameId, competitionId)
    }

    // The first entry is what starts the clock. Until this moment the
    // competition had no deadline at all, which is what kept the sweep from
    // resolving it with nothing in it.
    //
    // The deadline is the next sweep boundary, not `now + maxWaitHours`: a
    // deadline measured from whenever someone happened to enter is the drift
    // that anchoring the sweep to an absolute grid exists to remove. Entering
    // at 13:59 means it runs at 14:00, and that is the promise the venue page
    // makes.
    if (entryCount === 1) {
      const config = await tx.gameConfig.findUniqueOrThrow({
        where: { gameId: competition.gameId },
        select: {
          nightlyRunHour: true,
          nightlyRunMinute: true,
          gameTimeZone: true,
          competitionSweepMinutes: true,
          shopRotationMinutes: true,
        },
      })

      // Conditional on `closesAt` still being null, so two players entering an
      // empty competition at once cannot land on two different boundaries —
      // the second update matches nothing and the first writer's deadline
      // stands.
      await tx.competition.updateMany({
        where: { id: competitionId, closesAt: null },
        data: { closesAt: nextBoundaryFor("COMPETITION_SWEEP", config, now) },
      })
    }

    return { entry, shouldRun }

}

/** The same work, for a caller with no transaction of its own. */
export async function enterCompetition(
  client: Client,
  input: {
    animalId: string
    competitionId: string
    playerAccountId: string
  },
  now: Date = new Date()
) {
  // ENTRY_TX carries the longer timeout this path needs: entry takes the
  // competition's row lock, so it can wait behind a resolution in progress.
  return client.$transaction((tx) => enterCompetitionTx(tx, input, now), ENTRY_TX)
}
