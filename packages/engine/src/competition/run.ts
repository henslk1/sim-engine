import type { Prisma } from "@sim-engine/db";
import { finalScore, readEntrySnapshot, readScoringRules } from "./scoring.js"

/**
 * How long one competition's resolution may hold its transaction.
 *
 * Prisma's default is five seconds, which nothing here was setting. Everything
 * a competition does — scoring, results, prizes, group finance, weekly points,
 * tier promotion, daily logs and titles — happens inside this one transaction,
 * and a full field can take longer than that. (Records and season rankings are
 * not among them: records are written by training and read when an entry is
 * accepted, and nothing writes a season ranking yet.) Exceeding it is not a
 * slow success: the transaction is closed underneath the work and the whole
 * resolution rolls back, so a large competition would have failed every time
 * it was tried, durably and forever once there was a work item recording it.
 *
 * `maxWait` is how long to wait for a connection before giving up, which is a
 * queueing concern and stays short.
 */
export const RESOLUTION_TX = { timeout: 120_000, maxWait: 10_000 } as const

/**
 * Resolve a competition, on a transaction the caller owns.
 *
 * Split out so the tutorial's conformation show can run it inside the
 * transaction holding the game's maintenance lock. A helper that opens its own
 * transaction escapes that lock: its reads and writes land on another
 * connection, outside both the lock and the caller's rollback.
 */
export async function runCompetitionTx(
  tx: Prisma.TransactionClient,
  input: {
    competitionId: string
  }
) {

  const { competitionId } = input

  // Claim the competition before reading a single thing about it.
  //
  // Matching on the status makes the transition itself the claim: writing the
  // row takes its exclusive lock, Postgres re-checks the `where` after any
  // wait, and zero rows means somebody else is already running it. Believing a
  // plain read would not do - under READ COMMITTED two callers can both see
  // OPEN, both carry on, and both award prizes - and the scheduler's lease
  // recovery re-runs an interrupted sweep, so duplicate execution is a path
  // the system takes deliberately rather than a freak event.
  //
  // Claiming *first* is the other half, and the half that was missing. The
  // field used to be read above this, which left a window with teeth in it: an
  // entry transaction holds this row with its entry not yet committed, the
  // resolver reads an empty field, queues behind the lock, the entry commits,
  // and the resolver carries on with the list it took before the wait. It then
  // marks the competition COMPLETED containing one accepted entry that has no
  // result and never will. Reading on the far side of the lock is what makes
  // the field this scores the field that actually ran.
  //
  // And once this succeeds the status is IN_PROGRESS, which `enterCompetitionTx`
  // matches on too, so nothing can be added to the field after this line.
  const { count } = await tx.competition.updateMany({
    where: { id: competitionId, status: "OPEN" },
    data: { status: "IN_PROGRESS" },
  })

  if (count !== 1) {
    throw new Error("Competition is not open")
  }

  const competition = await tx.competition.findUniqueOrThrow({
    where: { id: competitionId },
    include: {
      venue: {
        include: {
          group: {
            include: {
              prestige: { include: { tierDef: true } }
            }
          }
        }
      },
      // The name, for the tier-advancement log. The weights were read here
      // because resolution scored on them; it scores on what each entry saved
      // instead, so the discipline's current configuration is none of its
      // business any more.
      disciplineDef: { select: { name: true } },
      entries: {
        // No `animal` and no `entryStats`, for the same reason. Four joins
        // resolution no longer makes, and - the point - four things it can no
        // longer be accidentally scored on.
        include: {
          tierDef: { include: { tierPrizes: true } },
        }
      },
    }
  })

  // The rules this field was frozen under.
  //
  // Every entry carries its own four finished factors and the competition
  // carries the rules they were worked out against, so resolution multiplies
  // and ranks. It reads nothing about the animal, which is why burying one no
  // longer empties the field it competed in.
  //
  // There was a second path here, scoring an entry out of the live world when
  // it had saved nothing, for rows made before the snapshot existed. There are
  // no such rows - every entry belongs to a competition that has already been
  // resolved, and the open ones are empty - so what it kept alive was the one
  // behaviour all of this removes: a field measured against a world that moved
  // after it was entered. Reachable, too, by any later bug that left `scoredAt`
  // unset, and silent when it was.
  //
  // An entry with no snapshot now stops the competition and names itself.
  // `scoredAt` is what can say so, and has to be its own column: a disqualified
  // conformation score IS 0, an untrained stat score IS 0 and an indifferent
  // genotype IS 0, so no saved value can tell itself apart from its own absence.
  const rules = readScoringRules(competition.scoringRules)

  const scored = competition.entries.map((entry) => {
    if (rules === null) {
      // The two writes came apart. A competition that froze nothing because
      // nobody entered it never reaches here, having nothing to map over.
      throw new Error(`Competition ${competitionId} has entries but no frozen scoring rules`)
    }

    // `?? 1` and `?? 0` used to live inside this read, and were exactly wrong:
    // a snapshot half-written by some future bug would have scored as though
    // the animal had an average personality and an indifferent genotype, placed
    // against horses that were scored properly, and left nothing behind to say
    // so.
    const snapshot = readEntrySnapshot(entry, rules.isConformation)
    if (snapshot === null) {
      throw new Error(`Competition entry ${entry.id} was never scored`)
    }

    const score = finalScore(snapshot, rules.isConformation)

    // The one thing deliberately not frozen. Two horses with identical saved
    // factors should still not be a foregone conclusion, and the roll happens
    // at resolution because that is when the competition is run.
    const variance = (Math.random() - 0.5) * score * 0.2
    return {
      entryId: entry.id,
      animalId: entry.animalId,
      playerAccountId: entry.playerAccountId,
      tierDefId: entry.tierDefId,
      tierDef: entry.tierDef,
      score: score + variance,
    }
  })

  // group by tier and rank within each group
  const byTier = new Map<string, typeof scored>()
  for (const entry of scored) {
    const group = byTier.get(entry.tierDefId) ?? []
    group.push(entry)
    byTier.set(entry.tierDefId, group)
  }

  const allRanked: (typeof scored[number] & { placement: number })[] = []

  for (const [, entries] of byTier) {
    const ranked = [...entries]
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, placement: i + 1 }))
    allRanked.push(...ranked)
  }

  for (const entry of allRanked) {
    await tx.competitionResult.create({
      data: { entryId: entry.entryId, placement: entry.placement, score: entry.score },
    })
  }

  // prizes per tier group
  for (const [, entries] of byTier) {
    const tierDef = entries[0]!.tierDef
    const prizes = tierDef.tierPrizes.filter(
      p => p.isInvitational === competition.isInvitational
    )
    const ranked = allRanked.filter(e => e.tierDefId === tierDef.id)

    for (const prize of prizes) {
      if (!prize.currencyDefId) continue
      const winner = ranked.find(e => e.placement === prize.placement)
      if (!winner) continue

      await tx.playerBalance.upsert({
        where: { playerAccountId_currencyDefId: { playerAccountId: winner.playerAccountId, currencyDefId: prize.currencyDefId } },
        create: { playerAccountId: winner.playerAccountId, currencyDefId: prize.currencyDefId, balance: prize.amount },
        update: { balance: { increment: prize.amount } },
      })

      await tx.transaction.create({
        data: { gameId: competition.gameId, toPlayerAccountId: winner.playerAccountId, currencyDefId: prize.currencyDefId, amount: prize.amount, txnType: "PRIZE" },
      })
    }
  }

  // entry fee share to group if venue is group-owned
  const group = competition.venue.group
  const entryFeeSharePercent = group?.prestige?.tierDef?.entryFeeSharePercent ?? 0
  if (group && entryFeeSharePercent > 0) {
    const totalEntryFees = allRanked.reduce((sum, e) => sum + e.tierDef.entryFee, 0)
    const shareAmount = Math.floor(totalEntryFees * (entryFeeSharePercent / 100))

    if (shareAmount > 0) {
      const baseCurrency = await tx.currencyDef.findFirstOrThrow({
        where: { gameId: competition.gameId, currencyType: "BASE" },
        select: { id: true },
      })

      await tx.groupFinance.upsert({
        where: { groupId_currencyDefId: { groupId: group.id, currencyDefId: baseCurrency.id } },
        create: { groupId: group.id, currencyDefId: baseCurrency.id, balance: shareAmount },
        update: { balance: { increment: shareAmount } },
      })

      await tx.transaction.create({
        data: {
          gameId: competition.gameId,
          toGroupId: group.id,
          currencyDefId: baseCurrency.id,
          amount: shareAmount,
          txnType: "GROUP_CONTRIBUTION",
        },
      })
    }
  }

  const now = new Date()
  const day = now.getUTCDay()
  const weekStart = new Date(now)
  weekStart.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1))
  weekStart.setUTCHours(0, 0, 0, 0)

  for (const entry of allRanked) {
    await tx.animalWeeklyPoints.upsert({
      where: { animalId_disciplineDefId_weekStart: { animalId: entry.animalId, disciplineDefId: competition.disciplineDefId, weekStart } },
      create: { animalId: entry.animalId, disciplineDefId: competition.disciplineDefId, weekStart, points: entry.score },
      update: { points: { increment: entry.score } },
    })
  }

  // tier advancement — check every competing animal's career total in the
  // discipline against their tier's threshold. Deliberately not the weekly
  // bucket written above: that exists for invitational eligibility and resets
  // every Monday, which would wipe a horse's progress toward the next tier
  // partway through earning it.
  const uniqueAnimalIds = [...new Set(allRanked.map((e) => e.animalId))]
  for (const animalId of uniqueAnimalIds) {
    const animalTier = await tx.animalCompetitionTier.findUnique({
      where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
      include: {
        tierDef: { select: { tierIndex: true, advancementThreshold: true } },
      },
    })
    if (!animalTier || animalTier.tierDef.advancementThreshold == null) continue

    const career = await tx.competitionResult.aggregate({
      _sum: { score: true },
      where: { entry: { animalId, competition: { disciplineDefId: competition.disciplineDefId } } },
    })
    if ((career._sum.score ?? 0) < animalTier.tierDef.advancementThreshold) continue

    const nextTier = await tx.competitionTierDef.findFirst({
      where: {
        disciplineDefId: competition.disciplineDefId,
        tierIndex: { gt: animalTier.tierDef.tierIndex },
      },
      orderBy: { tierIndex: "asc" },
      select: { id: true, name: true },
    })
    if (!nextTier) continue

    await tx.animalCompetitionTier.update({
      where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
      data: { tierDefId: nextTier.id },
    })

    const entryForCycle = allRanked.find((e) => e.animalId === animalId)
    const entryRecord = entryForCycle
      ? competition.entries.find((e) => e.animalId === animalId)
      : null
    await tx.animalDailyLog.create({
      data: {
        animalId,
        cycleNumber: (entryRecord as { cycleNumber?: number } | null)?.cycleNumber ?? 0,
        eventType: "TIER_ADVANCED",
        context: {
          newTierName: nextTier.name,
          disciplineName: competition.disciplineDef.name,
        },
      },
    })
  }

  // Award titles based on placement matching rankOrder — max tier only
  for (const entry of allRanked) {
    if (entry.tierDef.advancementThreshold !== null) continue
    const titleDef = await tx.titleDef.findFirst({
      where: {
        disciplineDefId: competition.disciplineDefId,
        rankOrder: entry.placement,
        animalTitles: { none: { animalId: entry.animalId } },
      },
      select: { id: true, requiredPlacements: true },
    })
    if (titleDef) {
      const placingCount = await tx.competitionResult.count({
        where: {
          placement: entry.placement,
          entry: {
            animalId: entry.animalId,
            tierDef: { advancementThreshold: null },
            competition: { disciplineDefId: competition.disciplineDefId },
          },
        },
      })
      if (placingCount >= titleDef.requiredPlacements) {
        const entryRecord = competition.entries.find((e) => e.animalId === entry.animalId)
        await tx.animalTitle.create({
          data: {
            animalId: entry.animalId,
            titleDefId: titleDef.id,
            cycleNumber: (entryRecord as { cycleNumber?: number } | null)?.cycleNumber ?? 0,
          },
        })
      }
    }
  }

  await tx.competition.update({
    where: { id: competitionId },
    data: { status: "COMPLETED" },
  })

  return allRanked

}

/*
 * There was a `runCompetition(client, input)` here, opening its own
 * transaction for a caller that had none. It is gone, and the absence is the
 * point: every caller is a writer in some game, and a writer that opens its
 * own transaction has no way to join that game's maintenance lock — so it
 * resolves placements into a game a nightly may have just taken.
 *
 * That is not hypothetical. The competition resolver used it, and a nightly
 * starting mid-chunk took the game out from under a resolution that was
 * halfway through writing into it. The resolver now opens the transaction
 * itself, calls `enterGameplay` first and `runCompetitionTx` second, and the
 * tutorial's conformation show has always done the same.
 *
 * Anything that needs this work does it the same way, and `RESOLUTION_TX` is
 * exported for it: the allowance belongs to the work, not to whoever is
 * calling it this time.
 */
