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
        tierDef: true,
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

    // tier match check
    if (competition.tierDefId && tier.tierDefId !== competition.tierDefId) {
      const compTierName = competition.tierDef?.name ?? competition.tierDefId
      throw new Error(`This competition is for ${compTierName} tier. Your animal competes at ${tier.tierDef.name} tier.`)
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

    if (competition.breedId) {
      const animal = await tx.animal.findUniqueOrThrow({ where: { id: animalId }, select: { breedId: true } })
      if (animal.breedId !== competition.breedId) {
        throw new Error("This competition is restricted to a specific breed")
      }
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

    const [energy, animal] = await Promise.all([
      tx.animalEnergy.findUnique({ where: { animalId } }),
      tx.animal.findUniqueOrThrow({
        where: { id: animalId },
        select: { ageInCycles: true, lifeStage: { select: { energyCostMultiplier: true } } },
      }),
    ])
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
    if (gameConfig && gameConfig.conditionWorkGain > 0) {
      const condition = await tx.animalCondition.findUnique({ where: { animalId } })
      if (condition) {
        await tx.animalCondition.update({
          where: { animalId },
          data: { value: Math.min(100, condition.value + gameConfig.conditionWorkGain) },
        })
      }
    }

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

    const entry = await tx.competitionEntry.create({
      data: {
        competitionId,
        animalId,
        playerAccountId,
        tierDefId: tier.tierDefId,
        cycleNumber: animal.ageInCycles,
      },
    })

    if (!competition.disciplineDef.isConformation) {
      const statWeights = await tx.disciplineStatWeight.findMany({
        where: { disciplineDefId: competition.disciplineDefId },
        select: { statDefId: true },
      })
      if (statWeights.length > 0) {
        const animalStats = await tx.animalStat.findMany({
          where: { animalId, statDefId: { in: statWeights.map((s) => s.statDefId) } },
          select: { statDefId: true, trainedValue: true },
        })
        if (animalStats.length > 0) {
          await tx.competitionEntryStat.createMany({
            data: animalStats.map((s) => ({
              entryId: entry.id,
              statDefId: s.statDefId,
              trainedValue: s.trainedValue,
            })),
          })
        }
      }
    }

    const entryCount = await tx.competitionEntry.count({ where: { competitionId } })
    const shouldRun = entryCount >= competition.maxEntries

    return { entry, shouldRun }

  })
}
