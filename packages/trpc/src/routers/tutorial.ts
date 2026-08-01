import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db, AnimalSex } from "@sim-engine/db"
import { generateFromTemplate, weightedSample, canonicalize } from "@sim-engine/engine"

export const tutorialRouter = router({
  getProgress: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const steps = await db.tutorialStepDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { stepIndex: "asc" },
        select: { id: true, stepKey: true, name: true, description: true, stepIndex: true },
      })
      if (!player) return { steps, progress: [] }
      const progress = await db.tutorialProgress.findMany({
        where: { playerAccountId: player.id },
        select: { stepDefId: true, completedAt: true },
      })
      return { steps, progress }
    }),

  setup: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      // Batch 1
      const [player, seniority] = await Promise.all([
        db.playerAccount.findUnique({
          where: { userId_gameId: { userId: ctx.userId, gameId } },
          select: { id: true },
        }),
        db.playerSeniority.findFirst({
          where: { playerAccount: { userId: ctx.userId, gameId } },
          select: { starterBreedOptionId: true, starterColorOptionId: true, starterGender: true },
        }),
      ])

      if (!player) throw new Error("Player not found")
      if (!seniority?.starterBreedOptionId) throw new Error("Starter breed not selected")
      
      // Batch 2
      const [
        existingPair, 
        starterOption,
        colorOption,
        allLoci,
        ltcDefs,
        lifeStages,
        compTierDefs,
        gameAccount,
      ] = await Promise.all([
        db.tutorialAnimalPair.findUnique({ where: { playerAccountId: player.id } }),
        db.starterBreedOption.findUnique({
          where: { id: seniority.starterBreedOptionId },
          select: {
            breedId: true,
            breed: { select: { name: true } },
            tutorialFemaleTemplate: {
              select: {
                breedId: true, breedName: true, sex: true, name: true,
                fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
              },
            },
            tutorialMaleTemplate: {
              select: {
                breedId: true, breedName: true, sex: true, name: true,
                fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
              },
            },
          },
        }),
        seniority.starterColorOptionId
          ? db.starterColorOption.findUnique({
              where: { id: seniority.starterColorOptionId },
              select: { name: true },
            })
          : Promise.resolve(null),
          db.locus.findMany({
            where: { gameId },
            select: { id: true, alleles: { select: { id: true, symbol: true } } },
          }),
          db.longTermCareActionDef.findMany({ where: { gameId }, select: { id: true, intervalCycles: true } }),
          db.lifeStageDef.findMany({ where: { gameId }, select: { id: true, minCycle: true, stageIndex: true } }),
          db.competitionTierDef.findMany({ where: { gameId }, select: { id: true, disciplineDefId: true, tierIndex: true } }),
          db.playerAccount.findFirst({ where: { gameId }, select: { id: true } }),
      ])

      if (existingPair) throw new Error("Tutorial already set up")
      if (!starterOption?.tutorialFemaleTemplate || !starterOption.tutorialMaleTemplate) {
        throw new Error("Tutorial templates not configured")
      }
      if (!gameAccount) throw new Error("Game account not found")

      const breedId = starterOption.breedId

      // Batch 3
      const [breedStatProfile, breedPersonalityProfiles, breedAlleleFreqs, colorExpressionRules] = await Promise.all([
        db.breedStatProfile.findMany({ where: { breedId }, select: { statDefId: true, naturalMin: true, naturalMax: true } }),
        db.breedPersonalityProfile.findMany({ where: { breedId }, select: { traitDefId: true, naturalMin: true, naturalMax: true } }),
        db.breedAlleleFrequency.findMany({
          where: { breedId },
          select: { alleleId: true, frequency: true, allele: { select: { locusId: true } } },
        }),
        colorOption
          ? db.expressionRule.findMany({
              where: { phenotype: colorOption.name },
              select: { locusId: true, alleleOneId: true, alleleTwoId: true },
            })
          : Promise.resolve([]),
      ])

      // Build compTierLookup
      const compTierLookup = new Map<string, string>()
      for (const ct of compTierDefs) {
        compTierLookup.set(`${ct.disciplineDefId}:${ct.tierIndex}`, ct.id)
      }

      // Build byLocus: breed frequencies where available, equal weight otherwise
      const freqByLocusAllele = new Map<string, Map<string, number>>()
      for (const freq of breedAlleleFreqs) {
        const locusId = freq.allele.locusId
        if (!freqByLocusAllele.has(locusId)) freqByLocusAllele.set(locusId, new Map())
        freqByLocusAllele.get(locusId)!.set(freq.alleleId, freq.frequency)
      }
      const byLocus = new Map<string, { id: string; symbol: string; frequency: number }[]>()
      for (const locus of allLoci) {
        const locusFreqs = freqByLocusAllele.get(locus.id)
        byLocus.set(locus.id, locus.alleles.map(a => ({
          id: a.id,
          symbol: a.symbol,
          frequency: locusFreqs?.get(a.id) ?? 1,
        })))
      }

      const femaleTpl = starterOption.tutorialFemaleTemplate
      const maleTpl = starterOption.tutorialMaleTemplate

      const sharedOpts = {
        gameId,
        isTutorialAnimal: true as const,
        ownerPlayerAccountId: gameAccount.id,
        byLocus,
        breedStatProfile,
        breedPersonalityProfiles,
        ltcDefs,
        lifeStages,
        compTierLookup,
      }

      return await db.$transaction(async (tx) => {
        // 1. Female ancestor (owned by game account)
        const femaleId = await generateFromTemplate(tx, {
          ...sharedOpts,
          template: {
            breedId: femaleTpl.breedId,
            breedName: femaleTpl.breedName,
            sex: femaleTpl.sex,
            name: femaleTpl.name,
            fertility: femaleTpl.fertility,
            startingAgeInCycles: femaleTpl.startingAgeInCycles,
            statMode: femaleTpl.statMode,
            statFloor: femaleTpl.statFloor,
            personalityMode: femaleTpl.personalityMode,
            personalityMin: femaleTpl.personalityMin,
            personalityMax: femaleTpl.personalityMax,
            stats: femaleTpl.stats,
            compTiers: femaleTpl.compTiers,
            genotype: femaleTpl.genotype,
          },
        })

        // 2. Male ancestor (owned by game account) + stud listing
        const maleId = await generateFromTemplate(tx, {
          ...sharedOpts,
          template: {
            breedId: maleTpl.breedId,
            breedName: maleTpl.breedName,
            sex: maleTpl.sex,
            name: maleTpl.name,
            fertility: maleTpl.fertility,
            startingAgeInCycles: maleTpl.startingAgeInCycles,
            statMode: maleTpl.statMode,
            statFloor: maleTpl.statFloor,
            personalityMode: maleTpl.personalityMode,
            personalityMin: maleTpl.personalityMin,
            personalityMax: maleTpl.personalityMax,
            stats: maleTpl.stats,
            compTiers: maleTpl.compTiers,
            genotype: maleTpl.genotype,
          },
        })
        await tx.breedingListing.create({
          data: { gameId, ownerPlayerId: gameAccount.id, animalId: maleId, pricePerSlot: 0, isActive: true },
        })

        // 3. Embryo (starter animal)
        const forcedLociSet = new Set(colorExpressionRules.map(r => r.locusId))
        const embryoGenotypes: { locusId: string; alleleOneId: string; alleleTwoId: string }[] = [
          ...colorExpressionRules,
        ]
        for (const [locusId, alleles] of byLocus) {
          if (forcedLociSet.has(locusId) || alleles.length === 0) continue
          const a = weightedSample(alleles)
          const b = weightedSample(alleles)
          const [alleleOneId, alleleTwoId] = canonicalize(a, b)
          embryoGenotypes.push({ locusId, alleleOneId, alleleTwoId })
        }

        const embryoSex: AnimalSex = seniority.starterGender === "MALE" ? "MALE" : "FEMALE"
        const sortedStages = [...lifeStages].sort((a, b) => a.stageIndex - b.stageIndex)
        const embryoLifeStage = sortedStages[0]!

        const embryo = await tx.animal.create({
          data: {
            gameId,
            playerAccountId: player.id,
            breedId,
            breedName: null,
            lifeStageId: embryoLifeStage.id,
            sex: embryoSex,
            name: `${starterOption.breed.name} ${embryoSex === "MALE" ? "Colt" : "Filly"}`,
            fertility: Math.random(),
            ageInCycles: 0,
            status: "EMBRYO_STORED",
            inbreedingCoefficient: 0,
            breedGeneration: 1,
            isTutorialAnimal: false,
          },
          select: { id: true },
        })

        await Promise.all([
          tx.animalEnergy.create({ data: { animalId: embryo.id, currentEnergy: 100, maxEnergy: 100 } }),
          tx.animalMood.create({ data: { animalId: embryo.id, value: 75 } }),
          tx.animalCondition.create({ data: { animalId: embryo.id, value: 75 } }),
          tx.animalImmunity.create({ data: { animalId: embryo.id, value: 60, innateMax: 100 } }),
          tx.animalCareScore.create({ data: { animalId: embryo.id, score: 75 } }),
          tx.animalBreedComposition.create({ data: { animalId: embryo.id, breedId, percentage: 1.0 } }),
          ...breedStatProfile.map(sp =>
            tx.animalStat.create({
              data: {
                animalId: embryo.id,
                statDefId: sp.statDefId,
                innateValue: sp.naturalMin + Math.random() * (sp.naturalMax - sp.naturalMin),
                trainedValue: 0,
              },
            })
          ),
          ...breedPersonalityProfiles.map(pp =>
            tx.animalPersonality.create({
              data: {
                animalId: embryo.id,
                traitDefId: pp.traitDefId,
                value: pp.naturalMin + Math.random() * (pp.naturalMax - pp.naturalMin),
              },
            })
          ),
          ...embryoGenotypes.map(g =>
            tx.animalGenotype.create({
              data: { animalId: embryo.id, locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId },
            })
          ),
          ...ltcDefs.map(def =>
            tx.animalLongTermCareRecord.create({
              data: { animalId: embryo.id, longTermCareActionDefId: def.id, nextDueCycle: def.intervalCycles },
            })
          ),
        ])

        // 4. TutorialAnimalPair
        await tx.tutorialAnimalPair.create({
          data: { playerAccountId: player.id, ancestorOneId: femaleId, ancestorTwoId: maleId, embryoId: embryo.id },
        })

        // 5. TutorialProgress — one record per step def, all uncompleted
        const stepDefs = await tx.tutorialStepDef.findMany({ where: { gameId }, select: { id: true } })
        await tx.tutorialProgress.createMany({
          data: stepDefs.map(s => ({ playerAccountId: player.id, stepDefId: s.id, completedAt: null })),
        })

        return { embryoId: embryo.id }
      })
    }),
})