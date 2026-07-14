import { db } from "@sim-engine/db";

type Client = typeof db

export async function runCompetition(
  client: Client,
  input: {
    competitionId: string
  }
) {
  return client.$transaction(async (tx) => {

    const { competitionId } = input

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
        disciplineDef: {
          include: {
            statWeights: true,
            personalityWeights: true,
          }
        },
        entries: {
          include: {
            tierDef: { include: { tierPrizes: true } },
            animal: {
              include: {
                stats: true,
                personality: true,
                conformationScores: true,
              }
            }
          }
        },
      }
    })

    if (competition.status !== "OPEN") {
      throw new Error("Competition is not open")
    }

    await tx.competition.update({
      where: { id: competitionId },
      data: { status: "IN_PROGRESS" },
    })

    // score all entries
    const scored = competition.entries.map((entry) => {
      let score = 0

      if (competition.disciplineDef.isConformation) {
        const conformationScore = entry.animal.conformationScores.find(
          s => s.breedId === entry.animal.breedId
        )
        score = conformationScore?.score ?? 0
      } else {
        for (const weight of competition.disciplineDef.statWeights) {
          const stat = entry.animal.stats.find(s => s.statDefId === weight.statDefId)
          score += weight.weight * (stat?.trainedValue ?? 0)
        }
        for (const weight of competition.disciplineDef.personalityWeights) {
          const trait = entry.animal.personality.find(p => p.traitDefId === weight.traitDefId)
          score += weight.weight * (trait?.value ?? 0)
        }
      }

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

    await tx.competition.update({
      where: { id: competitionId },
      data: { status: "COMPLETED" },
    })

    return allRanked

  })
}
