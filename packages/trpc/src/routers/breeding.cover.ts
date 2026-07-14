import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { generateOffspring } from "@sim-engine/engine"

const eligibleFemaleSelect = {
  id: true,
  name: true,
  ageInCycles: true,
  breed: { select: { id: true, name: true } },
  lifeStage: { select: { name: true } },
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
  }
}

const parentSelect = {
  id: true,
  name: true,
  generation: true,
  playerAccountId: true,
  breedId: true,
  breed: { select: { name: true } },
  fertility: true,
  inbreedingCoefficient: true,
  breedGeneration: true,
  stats: { select: { statDefId: true, innateValue: true } },
  energy: { select: { currentEnergy: true } },
  mood: { select: { value: true } },
  personality: {
    select: {
      value: true,
      traitDef: { select: { conceptionModifier: true } },
    },
  },
  genotypes: {
    select: {
      locusId: true,
      alleleOneId: true,
      alleleTwoId: true,
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
  multiplesBirthCap: true,
  multiplesChance: true,
  identicalMultiplesChance: true,
  gestationCycles: true,
  lifeExpectancyBaseline: true,
  breedingEnergyCost: true,
} as const

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
    }))
    .mutation(async ({ input }) => {
      const [sire, dam] = await Promise.all([
        db.animal.findUniqueOrThrow({
          where: { id: input.sireId },
          select: {
            sex: true, gameId: true,
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
          },
        }),
      ])

      if (sire.sex !== "MALE") throw new Error("Sire must be male")
      if (dam.sex !== "FEMALE") throw new Error("Dam must be female")
      if (sire.isCastrated) throw new Error("Sire is castrated")
      if (!sire.lifeStage.canBreed) throw new Error("Sire cannot breed at this life stage")
      if (!dam.lifeStage.canBreed) throw new Error("Dam cannot breed at this life stage")
      if (sire.gameId !== dam.gameId) throw new Error("Animals must be in the same game")

      const energyCost = sire.game.gameConfig?.breedingEnergyCost ?? 0
      if (energyCost > 0) {
        if ((sire.energy?.currentEnergy ?? 0) < energyCost)
          throw new Error("Sire does not have enough energy to send a cover offer")
        await db.animalEnergy.update({
          where: { animalId: input.sireId },
          data: { currentEnergy: { decrement: energyCost } },
        })
      }

      return db.coverOffer.create({
        data: {
          gameId: sire.gameId,
          sireId: input.sireId,
          damId: input.damId,
          price: input.price,
        },
        select: { id: true, status: true },
      })
    }),

  accept: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const offer = await tx.coverOffer.findUniqueOrThrow({
          where: { id: input.offerId },
          select: { status: true, gameId: true, sireId: true, damId: true, price: true },
        })

        if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")

        const activePregnancy = await tx.pregnancy.count({
          where: { animalId: offer.damId, isCompleted: false },
        })
        if (activePregnancy > 0) throw new Error("Dam is already pregnant")

        const [sire, dam, gameConfig, gameInnateMax, gradeBread, firstLifeStage, damCareScore] =
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

        const breedingRecord = await tx.breedingRecord.create({
          data: {
            gameId: offer.gameId,
            sireId: offer.sireId,
            damId: offer.damId,
            sireSnapshot: { animalId: offer.sireId, name: sire.name, breedId: sire.breedId, breedName: sire.breed.name },
            damSnapshot: { animalId: offer.damId, name: dam.name, breedId: dam.breedId, breedName: dam.breed.name },
          },
          select: { id: true },
        })

        const result = generateOffspring({
          sire,
          dam,
          damCareScore: damCareScore?.score ?? 100,
          gameConfig,
          gameInnateMax: gameInnateMax ?? { maxTotalInnate: 2000, averageTotalInnate: 1000 },
          gradeBreedId: gradeBread?.id ?? sire.breedId,
        })

        if (!result.conceived) {
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
            },
            select: { id: true },
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
              data: offspring.genotypes.map((g) => ({
                animalId: animal.id,
                locusId: g.locusId,
                alleleOneId: g.alleleOneId,
                alleleTwoId: g.alleleTwoId,
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
          ])
        }

        return {
          breedingRecordId: breedingRecord.id,
          conceived: true as const,
          pregnancyId: pregnancy.id,
          offspringCount: result.offspring.length,
        }
      })
    }),

  decline: publicProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ input }) => {
      const offer = await db.coverOffer.findUniqueOrThrow({
        where: { id: input.offerId },
        select: { status: true },
      })
      if (offer.status !== "PENDING") throw new Error("Offer is no longer pending")
      return db.coverOffer.update({
        where: { id: input.offerId },
        data: { status: "DECLINED" },
      })
    }),
})
