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

    if (competition.disciplineDef.isConformation) {
      const conformationScore = await tx.animalConformationScore.findFirst({ where: { animalId } })
      if (!conformationScore) throw new Error("Animal must have a conformation score to enter this competition")
    }

    const baseEnergyCost = tier.tierDef.energyCost
    const entryFee = tier.tierDef.entryFee

    const [energy, animal] = await Promise.all([
      tx.animalEnergy.findUnique({ where: { animalId } }),
      tx.animal.findUniqueOrThrow({
        where: { id: animalId },
        select: { ageInCycles: true, lifeStage: { select: { energyCostMultiplier: true } } },
      }),
    ])
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)

    const energyUsed = baseEnergyCost * animal.lifeStage.energyCostMultiplier

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: Math.max(energy.currentEnergy - energyUsed, 0) },
    })

    const gameConfig = await tx.gameConfig.findFirst({
      where: { gameId: competition.gameId },
      select: { conditionWorkGain: true },
    })
    if (gameConfig && gameConfig.conditionWorkGain > 0) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId } })
      if (condition) {
        await tx.animalCondition.update({
          where: { animalId },
          data: { value: Math.min(100, condition.value + gameConfig.conditionWorkGain) },
        })
      }
    }

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
        tierDefId: tier.tierDefId,
        cycleNumber: animal.ageInCycles,
      },
    })

    const entryCount = await tx.competitionEntry.count({ where: { competitionId } })
    const shouldRun = entryCount >= competition.maxEntries

    return { entry, shouldRun }

  })
}
