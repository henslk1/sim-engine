import { db } from "@sim-engine/db";

type Client = typeof db

export async function enterCompetition(
  client: Client,
  input: {
    animalId: string
    competitionId: string
    playerAccountId: string
  }
) {
  return client.$transaction(async (tx) => {

    const { animalId, competitionId, playerAccountId } = input

    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: competitionId },
      include: {
        disciplineDef: {
          include: {
            equipmentRequirements: true
          }
        }
      }
    })

    if (competition.status !== "OPEN") {
      throw new Error("Competition is not open")
    }

    const tier = await tx.animalCompetitionTier.findUnique({
      where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
      include: { tierDef: true }
    })

    if (!tier) throw new Error("Animal has no competition tier for this discipline")

    // equipment check
    const equipmentRequirements = competition.disciplineDef.equipmentRequirements
    if (equipmentRequirements.length > 0) {
      const equippedItems = await tx.animalEquipment.findMany({ where: { animalId } })
      for (const req of equipmentRequirements) {
        const count = equippedItems.filter(e => e.itemDefId === req.itemDefId).length
        if (count < req.quantity) {
          throw new Error("Animal is missing required equipment for this discipline")
        }
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

    const energyUsed = tier.tierDef.energyCost
    const entryFee = tier.tierDef.entryFee

    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: Math.max(energy.currentEnergy - energyUsed, 0) },
    })

    const baseCurrency = await tx.currencyDef.findFirstOrThrow({
      where: { gameId: competition.gameId, currencyType: "BASE" },
      select: { id: true },
    })

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

    const entry = await tx.competitionEntry.create({
      data: {
        competitionId,
        animalId,
        playerAccountId,
      },
    })

    const entryCount = await tx.competitionEntry.count({ where: { competitionId } })
    const shouldRun = entryCount >= competition.maxEntries

    return { entry, shouldRun }

  })
}
