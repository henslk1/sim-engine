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
        venue: true,
        disciplineDef: {
          include: {
            statWeights: true,
            personalityWeights: true,
          }
        },
        entries: {
          include: {
            animal: {
              include: {
                stats: true,
                personality: true,
                conformationScores: true,
              }
            }
          }
        },
        prizeConfigs: true,
      }
    })

    if (competition.status !== "OPEN") {
      throw new Error("Competition is not open")
    }

    await tx.competition.update({
      where: { id: competitionId },
      data: { status: "IN_PROGRESS" },
    })

    const scored = competition.entries.map((entry) => {
      let score = 0

      /*score conformation*/
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
      return { entryId: entry.id, animalId: entry.animalId, playerAccountId: entry.playerAccountId, score: score + variance}

    })

    const ranked = [...scored].sort((a, b) => b.score - a.score).map((entry, i) => ({
        ...entry,
        placement: i + 1,
      }))

    for (const entry of ranked) {
      await tx.competitionResult.create({
        data: { entryId: entry.entryId, placement: entry.placement, score: entry.score },
      })
    }

    /*distribute prizes*/
    for (const prize of competition.prizeConfigs) {
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

    const now = new Date()
    const day = now.getUTCDay()
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1))
    weekStart.setUTCHours(0, 0, 0, 0)

    for (const entry of ranked) {
      await tx.animalWeeklyPoints.upsert({
        where: { animalId_disciplineDefId_weekStart: { animalId: entry.animalId, disciplineDefId: competition.disciplineDefId, weekStart } },
        create: { animalId: entry.animalId, disciplineDefId: competition.disciplineDefId, weekStart, points: entry.score},
        update: { points: { increment: entry.score } },
      })
    }

    await tx.competition.update({
      where: { id: competitionId },
      data: { status: "COMPLETED" },
    })

    return ranked

  })
}