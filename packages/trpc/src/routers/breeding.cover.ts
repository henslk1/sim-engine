import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { generateOffspring, computePhenotypeDescription, computePhenotypeCodes, computeBreedingQuality, computeCOI, computeFixedFields, type ParentData } from "@sim-engine/engine"

async function buildBreedFreqMap(
  sireComp: Array<{ breedId: string; percentage: number }>,
  damComp: Array<{ breedId: string; percentage: number }>,
) {
  const breedIds = [...new Set([...sireComp.map(c => c.breedId), ...damComp.map(c => c.breedId)])]
  const sireMap = new Map(sireComp.map(c => [c.breedId, c.percentage]))
  const damMap = new Map(damComp.map(c => [c.breedId, c.percentage]))

  const rawFreqs = await db.breedAlleleFrequency.findMany({
    where: { breedId: { in: breedIds }, allele: { locus: { isHiddenModifier: true } } },
    select: { breedId: true, frequency: true, allele: { select: { id: true, symbol: true, locusId: true } } },
  })

  const blendMap = new Map<string, Map<string, { symbol: string; frequency: number }>>()
  for (const rf of rawFreqs) {
    const pct = ((sireMap.get(rf.breedId) ?? 0) + (damMap.get(rf.breedId) ?? 0)) / 2
    const locusId = rf.allele.locusId
    if (!blendMap.has(locusId)) blendMap.set(locusId, new Map())
    const alMap = blendMap.get(locusId)!
    const prev = alMap.get(rf.allele.id)
    alMap.set(rf.allele.id, { symbol: rf.allele.symbol, frequency: (prev?.frequency ?? 0) + rf.frequency * pct })
  }

  return new Map(
    Array.from(blendMap.entries()).map(([locusId, alMap]) => [
      locusId,
      Array.from(alMap.entries()).map(([alleleId, v]) => ({ alleleId, symbol: v.symbol, frequency: v.frequency })),
    ])
  )
}

const eligibleFemaleSelect = {
  id: true,
  name: true,
  ageInCycles: true,
  fertility: true,
  inbreedingCoefficient: true,
  breedName: true,
  breed: { select: { id: true, name: true } },
  lifeStage: { select: { name: true } },
  mood: { select: { value: true } },
  energy: { select: { currentEnergy: true } },
} as const

function eligibleFemaleWhere(playerAccountId: string, gameId: string) {
  return {
    playerAccountId,
    gameId,
    sex: "FEMALE" as const,
    isCastrated: false,
    status: "ALIVE" as const,
    lifeStage: { canBreed: true },
    pregnancies: { none: { isCompleted: false } },
    NOT: [{ gameShopAnimal: { isAvailable: true } }],
  }
}

const parentSelect = {
  id: true,
  name: true,
  generation: true,
  playerAccountId: true,
  breedId: true,
  ageInCycles: true,
  breed: { select: { name: true } },
  fertility: true,
  inbreedingCoefficient: true,
  breedGeneration: true,
  breedingCooldownUntilCycle: true,
  stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
  energy: { select: { currentEnergy: true } },
  mood: { select: { value: true } },
  personality: {
    select: {
      traitDefId: true,
      value: true,
      traitDef: { select: { labelRanges: { select: { minValue: true, maxValue: true, conceptionModifier: true } } } },
    },
  },
  careScore: { select: { score: true } },
  compTiers: {
    select: {
      tierDef: { select: { tierIndex: true } },
      disciplineDef: {
        select: {
          isConformation: true,
          compTierDefs: {
            select: { tierIndex: true },
            orderBy: { tierIndex: "desc" as const },
            take: 1,
          },
        },
      },
    },
    orderBy: { tierDef: { tierIndex: "desc" as const } },
    take: 1,
  },
  conformationScores: { select: { score: true } },
  healthRecords: { select: { isActive: true } },
  genotypes: {
    select: {
      locusId: true,
      alleleOneId: true,
      alleleTwoId: true,
      isTestedByOwner: true,
      locus: {
        select: {
          inheritanceWeight: true,
          panelEntries: { select: { panelDef: { select: { panelType: true } } } },
        },
      },
      alleleOne: { select: { id: true, symbol: true } },
      alleleTwo: { select: { id: true, symbol: true } },
    },
  },
  breedComposition: { select: { breedId: true, percentage: true } },
  immunity: { select: { innateMax: true } },
  ancestors: {
    select: {
      ancestorId: true,
      depth: true,
      ancestor: { select: { inbreedingCoefficient: true } },
    },
  },
} as const

const gameConfigBreedingSelect = {
  defaultInnateRatio: true,
  breedingBaseGain: true,
  breedingMinGain: true,
  breedingVarianceFactor: true,
  gestationCareFloor: true,
  topGradeDoubleBonusChance: true,
  multiplesBirthCap: true,
  multiplesChance: true,
  identicalMultiplesChance: true,
  gestationCycles: true,
  lifeExpectancyBaseline: true,
  breedingEnergyCost: true,
  trainingCeilingMultiplier: true,
} as const

// Shared select used by both previewPair and getForBreeding
const breedingDisplaySelect = {
  id: true,
  name: true,
  sex: true,
  fertility: true,
  inbreedingCoefficient: true,
  breedId: true,
  breed: { select: { id: true, name: true } },
  playerAccount: { select: { id: true, username: true } },
  lifeStage: { select: { name: true } },
  mood: { select: { value: true } },
  personality: { select: { value: true, traitDef: { select: { labelRanges: { select: { minValue: true, maxValue: true, conceptionModifier: true } } } } } },
  careScore: { select: { score: true } },
  ancestors: { select: { ancestorId: true, depth: true, ancestor: { select: { inbreedingCoefficient: true } } } },
  compTiers: {
    select: {
      tierDef: { select: { tierIndex: true } },
      disciplineDef: {
        select: {
          isConformation: true,
          compTierDefs: { select: { tierIndex: true }, orderBy: { tierIndex: "desc" as const }, take: 1 },
        },
      },
    },
    orderBy: { tierDef: { tierIndex: "desc" as const } },
    take: 1,
  },
  stats: { select: { innateValue: true, trainedValue: true } },
  breedComposition: { select: { breedId: true } },
  conformationScores: { select: { score: true } },
  genotypes: {
    select: {
      isTestedByOwner: true,
      locus: { select: { panelEntries: { select: { panelDef: { select: { panelType: true } } } } } },
    },
  },
  healthRecords: { select: { isActive: true } },
} as const

type AnimalForDisplay = {
  inbreedingCoefficient: number
  stats: { innateValue: number; trainedValue: number }[]
  careScore: { score: number } | null
  compTiers: Array<{
    tierDef: { tierIndex: number }
    disciplineDef: { isConformation: boolean; compTierDefs: { tierIndex: number }[] }
  }>
  breedComposition: { breedId: string }[]
  conformationScores: { score: number }[]
  genotypes: { isTestedByOwner: boolean; locus: { panelEntries: { panelDef: { panelType: string } }[] } }[]
  healthRecords: { isActive: boolean }[]
}

function computeAnimalGrade(a: AnimalForDisplay, trainingCeilingMultiplier: number): string {
  const topTierEntry = a.compTiers[0]
  const compTier = topTierEntry
    ? {
        tierIndex: topTierEntry.tierDef.tierIndex,
        maxTierIndex: topTierEntry.disciplineDef.compTierDefs[0]?.tierIndex ?? topTierEntry.tierDef.tierIndex,
      }
    : null
  const trainedStatAvgRatio =
    a.stats.length > 0
      ? a.stats.reduce((sum, s) => {
          const cap = s.innateValue * trainingCeilingMultiplier
          return sum + Math.min(s.trainedValue / cap, 1)
        }, 0) / a.stats.length
      : 0
  const isCross = a.breedComposition.length > 1
  const conformationAvg =
    !isCross && a.conformationScores.length > 0
      ? a.conformationScores.reduce((s, c) => s + c.score, 0) / a.conformationScores.length
      : null
  const healthLoci = a.genotypes.filter((g) =>
    g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
  )
  const healthTestedRatio =
    healthLoci.length > 0 ? healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length : null
  const hasTopSportTier = a.compTiers
    .filter((t) => !t.disciplineDef.isConformation)
    .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
  const hasTopConformationTier = a.compTiers
    .filter((t) => t.disciplineDef.isConformation)
    .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
  return computeBreedingQuality({
    careScore: a.careScore?.score ?? 0,
    compTier,
    inbreedingCoefficient: a.inbreedingCoefficient,
    trainedStatAvgRatio,
    conformationAvg,
    healthTestedRatio,
    activeConditions: a.healthRecords.filter((r) => r.isActive).length,
    hasTopSportTier,
    hasTopConformationTier,
  }).grade
}

export const breedingCoverRouter = router({
  listEligibleOwn: publicProcedure
    .input(z.object({ sireId: z.string() }))
    .query(async ({ input }) => {
      const sire = await db.animal.findUniqueOrThrow({
        where: { id: input.sireId },
        select: { playerAccountId: true, gameId: true },
      })
      return db.animal.findMany({
        where: eligibleFemaleWhere(sire.playerAccountId, sire.gameId),
        select: eligibleFemaleSelect,
        orderBy: { name: "asc" },
      })
    }),

  listEligibleDams: publicProcedure
  .input(z.object({ playerAccountId: z.string(), gameId: z.string() }))
  .query(async ({ input }) => {
    return db.animal.findMany({
      where: eligibleFemaleWhere(input.playerAccountId, input.gameId),
      select: eligibleFemaleSelect,
    })
  }),

  lookupPlayerFemales: publicProcedure
    .input(z.object({ username: z.string().min(1), gameId: z.string(), excludePlayerAccountId: z.string().optional() }))
    .query(async ({ input }) => {
      const player = await db.playerAccount.findFirst({
        where: {
          username: input.username,
          gameId: input.gameId,
          ...(input.excludePlayerAccountId ? { id: { not: input.excludePlayerAccountId } } : {}),
        },
        select: { id: true, username: true },
      })
      if (!player) return null
      const females = await db.animal.findMany({
        where: eligibleFemaleWhere(player.id, input.gameId),
        select: eligibleFemaleSelect,
        orderBy: { name: "asc" },
      })
      return { player, females }
    }),

  send: publicProcedure
    .input(z.object({
      sireId: z.string(),
      damId: z.string(),
      price: z.number().min(0).default(0),
      fromListing: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const [sire, dam] = await Promise.all([
        db.animal.findUniqueOrThrow({
          where: { id: input.sireId },
          select: {
            sex: true, gameId: true, ageInCycles: true,
            lifeStage: { select: { canBreed: true } },
            isCastrated: true,
            energy: { select: { currentEnergy: true } },
            game: { select: { gameConfig: { select: { breedingEnergyCost: true } } } },
          },
        }),
        db.animal.findUniqueOrThrow({
          where: { id: input.damId },
          select: {
            sex: true, gameId: true,
            lifeStage: { select: { canBreed: true } },
            gameShopAnimal: { select: { isAvailable: true } },
            energy: { select: { currentEnergy: true } },
          },
        }),
      ])

      if (sire.sex !== "MALE") throw new Error("Sire must be male")
      if (dam.sex !== "FEMALE") throw new Error("Dam must be female")
      if (dam.gameShopAnimal?.isAvailable) throw new Error("Dam is a game shop animal and cannot receive cover offers")
      if (sire.isCastrated) throw new Error("Sire is castrated")
      if (!sire.lifeStage.canBreed) throw new Error("Sire cannot breed at this life stage")
      if (!dam.lifeStage.canBreed) throw new Error("Dam cannot breed at this life stage")
      if (sire.gameId !== dam.gameId) throw new Error("Animals must be in the same game")

      const energyCost = sire.game.gameConfig?.breedingEnergyCost ?? 0
      if (energyCost > 0 && !input.fromListing) {
        if ((sire.energy?.currentEnergy ?? 0) < energyCost)
          throw new Error("Sire does not have enough energy to send a cover offer")
        await db.animalEnergy.update({
          where: { animalId: input.sireId },
          data: { currentEnergy: { decrement: energyCost } },
        })
      }
      if (energyCost > 0 && input.fromListing) {
        if ((dam.energy?.currentEnergy ?? 0) < energyCost)
          throw new Error("Dam does not have enough energy for this breeding")
      }

      const offer = await db.coverOffer.create({
        data: {
          gameId: sire.gameId,
          sireId: input.sireId,
          damId: input.damId,
          price: input.price,
          fromListing: input.fromListing,
        },
        select: { id: true, status: true },
      })

      await db.animalDailyLog.create({
        data: {
          animalId: input.sireId,
          cycleNumber: sire.ageInCycles,
          eventType: "COVER_SENT",
          partnerAnimalId: input.damId,
          ...(input.price > 0 ? { context: { price: input.price } } : {}),
        },
      })

      return offer
    }),

  accept: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const offer = await tx.coverOffer.findUniqueOrThrow({
          where: { id: input.offerId },
          select: { status: true, gameId: true, sireId: true, damId: true, price: true, fromListing: true },
        })

        if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")

        const [sireStatus, damStatus] = await Promise.all([
          tx.animal.findUnique({
            where: { id: offer.sireId },
            select: { status: true, isCastrated: true, ageInCycles: true, breedingCooldownUntilCycle: true, lifeStage: { select: { canBreed: true } } },
          }),
          tx.animal.findUnique({
            where: { id: offer.damId },
            select: { status: true, isCastrated: true, ageInCycles: true, breedingCooldownUntilCycle: true, lifeStage: { select: { canBreed: true } } },
          }),
        ])

        if (!sireStatus || sireStatus.status !== "ALIVE") throw new Error("Sire is no longer alive")
        if (sireStatus.isCastrated) throw new Error("Sire has been castrated")
        if (!sireStatus.lifeStage.canBreed) throw new Error("Sire can no longer breed at this life stage")
        if ((sireStatus.breedingCooldownUntilCycle ?? 0) > sireStatus.ageInCycles) {
          throw new Error(`Sire is on a breeding cooldown until cycle ${sireStatus.breedingCooldownUntilCycle}`)
        }

        if (!damStatus || damStatus.status !== "ALIVE") throw new Error("Dam is no longer alive")
        if (damStatus.isCastrated) throw new Error("Dam has been castrated")
        if (!damStatus.lifeStage.canBreed) throw new Error("Dam can no longer breed at this life stage")

        const activePregnancy = await tx.pregnancy.count({
          where: { animalId: offer.damId, isCompleted: false },
        })
        if (activePregnancy > 0) throw new Error("Dam is already pregnant")

        if ((damStatus.breedingCooldownUntilCycle ?? 0) > damStatus.ageInCycles) {
          throw new Error(`Dam is on a breeding cooldown until cycle ${damStatus.breedingCooldownUntilCycle}`)
        }

        const energyConfig = await tx.gameConfig.findUnique({
          where: { gameId: offer.gameId },
          select: { breedingEnergyCost: true },
        })
        const breedingEnergyCost = energyConfig?.breedingEnergyCost ?? 0

        if (breedingEnergyCost > 0) {
          const damEnergy = await tx.animalEnergy.findUnique({
            where: { animalId: offer.damId },
            select: { currentEnergy: true },
          })
          if ((damEnergy?.currentEnergy ?? 0) < breedingEnergyCost) {
            throw new Error("Dam does not have enough energy to accept this cover")
          }
          await tx.animalEnergy.update({
            where: { animalId: offer.damId },
            data: { currentEnergy: { decrement: breedingEnergyCost } },
          })
        }

        // Tutorial embryo implantation - skip generating offspring
        const tutorialPair = await tx.tutorialAnimalPair.findUnique({
          where: { ancestorTwoId: offer.sireId },
          select: { embryoId: true },
        })

        if (tutorialPair) {
          const [sireLight, damLight, gestationConfig] = await Promise.all([
            tx.animal.findUniqueOrThrow({
              where: { id: offer.sireId },
              select: { name: true, breedId: true, breedName: true, breed: { select: { name: true } }, ageInCycles: true },
            }),
            tx.animal.findUniqueOrThrow({
              where: { id: offer.damId },
              select: { name: true, breedId: true, breedName: true, breed: { select: { name: true } }, ageInCycles: true },
            }),
            tx.gameConfig.findUniqueOrThrow({
              where: { gameId: offer.gameId },
              select: { gestationCycles: true },
            }),
          ])

          await tx.coverOffer.update({ where: { id: input.offerId }, data: { status: "ACCEPTED" } })

          if (offer.fromListing) {
            const tutorialListing = await tx.breedingListing.findFirst({
              where: { animalId: offer.sireId, isActive: true },
              select: { id: true },
            })
            if (tutorialListing) {
              const tutorialSlot = await tx.breedingSlot.findFirst({
                where: { listingId: tutorialListing.id, status: "AVAILABLE" },
                select: { id: true },
              })
              if (tutorialSlot) {
                await tx.breedingSlot.update({ where: { id: tutorialSlot.id }, data: { status: "USED" } })
              }
            }
          }

          const breedingRecord = await tx.breedingRecord.create({
            data: {
              gameId: offer.gameId,
              sireId: offer.sireId,
              damId: offer.damId,
              sireSnapshot: { animalId: offer.sireId, name: sireLight.name, breedId: sireLight.breedId, breedName: sireLight.breed?.name ?? sireLight.breedName ?? "" },
              damSnapshot: { animalId: offer.damId, name: damLight.name, breedId: damLight.breedId, breedName: damLight.breed?.name ?? damLight.breedName ?? "" },
            },
            select: { id: true },
          })

          const pregnancy = await tx.pregnancy.create({
            data: { 
              animalId: offer.damId,
              breedingRecordId: breedingRecord.id,
              requiredCycles: gestationConfig.gestationCycles,
            },
            select: { id: true },
          })

          await tx.breedingListing.updateMany({
            where: { animalId: offer.sireId },
            data: { isActive: false },
          })

          await Promise.all([
            tx.pregnancyOffspring.create({
              data: { pregnancyId: pregnancy.id, animalId: tutorialPair.embryoId, birthOrder: 1 },
            }),
            tx.animalDailyLog.create({
              data: {
                animalId: offer.damId,
                cycleNumber: damLight.ageInCycles,
                eventType: "COVER_ACCEPTED",
                partnerAnimalId: offer.sireId,
                outcome: "CONCEIVED",
              },
            }),
            tx.animalDailyLog.create({
              data: {
                animalId: offer.sireId,
                cycleNumber: sireLight.ageInCycles,
                eventType: "COVER_ACCEPTED",
                partnerAnimalId: offer.damId,
                outcome: "CONCEIVED",
              },
            }),
          ])

          return {
            breedingRecordId: breedingRecord.id,
            conceived: true as const,
            pregnancyId: pregnancy.id,
            offspringCount: 1,
            requiredCycles: gestationConfig.gestationCycles,
          }
        }

        const [sire, dam, gameConfig, gameInnateMax, gradeBread, firstLifeStage, damCareScore, expressionRules, personalityLabelRanges] =
          await Promise.all([
            tx.animal.findUniqueOrThrow({ where: { id: offer.sireId }, select: parentSelect }),
            tx.animal.findUniqueOrThrow({ where: { id: offer.damId }, select: parentSelect }),
            tx.gameConfig.findUniqueOrThrow({ where: { gameId: offer.gameId }, select: gameConfigBreedingSelect }),
            tx.gameInnateMax.findFirst({
              where: { gameId: offer.gameId },
              select: { maxTotalInnate: true, averageTotalInnate: true },
            }),
            tx.breed.findFirst({
              where: { gameId: offer.gameId, isUnregistered: true },
              select: { id: true, lifeExpectancyBaseline: true },
            }),
            tx.lifeStageDef.findFirst({
              where: { gameId: offer.gameId },
              orderBy: { stageIndex: "asc" },
              select: { id: true },
            }),
            tx.animalCareScore.findFirst({
              where: { animalId: offer.damId },
              select: { score: true },
            }),
            tx.expressionRule.findMany({
              where: { locus: { gameId: offer.gameId } },
              select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
            }),
            tx.personalityLabelRange.findMany({
              where: { traitDef: { gameId: offer.gameId } },
              select: { traitDefId: true, label: true, minValue: true, maxValue: true },
            }),
          ])

        if (!firstLifeStage) throw new Error("No life stages configured for this game")

        const isCrossBreed = sire.breedId !== dam.breedId
        if (isCrossBreed && !gradeBread) throw new Error("No grade breed configured for this game — add one via Admin > Breeds")

        if (offer.price > 0) {
          const vetService = await tx.vetServiceDef.findFirst({
            where: { gameId: offer.gameId, serviceType: "NATURAL_COVER" },
            select: { currencyDefId: true },
          })
          const currencyDefId = vetService?.currencyDefId
          if (currencyDefId) {
            await tx.playerBalance.update({
              where: { playerAccountId_currencyDefId: { playerAccountId: dam.playerAccountId, currencyDefId } },
              data: { balance: { decrement: offer.price } },
            })
            await tx.playerBalance.update({
              where: { playerAccountId_currencyDefId: { playerAccountId: sire.playerAccountId, currencyDefId } },
              data: { balance: { increment: offer.price } },
            })
            await tx.transaction.create({
              data: {
                gameId: offer.gameId,
                fromPlayerAccountId: dam.playerAccountId,
                toPlayerAccountId: sire.playerAccountId,
                currencyDefId,
                amount: offer.price,
                txnType: "STUD_FEE",
              },
            })
          }
        }

        await tx.coverOffer.update({
          where: { id: input.offerId },
          data: { status: "ACCEPTED" },
        })

        if (offer.fromListing) {
          const activeListing = await tx.breedingListing.findFirst({
            where: { animalId: offer.sireId, isActive: true },
            select: { id: true },
          })
          if (activeListing) {
            const availableSlot = await tx.breedingSlot.findFirst({
              where: { listingId: activeListing.id, status: "AVAILABLE" },
              select: { id: true },
            })
            if (availableSlot) {
              await tx.breedingSlot.update({ where: { id: availableSlot.id }, data: { status: "USED" } })
            }
          }
        }

        const breedingRecord = await tx.breedingRecord.create({
          data: {
            gameId: offer.gameId,
            sireId: offer.sireId,
            damId: offer.damId,
            sireSnapshot: { animalId: offer.sireId, name: sire.name, breedId: sire.breedId, breedName: sire.breed?.name ?? "" },
            damSnapshot: { animalId: offer.damId, name: dam.name, breedId: dam.breedId, breedName: dam.breed?.name ?? "" },
          },
          select: { id: true },
        })

        function parentQuality(a: typeof sire): number {
          const topTier = a.compTiers[0]
          const isCross = a.breedComposition.length > 1
          const healthLoci = a.genotypes.filter((g) =>
            g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
          )
          const trainedStatAvgRatio =
            a.stats.length > 0 && gameConfig.trainingCeilingMultiplier
              ? a.stats.reduce((sum, s) => {
                  const cap = s.innateValue * gameConfig.trainingCeilingMultiplier
                  return sum + Math.min((s.trainedValue ?? 0) / cap, 1)
                }, 0) / a.stats.length
              : 0
          const hasTopSportTier = a.compTiers
            .filter((t) => !t.disciplineDef.isConformation)
            .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
          const hasTopConformationTier = a.compTiers
            .filter((t) => t.disciplineDef.isConformation)
            .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
          return computeBreedingQuality({
            careScore: a.careScore?.score ?? 0,
            compTier: topTier
              ? {
                  tierIndex: topTier.tierDef.tierIndex,
                  maxTierIndex: topTier.disciplineDef.compTierDefs[0]?.tierIndex ?? topTier.tierDef.tierIndex,
                }
              : null,
            inbreedingCoefficient: a.inbreedingCoefficient,
            trainedStatAvgRatio,
            conformationAvg:
              !isCross && a.conformationScores.length > 0
                ? a.conformationScores.reduce((s, c) => s + c.score, 0) / a.conformationScores.length
                : null,
            healthTestedRatio: healthLoci.length > 0 ? healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length : null,
            activeConditions: a.healthRecords.filter((r) => r.isActive).length,
            hasTopSportTier,
            hasTopConformationTier,
          }).score
        }

        function flattenPersonality(animal: typeof sire) {
          return animal.personality.map(p => ({ traitDefId: p.traitDefId, value: p.value, labelRanges: p.traitDef.labelRanges }))
        }

        const breedAlleleFrequencies = await buildBreedFreqMap(sire.breedComposition, dam.breedComposition)

        const result = generateOffspring({
          sire: { ...sire, breedId: sire.breedId!, quality: parentQuality(sire), personality: flattenPersonality(sire) },
          dam: { ...dam, breedId: dam.breedId!, quality: parentQuality(dam), personality: flattenPersonality(dam) },
          damCareScore: damCareScore?.score ?? 100,
          gameConfig,
          gameInnateMax: gameInnateMax ?? { maxTotalInnate: 2000, averageTotalInnate: 1000 },
          gradeBreedId: gradeBread?.id ?? sire.breedId!,
          breedAlleleFrequencies,
        })

        if (!result.conceived) {
          await tx.animalDailyLog.create({
            data: {
              animalId: offer.damId,
              cycleNumber: dam.ageInCycles,
              eventType: "COVER_ACCEPTED",
              partnerAnimalId: offer.sireId,
              outcome: "NOT_CONCEIVED",
              ...(offer.price > 0 ? { context: { price: offer.price } } : {}),
            },
          })
          await tx.animalDailyLog.create({
            data: {
              animalId: offer.sireId,
              cycleNumber: sire.ageInCycles,
              eventType: "COVER_ACCEPTED",
              partnerAnimalId: offer.damId,
              outcome: "NOT_CONCEIVED",
              ...(offer.price > 0 ? { context: { price: offer.price } } : {}),
            },
          })
          return { breedingRecordId: breedingRecord.id, conceived: false as const }
        }

        const pregnancy = await tx.pregnancy.create({
          data: {
            animalId: offer.damId,
            breedingRecordId: breedingRecord.id,
            requiredCycles: gameConfig.gestationCycles,
          },
          select: { id: true },
        })

        const lifeExpectancy =
          gradeBread?.lifeExpectancyBaseline ?? gameConfig.lifeExpectancyBaseline ?? 120
        const offspringGeneration = Math.max(sire.generation, dam.generation) + 1

        // Build ancestor map: take minimum depth when sire/dam share ancestors
        const ancestorEntries = new Map<string, number>([
          [offer.sireId, 1],
          [offer.damId, 1],
        ])
        for (const a of [...sire.ancestors, ...dam.ancestors]) {
          const d = a.depth + 1
          const existing = ancestorEntries.get(a.ancestorId)
          if (existing === undefined || d < existing) ancestorEntries.set(a.ancestorId, d)
        }

        for (const [i, offspring] of result.offspring.entries()) {
          const phenotypeDescription = computePhenotypeDescription(offspring.genotypes, expressionRules)
          const genotypeCodes = computePhenotypeCodes(offspring.genotypes, expressionRules)
          const { structuralRisk, preferredTerrain, preferredClimate } = await computeFixedFields(tx, offspring.genotypes)
          const animal = await tx.animal.create({
            data: {
              gameId: offer.gameId,
              playerAccountId: dam.playerAccountId,
              breederId: dam.playerAccountId,
              breedId: offspring.breedId,
              name: "Unnamed Foal",
              sex: offspring.sex,
              lifeStageId: firstLifeStage.id,
              generation: offspringGeneration,
              ageInCycles: 0,
              fertility: offspring.fertility,
              inbreedingCoefficient: offspring.inbreedingCoefficient,
              breedGeneration: offspring.breedGeneration,
              lifeExpectancy,
              status: "EMBRYO_STORED",
              phenotypeDescription,
              structuralRisk,
              preferredTerrain: preferredTerrain as any,
              preferredClimate: preferredClimate as any,
            },
            select: { id: true },
          })

          const personalityData = offspring.personality.map((p) => {
            const traitLabel = personalityLabelRanges.find(
              (r) => r.traitDefId === p.traitDefId && p.value >= r.minValue && p.value < r.maxValue
            )?.label ?? null
            return { animalId: animal.id, traitDefId: p.traitDefId, value: p.value, traitLabel }
          })

          await Promise.all([
            tx.animalEnergy.create({ data: { animalId: animal.id, currentEnergy: 100, maxEnergy: 100 } }),
            tx.animalMood.create({ data: { animalId: animal.id, value: 50 } }),
            tx.animalCondition.create({ data: { animalId: animal.id, value: 70 } }),
            tx.animalCareScore.create({ data: { animalId: animal.id, score: 100 } }),
            tx.animalImmunity.create({
              data: {
                animalId: animal.id,
                value: offspring.immunity.startingValue,
                innateMax: offspring.immunity.innateMax,
              },
            }),
            tx.animalStat.createMany({
              data: offspring.stats.map((s) => ({
                animalId: animal.id,
                statDefId: s.statDefId,
                innateValue: s.innateValue,
                trainedValue: 0,
              })),
            }),
            tx.animalGenotype.createMany({
              data: offspring.genotypes.map((g, idx) => ({
                animalId: animal.id,
                locusId: g.locusId,
                alleleOneId: g.alleleOneId,
                alleleTwoId: g.alleleTwoId,
                phenotypeCode: genotypeCodes[idx]?.phenotypeCode ?? null,
              })),
            }),
            tx.animalBreedComposition.createMany({
              data: offspring.breedComposition.map((c) => ({
                animalId: animal.id,
                breedId: c.breedId,
                percentage: c.percentage,
              })),
            }),
            tx.animalAncestor.createMany({
              data: Array.from(ancestorEntries.entries()).map(([ancestorId, depth]) => ({
                animalId: animal.id,
                ancestorId,
                depth,
              })),
            }),
            tx.pregnancyOffspring.create({
              data: { pregnancyId: pregnancy.id, animalId: animal.id, birthOrder: i + 1 },
            }),
            ...(personalityData.length > 0
              ? [tx.animalPersonality.createMany({ data: personalityData })]
              : []),
          ])
        }

        await tx.animalDailyLog.create({
          data: {
            animalId: offer.damId,
            cycleNumber: dam.ageInCycles,
            eventType: "COVER_ACCEPTED",
            partnerAnimalId: offer.sireId,
            outcome: "CONCEIVED",
            ...(offer.price > 0 ? { context: { price: offer.price } } : {}),
          },
        })
        await tx.animalDailyLog.create({
          data: {
            animalId: offer.sireId,
            cycleNumber: sire.ageInCycles,
            eventType: "COVER_ACCEPTED",
            partnerAnimalId: offer.damId,
            outcome: "CONCEIVED",
            ...(offer.price > 0 ? { context: { price: offer.price } } : {}),
          },
        })

        return {
          breedingRecordId: breedingRecord.id,
          conceived: true as const,
          pregnancyId: pregnancy.id,
          offspringCount: result.offspring.length,
          requiredCycles: gameConfig.gestationCycles,
        }
      })
    }),

  decline: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      const offer = await db.coverOffer.findUniqueOrThrow({
        where: { id: input.offerId },
        select: { status: true, sireId: true, damId: true },
      })
      if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")

      const [sireAnimal, damAnimal] = await Promise.all([
        db.animal.findUnique({ where: { id: offer.sireId }, select: { ageInCycles: true } }),
        db.animal.findUnique({ where: { id: offer.damId }, select: { ageInCycles: true } }),
      ])

      await db.animalDailyLog.createMany({
        data: [
          {
            animalId: offer.sireId,
            cycleNumber: sireAnimal?.ageInCycles ?? 0,
            eventType: "COVER_DECLINED",
            partnerAnimalId: offer.damId,
          },
          {
            animalId: offer.damId,
            cycleNumber: damAnimal?.ageInCycles ?? 0,
            eventType: "COVER_DECLINED",
            partnerAnimalId: offer.sireId,
          },
        ],
      })

      return db.coverOffer.update({
        where: { id: input.offerId },
        data: { status: "DECLINED" },
      })
    }),

  previewPair: publicProcedure
    .input(z.object({
      sireId: z.string(),
      damId: z.string(),
      playerAccountId: z.string(),
      gameId: z.string(),
    }))
    .query(async ({ input }) => {
      const [sire, dam, gameConfig] = await Promise.all([
        db.animal.findUniqueOrThrow({ where: { id: input.sireId }, select: breedingDisplaySelect }),
        db.animal.findUniqueOrThrow({ where: { id: input.damId }, select: breedingDisplaySelect }),
        db.gameConfig.findFirst({
          where: { gameId: input.gameId },
          select: { trainingCeilingMultiplier: true, predictorDailyLimitFree: true, predictorCost: true },
        }),
      ])

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const predictorUsage = await db.playerPredictorUsage.findUnique({
        where: {
          playerAccountId_gameId_date: { playerAccountId: input.playerAccountId, gameId: input.gameId, date: today },
        },
        select: { usageCount: true },
      })

      const ctp = gameConfig?.trainingCeilingMultiplier ?? 1
      const base = (sire.fertility * 100 + dam.fertility * 100 + (sire.mood?.value ?? 50) + (dam.mood?.value ?? 50)) / 4
      const personalityOffset = [...sire.personality, ...dam.personality].reduce((acc, p) => {
        const range = p.traitDef.labelRanges.find(r => p.value >= r.minValue && p.value <= r.maxValue)
        return acc + (range?.conceptionModifier ?? 0)
      }, 0)

      return {
        sire,
        dam,
        sireGrade: computeAnimalGrade(sire, ctp),
        damGrade: computeAnimalGrade(dam, ctp),
        offspringCOI: computeCOI(sire.id, sire.inbreedingCoefficient, sire.ancestors, dam.id, dam.inbreedingCoefficient, dam.ancestors),
        conceptionChance: Math.round(Math.max(10, Math.min(100, base + personalityOffset))),
        predictorQuota: {
          used: predictorUsage?.usageCount ?? 0,
          limit: gameConfig?.predictorDailyLimitFree ?? 0,
          cost: gameConfig?.predictorCost ?? 0,
        },
      }
    }),

  getForBreeding: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .query(async ({ input }) => {
      const [offer, gameConfig] = await Promise.all([
        db.coverOffer.findUniqueOrThrow({
          where: { id: input.offerId },
          select: {
            id: true,
            status: true,
            price: true,
            gameId: true,
            sire: { select: breedingDisplaySelect },
            dam: { select: breedingDisplaySelect },
          },
        }),
        db.gameConfig.findFirst({
          where: { game: { coverOffers: { some: { id: input.offerId } } } },
          select: { trainingCeilingMultiplier: true, predictorDailyLimitFree: true, predictorCost: true },
        }),
      ])

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const predictorUsage = await db.playerPredictorUsage.findUnique({
        where: {
          playerAccountId_gameId_date: {
            playerAccountId: offer.dam.playerAccount.id,
            gameId: offer.gameId,
            date: today,
          },
        },
        select: { usageCount: true },
      })

      const ctp = gameConfig?.trainingCeilingMultiplier ?? 1
      const base =
        (offer.sire.fertility * 100 + offer.dam.fertility * 100 +
          (offer.sire.mood?.value ?? 50) + (offer.dam.mood?.value ?? 50)) / 4
      const personalityOffset = [...offer.sire.personality, ...offer.dam.personality].reduce((acc, p) => {
        const range = p.traitDef.labelRanges.find(r => p.value >= r.minValue && p.value <= r.maxValue)
        return acc + (range?.conceptionModifier ?? 0)
      }, 0)
      const conceptionChance = Math.max(10, Math.min(100, base + personalityOffset))
      const offspringCOI = computeCOI(offer.sire.id, offer.sire.inbreedingCoefficient, offer.sire.ancestors, offer.dam.id, offer.dam.inbreedingCoefficient, offer.dam.ancestors)

      return {
        ...offer,
        conceptionChance: Math.round(conceptionChance),
        offspringCOI,
        sireGrade: computeAnimalGrade(offer.sire, ctp),
        damGrade: computeAnimalGrade(offer.dam, ctp),
        predictorQuota: {
          used: predictorUsage?.usageCount ?? 0,
          limit: gameConfig?.predictorDailyLimitFree ?? 0,
          cost: gameConfig?.predictorCost ?? 0,
        },
      }
    }),

  runPredictor: publicProcedure
    .input(z.union([
      z.object({ offerId: z.string() }),
      z.object({ sireId: z.string(), damId: z.string(), playerAccountId: z.string(), gameId: z.string() }),
    ]))
    .mutation(async ({ input }) => {
      let resolvedSireId: string, resolvedDamId: string, resolvedGameId: string

      if ("offerId" in input) {
        const offerBase = await db.coverOffer.findUniqueOrThrow({
          where: { id: input.offerId },
          select: { status: true, gameId: true, sireId: true, damId: true },
        })
        if (offerBase.status !== "PENDING") throw new Error("Offer is no longer pending")
        resolvedSireId = offerBase.sireId
        resolvedDamId = offerBase.damId
        resolvedGameId = offerBase.gameId
      } else {
        resolvedSireId = input.sireId
        resolvedDamId = input.damId
        resolvedGameId = input.gameId
      }

      const [sire, dam, gameConfig, gameInnateMax, gradeBreed, statDefs] = await Promise.all([
        db.animal.findUniqueOrThrow({ where: { id: resolvedSireId }, select: parentSelect }),
        db.animal.findUniqueOrThrow({ where: { id: resolvedDamId }, select: parentSelect }),
        db.gameConfig.findUniqueOrThrow({
          where: { gameId: resolvedGameId },
          select: { ...gameConfigBreedingSelect, predictorCost: true, predictorDailyLimitFree: true },
        }),
        db.gameInnateMax.findFirst({
          where: { gameId: resolvedGameId },
          select: { maxTotalInnate: true, averageTotalInnate: true },
        }),
        db.breed.findFirst({
          where: { gameId: resolvedGameId, isUnregistered: true },
          select: { id: true, name: true },
        }),
        db.statDef.findMany({
          where: { gameId: resolvedGameId },
          select: { id: true, name: true },
        }),
      ])

      const playerAccountId = "playerAccountId" in input ? input.playerAccountId : dam.playerAccountId
      const dailyLimit = gameConfig.predictorDailyLimitFree
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      if (dailyLimit > 0) {
        const usage = await db.playerPredictorUsage.findUnique({
          where: {
            playerAccountId_gameId_date: {
              playerAccountId,
              gameId: resolvedGameId,
              date: today,
            },
          },
          select: { usageCount: true },
        })
        if ((usage?.usageCount ?? 0) >= dailyLimit) {
          throw new Error(`Daily predictor limit reached (${dailyLimit} per day)`)
        }
      }

      if (gameConfig.predictorCost > 0) {
        const coverService = await db.vetServiceDef.findFirst({
          where: { gameId: resolvedGameId, serviceType: "NATURAL_COVER" },
          select: { currencyDefId: true },
        })
        if (coverService?.currencyDefId) {
          await db.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId,
                currencyDefId: coverService.currencyDefId,
              },
            },
            data: { balance: { decrement: gameConfig.predictorCost } },
          })
        }
      }

      const newUsage = await db.playerPredictorUsage.upsert({
        where: {
          playerAccountId_gameId_date: {
            playerAccountId,
            gameId: resolvedGameId,
            date: today,
          },
        },
        create: { playerAccountId, gameId: resolvedGameId, date: today, usageCount: 1 },
        update: { usageCount: { increment: 1 } },
        select: { usageCount: true },
      })

      function parentQuality(a: typeof sire): number {
        const topTier = a.compTiers[0]
        const isCross = a.breedComposition.length > 1
        const healthLoci = a.genotypes.filter((g) =>
          g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
        )
        const trainedStatAvgRatio =
          a.stats.length > 0
            ? a.stats.reduce((sum, s) => {
                const cap = s.innateValue * gameConfig.trainingCeilingMultiplier
                return sum + Math.min((s.trainedValue ?? 0) / cap, 1)
              }, 0) / a.stats.length
            : 0
        const hasTopSportTier = a.compTiers
          .filter((t) => !t.disciplineDef.isConformation)
          .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
        const hasTopConformationTier = a.compTiers
          .filter((t) => t.disciplineDef.isConformation)
          .some((t) => t.tierDef.tierIndex >= (t.disciplineDef.compTierDefs[0]?.tierIndex ?? t.tierDef.tierIndex))
        return computeBreedingQuality({
          careScore: a.careScore?.score ?? 0,
          compTier: topTier
            ? {
                tierIndex: topTier.tierDef.tierIndex,
                maxTierIndex: topTier.disciplineDef.compTierDefs[0]?.tierIndex ?? topTier.tierDef.tierIndex,
              }
            : null,
          inbreedingCoefficient: a.inbreedingCoefficient,
          trainedStatAvgRatio,
          conformationAvg:
            !isCross && a.conformationScores.length > 0
              ? a.conformationScores.reduce((s, c) => s + c.score, 0) / a.conformationScores.length
              : null,
          healthTestedRatio:
            healthLoci.length > 0
              ? healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length
              : null,
          activeConditions: a.healthRecords.filter((r) => r.isActive).length,
          hasTopSportTier,
          hasTopConformationTier,
        }).score
      }

      function flattenP(a: typeof sire) {
        return a.personality.map(p => ({ traitDefId: p.traitDefId, value: p.value, labelRanges: p.traitDef.labelRanges }))
      }

      const breedAlleleFrequencies = await buildBreedFreqMap(sire.breedComposition, dam.breedComposition)

      const result = generateOffspring({
        sire: { ...sire, breedId: sire.breedId!, quality: parentQuality(sire), personality: flattenP(sire) },
        dam: { ...dam, breedId: dam.breedId!, quality: parentQuality(dam), personality: flattenP(dam) },
        damCareScore: dam.careScore?.score ?? 100,
        gameConfig,
        gameInnateMax: gameInnateMax ?? { maxTotalInnate: 2000, averageTotalInnate: 1000 },
        gradeBreedId: gradeBreed?.id ?? sire.breedId!,
        skipConceptionRoll: true,
        breedAlleleFrequencies,
      })

      if (!result.conceived) throw new Error("Predictor failed unexpectedly")

      const statNameMap = new Map(statDefs.map((s) => [s.id, s.name]))
      const breedNameMap = new Map<string, string>([
        ...(sire.breedId ? [[sire.breedId, sire.breed?.name ?? ""] as [string, string]] : []),
        ...(dam.breedId ? [[dam.breedId, dam.breed?.name ?? ""] as [string, string]] : []),
        ...(gradeBreed ? ([[gradeBreed.id, gradeBreed.name]] as [string, string][]) : []),
      ])

      return {
        offspring: result.offspring.slice(0, 1).map((o) => ({
          sex: o.sex,
          breedName: breedNameMap.get(o.breedId) ?? "Unknown",
          fertility: o.fertility,
          inbreedingCoefficient: o.inbreedingCoefficient,
          stats: o.stats.map((s) => ({
            name: statNameMap.get(s.statDefId) ?? s.statDefId,
            innateValue: s.innateValue,
          })),
          statTotal: o.stats.reduce((sum, s) => sum + s.innateValue, 0),
          immunityMax: o.immunity.innateMax,
        })),
        quotaUsed: newUsage.usageCount,
        quotaLimit: dailyLimit,
        cost: gameConfig.predictorCost,
      }
    }),
})
