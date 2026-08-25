import { db } from "@sim-engine/db";

type Client = typeof db

function computePersonalityMultiplier(value: number, idealMin: number, idealMax: number): number {
  if (value >= idealMin && value <= idealMax) return 1.0
  if (value < idealMin) {
    if (idealMin === 0) return 1.0
    return (value / idealMin) * 2 - 1
  }
  if (idealMax === 100) return 1.0
  return 1 - 2 * (value - idealMax) / (100 - idealMax)
}

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
            entryStats: true,
            animal: {
              include: {
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

    // pre-fetch world max trained value per stat for normalization
    const statWorldMaxes = new Map<string, number>()
    if (!competition.disciplineDef.isConformation) {
      await Promise.all(competition.disciplineDef.statWeights.map(async (weight) => {
        const recordDef = await tx.recordDef.findFirst({
          where: { statDefId: weight.statDefId, gameId: competition.gameId },
          select: { id: true },
        })
        let worldMax: number | null = null
        if (recordDef) {
          const best = await tx.recordEntry.findFirst({
            where: { recordDefId: recordDef.id },
            orderBy: { value: "desc" },
            select: { value: true },
          })
          worldMax = best?.value ?? null
        }
        if (!worldMax) {
          const agg = await tx.animalStat.aggregate({
            _max: { trainedValue: true },
            where: { statDefId: weight.statDefId },
          })
          worldMax = agg._max.trainedValue ?? 1
        }
        statWorldMaxes.set(weight.statDefId, Math.max(worldMax, 1))
      }))
    }

    // pre-fetch climate/terrain modifiers per animal
    const animalEnvMods = new Map<string, number>()
    {
      const expressionRulesWithMods = await tx.expressionRule.findMany({
        where: {
          OR: [
            { climateModifiers: { some: { climate: competition.venue.climate } } },
            { terrainModifiers: { some: { terrain: competition.venue.terrain } } },
          ],
        },
        select: {
          locusId: true,
          alleleOneId: true,
          alleleTwoId: true,
          climateModifiers: { where: { climate: competition.venue.climate }, select: { modifier: true } },
          terrainModifiers: { where: { terrain: competition.venue.terrain }, select: { modifier: true } },
        },
      })
      const exprModMap = new Map<string, number>()
      for (const rule of expressionRulesWithMods) {
        const key = `${rule.locusId}:${rule.alleleOneId}:${rule.alleleTwoId}`
        const climMod = rule.climateModifiers[0]?.modifier ?? 0
        const terrMod = rule.terrainModifiers[0]?.modifier ?? 0
        exprModMap.set(key, climMod + terrMod)
      }
      const animalIds = competition.entries.map((e) => e.animalId)
      const genotypes = await tx.animalGenotype.findMany({
        where: { animalId: { in: animalIds } },
        select: { animalId: true, locusId: true, alleleOneId: true, alleleTwoId: true },
      })
      for (const g of genotypes) {
        const mod = exprModMap.get(`${g.locusId}:${g.alleleOneId}:${g.alleleTwoId}`)
        if (mod) animalEnvMods.set(g.animalId, (animalEnvMods.get(g.animalId) ?? 0) + mod)
      }
    }

    // score all entries
    const scored = competition.entries.map((entry) => {
      let score = 0

      if (competition.disciplineDef.isConformation) {
        const conformationScore = entry.animal.conformationScores.find(
          s => s.breedId === entry.animal.breedId
        )
        const baseScore = conformationScore?.score ?? 0
        let personalityMultiplier = 1.0
        for (const weight of competition.disciplineDef.personalityWeights) {
          const trait = entry.animal.personality.find(p => p.traitDefId === weight.traitDefId)
          const effectiveValue = trait ? Math.min(100, Math.max(0, trait.value + trait.personalityModifier)) : 50
          const mult = computePersonalityMultiplier(effectiveValue, weight.idealMin, weight.idealMax)
          personalityMultiplier += (weight.bonusPercent / 100) * mult
        }
        const envMod = animalEnvMods.get(entry.animalId) ?? 0
        score = Math.max(0, baseScore * personalityMultiplier * (1 + envMod / 100))
      } else {
        let statScore = 0
        for (const weight of competition.disciplineDef.statWeights) {
          const stat = entry.entryStats.find(s => s.statDefId === weight.statDefId)
          const worldMax = statWorldMaxes.get(weight.statDefId) ?? 1
          statScore += weight.weight * ((stat?.trainedValue ?? 0) / worldMax)
        }
        let personalityMultiplier = 1.0
        for (const weight of competition.disciplineDef.personalityWeights) {
          const trait = entry.animal.personality.find(p => p.traitDefId === weight.traitDefId)
          const effectiveValue = trait ? Math.min(100, Math.max(0, trait.value + trait.personalityModifier)) : 50
          const mult = computePersonalityMultiplier(effectiveValue, weight.idealMin, weight.idealMax)
          personalityMultiplier += (weight.bonusPercent / 100) * mult
        }
        const envMod = animalEnvMods.get(entry.animalId) ?? 0
        score = Math.max(0, statScore * 100 * personalityMultiplier * (1 + envMod / 100))
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

    // tier advancement — check every competing animal's weekly total against their tier's threshold
    const uniqueAnimalIds = [...new Set(allRanked.map((e) => e.animalId))]
    for (const animalId of uniqueAnimalIds) {
      const animalTier = await tx.animalCompetitionTier.findUnique({
        where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
        include: {
          tierDef: { select: { tierIndex: true, advancementThreshold: true } },
        },
      })
      if (!animalTier || animalTier.tierDef.advancementThreshold == null) continue

      const weeklyRecord = await tx.animalWeeklyPoints.findUnique({
        where: { animalId_disciplineDefId_weekStart: { animalId, disciplineDefId: competition.disciplineDefId, weekStart } },
      })
      if (!weeklyRecord || weeklyRecord.points < animalTier.tierDef.advancementThreshold) continue

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

  })
}
