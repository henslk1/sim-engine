import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { canTransitionTutorial, TUTORIAL_STEPS } from "../tutorial-policy.js"
import { router, protectedProcedure } from "../trpc.js"
import { db, AnimalSex } from "@sim-engine/db"
import { generateFromTemplate, weightedSample, canonicalize, deleteAnimalsWithChildren, computeFixedFields, computePhenotypeDescription } from "@sim-engine/engine"
import type { ExpressionRuleForPhenotype } from "@sim-engine/engine"

export const tutorialRouter = router({
  // The server owns the active Driver.js index. Older accounts import their
  // browser checkpoint once; subsequent requests must follow the step graph.
  setDriverStep: protectedProcedure
    .input(z.object({ gameId: z.string(), step: z.number().int().min(0).max(TUTORIAL_STEPS.length - 1) }))
    .mutation(async ({ ctx, input }) => {
      const seniority = await db.playerSeniority.findFirstOrThrow({
        where: { playerAccount: { userId: ctx.userId, gameId: input.gameId } },
      })
      if (seniority.tutorialCompleted) throw new TRPCError({ code: "FORBIDDEN" })
      if (seniority.tutorialDriverStep !== null && !canTransitionTutorial(seniority.tutorialDriverStep, input.step)) {
        throw new TRPCError({ code: "CONFLICT", message: "Tutorial progress changed. Continue from the dashboard." })
      }
      const result = await db.playerSeniority.updateMany({
        where: { id: seniority.id, tutorialDriverStep: seniority.tutorialDriverStep },
        data: { tutorialDriverStep: input.step },
      })
      if (!result.count) throw new TRPCError({ code: "CONFLICT", message: "Tutorial progress changed. Continue from the dashboard." })
    }),

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
                breedId: true, breedName: true, sex: true, name: true, lore: true,
                fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true, isTestedByOwner: true } },
                personalityValues: { select: { traitDefId: true, value: true } },
              },
            },
            tutorialMaleTemplate: {
              select: {
                breedId: true, breedName: true, sex: true, name: true, lore: true,
                fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true, isTestedByOwner: true } },
                personalityValues: { select: { traitDefId: true, value: true } },
              },
            },
          },
        }),
        seniority.starterColorOptionId
          ? db.starterColorOption.findUnique({
              where: { id: seniority.starterColorOptionId },
              select: { name: true, genotypes: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } } },
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

      if (existingPair) return
      if (!starterOption?.tutorialFemaleTemplate || !starterOption.tutorialMaleTemplate) {
        throw new Error("Tutorial templates not configured")
      }
      if (!gameAccount) throw new Error("Game account not found")

      const breedId = starterOption.breedId

      // Batch 3
      const [breedWeights, breedPersonalityProfiles, breedImmunity, gameConfigForGen, breedAlleleFreqs, gameInnateMaxRecord] = await Promise.all([
        db.breedStatProfile.findMany({ where: { breedId }, select: { statDefId: true, weight: true } }),
        db.breedPersonalityProfile.findMany({ where: { breedId }, select: { traitDefId: true, naturalMin: true, naturalMax: true } }),
        db.breed.findUnique({ where: { id: breedId }, select: { immunityMin: true, immunityMax: true, lifeExpectancyBaseline: true } }),
        db.gameConfig.findUnique({
          where: { gameId },
          select: {
            lifeExpectancyBaseline: true,
            defaultInnateRatio: true,
            tutorialMaleBaseTemplate: {
              select: {
                sex: true, fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true, isTestedByOwner: true } },
                personalityValues: { select: { traitDefId: true, value: true } },
              },
            },
            tutorialFemaleBaseTemplate: {
              select: {
                sex: true, fertility: true, startingAgeInCycles: true,
                statMode: true, statFloor: true,
                personalityMode: true, personalityMin: true, personalityMax: true,
                stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
                compTiers: { select: { disciplineDefId: true, tier: true } },
                genotype: { select: { locusId: true, alleleOneId: true, alleleTwoId: true, isTestedByOwner: true } },
                personalityValues: { select: { traitDefId: true, value: true } },
              },
            },
          },
        }),
        db.breedAlleleFrequency.findMany({
          where: { breedId },
          select: { alleleId: true, frequency: true, allele: { select: { locusId: true } } },
        }),
        db.gameInnateMax.findUnique({ where: { gameId }, select: { maxTotalInnate: true, averageTotalInnate: true } }),
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
      const maleBase = gameConfigForGen?.tutorialMaleBaseTemplate ?? null
      const femaleBase = gameConfigForGen?.tutorialFemaleBaseTemplate ?? null

      function mergeTemplate<T extends typeof femaleTpl>(base: typeof femaleBase, tpl: T) {
        const tplGenotypeLoci = new Set(tpl.genotype.map(g => g.locusId))
        return {
          breedId: tpl.breedId,
          breedName: tpl.breedName,
          name: tpl.name,
          lore: tpl.lore ?? null,
          sex: tpl.sex,
          fertility: tpl.fertility ?? base?.fertility ?? null,
          startingAgeInCycles: tpl.startingAgeInCycles ?? base?.startingAgeInCycles ?? null,
          statMode: tpl.statMode,
          statFloor: tpl.statFloor ?? base?.statFloor ?? null,
          personalityMode: tpl.personalityMode,
          personalityMin: tpl.personalityMin ?? base?.personalityMin ?? null,
          personalityMax: tpl.personalityMax ?? base?.personalityMax ?? null,
          stats: Array.from(
            new Map([
              ...(base?.stats ?? []).map(s => [s.statDefId, s] as const),
              ...(tpl.stats ?? []).map(s => [s.statDefId, s] as const),
            ]).values()
          ),
          compTiers: tpl.compTiers?.length ? tpl.compTiers : (base?.compTiers ?? []),
          personalityValues: tpl.personalityValues?.length ? tpl.personalityValues : (base?.personalityValues ?? []),
          genotype: [
            ...tpl.genotype,
            ...(base?.genotype ?? []).filter(g => !tplGenotypeLoci.has(g.locusId)),
          ],
        }
      }

      const sharedOpts = {
        gameId,
        isTutorialAnimal: true as const,
        ownerPlayerAccountId: gameAccount.id,
        breederId: gameAccount.id,
        byLocus,
        breedWeights,
        defaultInnateRatio: gameConfigForGen?.defaultInnateRatio ?? 0.5,
        gameInnateMax: gameInnateMaxRecord?.maxTotalInnate ?? null,
        breedPersonalityProfiles,
        immunityMin: breedImmunity?.immunityMin ?? null,
        immunityMax: breedImmunity?.immunityMax ?? null,
        lifeExpectancyBaseline: breedImmunity?.lifeExpectancyBaseline ?? null,
        gameConfigLifeExpectancyBaseline: gameConfigForGen?.lifeExpectancyBaseline ?? null,
        ltcDefs,
        lifeStages,
        compTierLookup,
      }

      // Pre-fetch equipment requirements for the tutorial female so we can equip her at setup.
      const mergedFemaleTpl = mergeTemplate(femaleBase, femaleTpl)
      const femaleDiscId = mergedFemaleTpl.compTiers[0]?.disciplineDefId ?? null
      const femaleEquipReqs = femaleDiscId
        ? await db.disciplineEquipmentRequirement.findMany({
            where: { disciplineDefId: femaleDiscId },
            select: { itemDefId: true },
          })
        : []

      return await db.$transaction(async (tx) => {
        // 1. Female ancestor (owned by game account)
        const femaleId = await generateFromTemplate(tx, {
          ...sharedOpts,
          template: mergedFemaleTpl,
        })

        if (femaleEquipReqs.length > 0) {
          await tx.animalEquipment.createMany({
            data: femaleEquipReqs.map(r => ({
              animalId: femaleId,
              itemDefId: r.itemDefId,
              slot: r.itemDefId,
            })),
            skipDuplicates: true,
          })
        }

        // 2. Male ancestor (owned by game account) + stud listing
        const maleId = await generateFromTemplate(tx, {
          ...sharedOpts,
          template: mergeTemplate(maleBase, maleTpl),
        })
        await tx.breedingListing.create({
          data: { gameId, ownerPlayerId: gameAccount.id, animalId: maleId, pricePerSlot: 0, isActive: true },
        })

        // 3. Embryo (starter animal)
        const colorGenotypes = colorOption?.genotypes ?? []
        const forcedLociSet = new Set(colorGenotypes.map(r => r.locusId))
        const embryoGenotypes: { locusId: string; alleleOneId: string; alleleTwoId: string }[] = [
          ...colorGenotypes,
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
        const embryoLifeExpectancy = breedImmunity?.lifeExpectancyBaseline ?? gameConfigForGen?.lifeExpectancyBaseline ?? null

        const [{ structuralRisk, preferredTerrain, preferredClimate }, embryoPhenotypeRulesRaw] = await Promise.all([
          computeFixedFields(tx, embryoGenotypes),
          embryoGenotypes.length > 0
            ? tx.expressionRule.findMany({
                where: {
                  OR: embryoGenotypes.map(g => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId })),
                },
                select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
              })
            : Promise.resolve([]),
        ])
        const embryoPhenotypeDescription = computePhenotypeDescription(
          embryoGenotypes,
          embryoPhenotypeRulesRaw.filter((r): r is ExpressionRuleForPhenotype => r.phenotype !== null),
        )

        const embryo = await tx.animal.create({
          data: {
            gameId,
            playerAccountId: player.id,
            breederId: player.id,
            breedId,
            breedName: null,
            lifeStageId: embryoLifeStage.id,
            sex: embryoSex,
            name: `${starterOption.breed.name} ${embryoSex === "MALE" ? "Colt" : "Filly"}`,
            fertility: femaleBase?.fertility ?? maleBase?.fertility ?? 1,
            ageInCycles: 0,
            status: "EMBRYO_STORED",
            inbreedingCoefficient: 0,
            breedGeneration: 1,
            lifeExpectancy: embryoLifeExpectancy,
            isTutorialAnimal: false,
            phenotypeDescription: embryoPhenotypeDescription,
            structuralRisk,
            preferredTerrain: preferredTerrain as any,
            preferredClimate: preferredClimate as any,
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
          ...(() => {
            const totalW = breedWeights.reduce((s, w) => s + w.weight, 0) || 1
            // Use averageTotalInnate — embryo is a foundation-quality animal, not an exceptional one
            const pool = (gameConfigForGen?.defaultInnateRatio ?? 0.5) * (gameInnateMaxRecord?.averageTotalInnate ?? gameInnateMaxRecord?.maxTotalInnate ?? 100)
            return breedWeights.map(sp =>
              tx.animalStat.create({
                data: {
                  animalId: embryo.id,
                  statDefId: sp.statDefId,
                  innateValue: pool * (sp.weight / totalW),
                  trainedValue: 0,
                },
              })
            )
          })(),
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
          // LTC records are NOT created here — the embryo goes through the normal birth system
          // (breeding.pregnancy birth handler) which creates them when status changes to ALIVE.
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

  completeStep: protectedProcedure
    .input(z.object({ gameId: z.string(), stepKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, stepKey } = input

      const [player, stepDef] = await Promise.all([
        db.playerAccount.findUnique({
          where: { userId_gameId: { userId: ctx.userId, gameId } },
          select: { id: true },
        }),
        db.tutorialStepDef.findUnique({
          where: { gameId_stepKey: { gameId, stepKey } },
          select: { id: true },
        }),
      ])

      if (!player) throw new Error("Player not found")
      if (!stepDef) throw new Error("Step not found")

      await db.tutorialProgress.update({
        where: { playerAccountId_stepDefId: { playerAccountId: player.id, stepDefId: stepDef.id } },
        data: { completedAt: new Date() },
      })

      if (stepKey === "tutorial_complete") {
        const pair = await db.tutorialAnimalPair.findUnique({
          where: { playerAccountId: player.id },
          select: { ancestorOneId: true, ancestorTwoId: true },
        })

        if (pair) {
          // Delete ancestors + breeding listing
          await Promise.all([
            db.tutorialAnimalPair.delete({ where: { playerAccountId: player.id } }),
            db.breedingListing.deleteMany({ where: { animalId: pair.ancestorTwoId } }),
          ])
          await deleteAnimalsWithChildren([pair.ancestorOneId, pair.ancestorTwoId])
        }

        await db.playerSeniority.update({
          where: { playerAccountId: player.id },
          data: { tutorialCompleted: true },
        })
      }
    }),

  pairIds: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return null
      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOneId: true, ancestorTwoId: true },
      })
      return pair ?? null
    }),

  requiredEquipmentItemIds: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return null

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOne: { select: { secondaryDisciplineDefId: true } } },
      })

      const secondaryDiscId = pair?.ancestorOne?.secondaryDisciplineDefId
      if (!secondaryDiscId) return null

      const disc = await db.disciplineDef.findUnique({
        where: { id: secondaryDiscId },
        select: { equipmentRequirements: { select: { itemDefId: true } } },
      })

      return disc?.equipmentRequirements.map((r) => r.itemDefId) ?? null
    }),

  shopAnimal: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return null

      const [pair, config] = await Promise.all([
        db.tutorialAnimalPair.findUnique({
          where: { playerAccountId: player.id },
          select: {
            ancestorOne: {
              select: {
                id: true,
                name: true,
                sex: true,
                playerAccountId: true,
                breed: { select: { name: true } },
                breedName: true,
                lifeStage: { select: { name: true } },
              },
            },
          },
        }),
        db.gameConfig.findUnique({
          where: { gameId: input.gameId },
          select: { tutorialFemalePrice: true },
        }),
      ])

      // Return null once the player has purchased her (ownership transferred)
      if (!pair?.ancestorOne || pair.ancestorOne.playerAccountId === player.id) return null

      return { ...pair.ancestorOne, price: config?.tutorialFemalePrice ?? 0 }
    }),

  grantStartingGold: protectedProcedure
    .input(z.object({ gameId: z.string(), amount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, amount } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const baseCurrency = await db.currencyDef.findFirst({
        where: { gameId, currencyType: "BASE" },
        select: { id: true },
      })
      if (!baseCurrency) throw new Error("No base currency configured")

      // Guard: each distinct grant amount can only be claimed once.
      const alreadyGranted = await db.transaction.findFirst({
        where: { toPlayerAccountId: player.id, txnType: "TESTING_GRANT", amount },
        select: { id: true },
      })
      if (alreadyGranted) return

      await db.$transaction([
        db.playerBalance.upsert({
          where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrency.id } },
          create: { playerAccountId: player.id, currencyDefId: baseCurrency.id, balance: amount },
          update: { balance: { increment: amount } },
        }),
        db.transaction.create({
          data: {
            gameId,
            toPlayerAccountId: player.id,
            currencyDefId: baseCurrency.id,
            amount,
            txnType: "TESTING_GRANT",
          },
        }),
      ])
    }),

  // TODO: remove before launch
  devDeleteAccount: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      // Collect tutorial ancestor IDs before deleting the pair
      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOneId: true, ancestorTwoId: true },
      })

      // All player-owned animals
      const playerAnimals = await db.animal.findMany({
        where: { playerAccountId: player.id },
        select: { id: true },
      })
      // Tutorial ancestors are owned by the game account; collect from pair if it still exists,
      // then also sweep isTutorialAnimal=true non-player animals so retries still catch them
      const tutorialAncestorIds = [pair?.ancestorOneId, pair?.ancestorTwoId].filter((id): id is string => !!id)
      const orphanedTutorialAnimals = await db.animal.findMany({
        where: { gameId, isTutorialAnimal: true, NOT: { playerAccountId: player.id } },
        select: { id: true },
      })
      const allAnimalIds = [...new Set([
        ...playerAnimals.map(a => a.id),
        ...tutorialAncestorIds,
        ...orphanedTutorialAnimals.map(a => a.id),
      ])]

      // Tutorial records must be deleted before animals (embryoId FK is RESTRICT)
      await db.tutorialProgress.deleteMany({ where: { playerAccountId: player.id } })
      await db.tutorialAnimalPair.deleteMany({ where: { playerAccountId: player.id } })

      // Clear any breeding listings referencing these animals (game-account-owned stud listings
      // won't be caught by the ownerPlayerId delete below)
      if (allAnimalIds.length > 0) {
        await db.breedingListing.deleteMany({ where: { animalId: { in: allAnimalIds } } })
      }

      await deleteAnimalsWithChildren(allAnimalIds)

      // Social
      await db.follow.deleteMany({ where: { OR: [{ followerPlayerId: player.id }, { followedPlayerId: player.id }] } })
      await db.friendRequest.deleteMany({ where: { OR: [{ senderPlayerId: player.id }, { recipientPlayerId: player.id }] } })
      await db.blockedPlayer.deleteMany({ where: { OR: [{ blockerPlayerId: player.id }, { blockedPlayerId: player.id }] } })

      // Economy
      await db.transaction.deleteMany({ where: { OR: [{ fromPlayerAccountId: player.id }, { toPlayerAccountId: player.id }] } })
      await db.breedingListing.deleteMany({ where: { ownerPlayerId: player.id } })
      await db.playerBalance.deleteMany({ where: { playerAccountId: player.id } })

      await db.playerAchievement.deleteMany({ where: { playerAccountId: player.id } })

      // Account records (delete children before parent)
      await db.profileVisibilitySetting.deleteMany({ where: { playerAccountId: player.id } })
      await db.playerProfile.deleteMany({ where: { playerAccountId: player.id } })
      await db.playerSeniority.deleteMany({ where: { playerAccountId: player.id } })
      await db.playerReputation.deleteMany({ where: { playerAccountId: player.id } })
      await db.playerCapacity.deleteMany({ where: { playerAccountId: player.id } })
      await db.subContainer.deleteMany({ where: { playerAccountId: player.id } })

      await db.playerAccount.delete({ where: { id: player.id } })
    }),

  // TODO: remove before launch
  devReset: protectedProcedure
    .input(z.object({ gameId: z.string(), stepIndex: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, stepIndex } = input
      const phaseStart = stepIndex >= 56 ? 56 : stepIndex >= 49 ? 49 : stepIndex >= 20 ? 20 : stepIndex >= 10 ? 10 : stepIndex >= 5 ? 5 : 0
      await db.playerSeniority.updateMany({
        where: { playerAccount: { userId: ctx.userId, gameId } },
        data: { tutorialDriverStep: phaseStart },
      })

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOneId: true, ancestorOne: { select: { secondaryDisciplineDefId: true } } },
      })

      // Reset tutorial female's training and care state so the current step is replayable.
      if (pair?.ancestorOneId) {
        const femaleId = pair.ancestorOneId

        const trainingLogs = await db.trainingLog.findMany({
          where: { animalId: femaleId },
          select: { trainingActionDef: { select: { statDefId: true } }, statGained: true },
        })

        // Sum total gains per stat so we can decrement back to the pre-tutorial value.
        const gainByStatId = new Map<string, number>()
        for (const log of trainingLogs) {
          const sid = log.trainingActionDef.statDefId
          gainByStatId.set(sid, (gainByStatId.get(sid) ?? 0) + log.statGained)
        }

        await Promise.all([
          db.trainingLog.deleteMany({ where: { animalId: femaleId } }),
          db.careLog.deleteMany({ where: { animalId: femaleId } }),
          db.animalDailyLog.deleteMany({ where: { animalId: femaleId } }),
          ...[...gainByStatId.entries()].map(([statDefId, totalGained]) =>
            db.animalStat.updateMany({
              where: { animalId: femaleId, statDefId },
              data: { trainedValue: { decrement: totalGained } },
            })
          ),
          db.animalEnergy.updateMany({ where: { animalId: femaleId }, data: { currentEnergy: 100 } }),
          db.animalMood.updateMany({ where: { animalId: femaleId }, data: { value: 75 } }),
          db.animalCondition.updateMany({ where: { animalId: femaleId }, data: { value: 75 } }),
          db.animalCareScore.updateMany({ where: { animalId: femaleId }, data: { score: 75 } }),
          // Reset LTC records so the Perform buttons appear again.
          db.animalLongTermCareRecord.updateMany({
            where: { animalId: femaleId },
            data: { nextDueCycle: 0, lastPerformedCycle: null },
          }),
          // Competition phase reset: clear health certs so the vet step is replayable.
          ...(stepIndex >= 56 ? [
            db.healthCertificate.deleteMany({ where: { animalId: femaleId } }),
            db.animal.update({ where: { id: femaleId }, data: { secondaryDisciplineDefId: null } }),
            ...(pair.ancestorOne?.secondaryDisciplineDefId
              ? [db.animalCompetitionTier.deleteMany({ where: { animalId: femaleId, disciplineDefId: pair.ancestorOne.secondaryDisciplineDefId } })]
              : []),
          ] : []),
        ])
      }

      // Reset gold to the training-section base and clear the LTC grant transaction
      // so the step can fire cleanly on replay.
      const baseCurrency = await db.currencyDef.findFirst({
        where: { gameId, currencyType: "BASE" },
        select: { id: true },
      })
      await Promise.all([
        baseCurrency ? db.playerBalance.updateMany({
          where: { playerAccountId: player.id, currencyDefId: baseCurrency.id },
          data: { balance: 100 },
        }) : Promise.resolve(),
        db.transaction.deleteMany({
          where: { toPlayerAccountId: player.id, txnType: "TESTING_GRANT", amount: 100 },
        }),
      ])

      // Restore checkpoint progress to match the current step position.
      // Each entry: [firstStepIndexOfNextPhase, stepKey]
      const CHECKPOINTS: [number, string][] = [
        [5,  "step_shop"],
        [10, "step_purchased"],
        [20, "step_mare_profile"],
        [49, "step_training_intro"],
        [50, "step_training_free"],
        [52, "step_care_day2"],
        [53, "step_training_guarded"],
        [54, "step_day2_retire"],
        [55, "step_training_complete"],
        [56, "step_competition_transition"],
      ]
      const stepDefs = await db.tutorialStepDef.findMany({
        where: { gameId, stepKey: { in: CHECKPOINTS.map(([, k]) => k) } },
        select: { id: true, stepKey: true },
      })
      const now = new Date()
      await Promise.all(
        stepDefs.map(({ id: stepDefId, stepKey }) => {
          const threshold = CHECKPOINTS.find(([, k]) => k === stepKey)?.[0] ?? Infinity
          return db.tutorialProgress.update({
            where: { playerAccountId_stepDefId: { playerAccountId: player.id, stepDefId } },
            data: { completedAt: stepIndex >= threshold ? now : null },
          })
        })
      )
    }),

    buyFemale: protectedProcedure
    .input(z.object({ gameId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const { gameId } = input
    const player = await db.playerAccount.findUnique({
      where: { userId_gameId: { userId: ctx.userId, gameId } },
      select: { id: true },
    })
    if (!player) throw new Error("Player not found")

    const [pair, config] = await Promise.all([
      db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOneId: true },
      }),
      db.gameConfig.findUnique({
        where: { gameId },
        select: { tutorialFemalePrice: true },
      }),
    ])
    if (!pair) throw new Error("Tutorial not active")

    const price = config?.tutorialFemalePrice ?? 0

    if (price > 0) {
      const baseCurrency = await db.currencyDef.findFirst({
        where: { gameId, currencyType: "BASE" },
        select: { id: true },
      })
      if (!baseCurrency) throw new Error("No base currency configured")

      await db.$transaction([
        db.animal.update({ where: { id: pair.ancestorOneId }, data: { playerAccountId: player.id } }),
        db.playerBalance.update({
          where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrency.id } },
          data: { balance: { decrement: price } },
        }),
        db.transaction.create({
          data: {
            gameId,
            fromPlayerAccountId: player.id,
            currencyDefId: baseCurrency.id,
            amount: price,
            txnType: "STORE_PURCHASE",
          },
        }),
      ])
    } else {
      await db.animal.update({
        where: { id: pair.ancestorOneId },
        data: { playerAccountId: player.id },
      })
    }
  }),

  // TODO: remove before launch
  // Patches a player account whose starter selection was never stored (created before that
  // code existed). Sets the first available StarterBreedOption + StarterColorOption on their
  // PlayerSeniority so tutorial.setup can run successfully.
  devFixStarter: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const seniority = await db.playerSeniority.findUnique({
        where: { playerAccountId: player.id },
        select: { starterBreedOptionId: true },
      })
      if (!seniority) throw new Error("Seniority record not found")
      if (seniority.starterBreedOptionId) throw new Error("Starter already set — no fix needed")

      const breedOption = await db.starterBreedOption.findFirst({
        where: { gameId },
        select: { id: true, colorOptions: { select: { id: true }, take: 1 } },
      })
      if (!breedOption) throw new Error("No StarterBreedOption configured for this game")

      await db.playerSeniority.update({
        where: { playerAccountId: player.id },
        data: {
          starterBreedOptionId: breedOption.id,
          starterColorOptionId: breedOption.colorOptions[0]?.id ?? null,
          starterGender: "FEMALE",
        },
      })
    }),

  // Returns the tutorial sire for the tutorial-only stud market view.
  // Normal stud market filters isTutorialAnimal=false, so this is the only way to surface it.
  studAnimal: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      if (!player) return null

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: {
          ancestorTwoId: true,
          ancestorTwo: {
            select: {
              id: true,
              name: true,
              sex: true,
              breedName: true,
              ageInCycles: true,
              fertility: true,
              breed: { select: { name: true } },
              lifeStage: { select: { name: true } },
            },
          },
        },
      })

      return pair?.ancestorTwo ?? null
    }),

  grantStartingPremium: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const premiumCurrency = await db.currencyDef.findFirst({
        where: { gameId, currencyType: "PREMIUM" },
        select: { id: true },
      })
      if (!premiumCurrency) throw new Error("No premium currency configured")

      const AMOUNT = 2

      const existing = await db.playerBalance.findUnique({
        where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: premiumCurrency.id } },
        select: { id: true, balance: true },
      })
      if (existing && existing.balance > 0) return

      await db.$transaction([
        existing
          ? db.playerBalance.update({
              where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: premiumCurrency.id } },
              data: { balance: AMOUNT },
            })
          : db.playerBalance.create({
              data: { playerAccountId: player.id, currencyDefId: premiumCurrency.id, balance: AMOUNT },
            }),
        db.transaction.create({
          data: {
            gameId,
            toPlayerAccountId: player.id,
            currencyDefId: premiumCurrency.id,
            amount: AMOUNT,
            txnType: "TESTING_GRANT",
          },
        }),
      ])
    }),

  // Generates a predictor result for the tutorial using the player's starter breed stats.
  // Tutorial ancestors are historical models, not genetically compatible with starter breeds,
  // so we use the breed stat profile + pool math directly instead of generateOffspring.
  // No quota consumed, no cost charged.
  runPredictor: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const seniority = await db.playerSeniority.findUnique({
        where: { playerAccountId: player.id },
        select: { starterBreedOptionId: true },
      })
      if (!seniority?.starterBreedOptionId) throw new Error("Starter breed not configured")

      const [starterOption, gameConfig, gameInnateMax, statDefs] = await Promise.all([
        db.starterBreedOption.findUnique({
          where: { id: seniority.starterBreedOptionId },
          select: {
            breedId: true,
            breed: { select: { name: true, immunityMin: true, immunityMax: true } },
          },
        }),
        db.gameConfig.findUnique({
          where: { gameId },
          select: { defaultInnateRatio: true },
        }),
        db.gameInnateMax.findUnique({
          where: { gameId },
          select: { maxTotalInnate: true, averageTotalInnate: true },
        }),
        db.statDef.findMany({ where: { gameId }, select: { id: true, name: true } }),
      ])
      if (!starterOption) throw new Error("Starter breed option not found")

      const breedWeights = await db.breedStatProfile.findMany({
        where: { breedId: starterOption.breedId },
        select: { statDefId: true, weight: true },
      })

      const totalW = breedWeights.reduce((s, w) => s + w.weight, 0) || 1
      const pool = (gameConfig?.defaultInnateRatio ?? 0.5) * (gameInnateMax?.averageTotalInnate ?? gameInnateMax?.maxTotalInnate ?? 100)

      const statNameMap = new Map(statDefs.map((s) => [s.id, s.name]))
      const stats = breedWeights.map((sp) => ({
        name: statNameMap.get(sp.statDefId) ?? sp.statDefId,
        innateValue: pool * (sp.weight / totalW),
      }))

      const immunityMid = ((starterOption.breed.immunityMin ?? 40) + (starterOption.breed.immunityMax ?? 80)) / 2
      const sex: "MALE" | "FEMALE" = Math.random() < 0.5 ? "MALE" : "FEMALE"

      return {
        offspring: [{
          sex,
          breedName: starterOption.breed.name,
          fertility: 1,
          inbreedingCoefficient: 0,
          stats,
          statTotal: stats.reduce((sum, s) => sum + s.innateValue, 0),
          immunityMax: immunityMid,
        }],
        quotaUsed: 0,
        quotaLimit: 0,
        cost: 0,
      }
    }),
})
