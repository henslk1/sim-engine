import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { canTransitionTutorial, TUTORIAL_STEPS } from "../tutorial-policy.js"
import { router, protectedProcedure } from "../trpc.js"
import { db, AnimalSex } from "@sim-engine/db"
import { generateFromTemplate, weightedSample, canonicalize, deleteAnimalsWithChildren, computeFixedFields, computePhenotypeDescription, enterCompetition, runCompetition } from "@sim-engine/engine"
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

      if (existingPair) {
        const [listing, activePregnancy] = await Promise.all([
          db.breedingListing.findFirst({
            where: { animalId: existingPair.ancestorTwoId },
            select: { id: true, isActive: true, slots: { where: { status: "AVAILABLE" }, select: { id: true }, take: 1 } },
          }),
          db.pregnancy.findFirst({
            where: { animalId: existingPair.ancestorOneId, isCompleted: false },
            select: { id: true },
          }),
        ])
        // Older tutorial pairs were created before the breeding phase existed
        // and may have a listing with no usable slot. Repair it idempotently
        // while the mare has not yet been bred.
        if (listing && !activePregnancy) {
          await db.$transaction([
            ...(!listing.isActive
              ? [db.breedingListing.update({ where: { id: listing.id }, data: { isActive: true } })]
              : []),
            ...(listing.slots.length === 0
              ? [db.breedingSlot.create({ data: { listingId: listing.id, status: "AVAILABLE" } })]
              : []),
          ])
        }
        return
      }
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
          data: {
            gameId,
            ownerPlayerId: gameAccount.id,
            animalId: maleId,
            pricePerSlot: 0,
            isActive: true,
            slots: { create: { status: "AVAILABLE" } },
          },
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
      // Optional admin milestones may lag behind the Driver.js tutorial. Its
      // persisted index remains authoritative; unknown milestone keys still fail.
      if (!stepDef && stepKey !== "tutorial_complete") {
        if (TUTORIAL_STEPS.some(step => step.checkpoint === stepKey)) return
        throw new Error("Step not found")
      }

      if (stepKey === "tutorial_complete") {
        await db.$transaction([
          ...(stepDef ? [db.tutorialProgress.upsert({
            where: { playerAccountId_stepDefId: { playerAccountId: player.id, stepDefId: stepDef.id } },
            create: { playerAccountId: player.id, stepDefId: stepDef.id, completedAt: new Date() },
            update: { completedAt: new Date() },
          })] : []),
          db.playerSeniority.update({
            where: { playerAccountId: player.id },
            data: { tutorialCompleted: true },
          }),
        ])

        try {
          const pair = await db.tutorialAnimalPair.findUnique({
            where: { playerAccountId: player.id },
            select: { ancestorOneId: true, ancestorTwoId: true },
          })

          if (pair) {
            // Completion itself is already committed. Remove simulation-only
            // ancestors as best-effort cleanup without trapping the player in
            // a completed tutorial if cleanup encounters stale data.
            // deleteAnimalsWithChildren clears the stud listing (and every other
            // breeding record from the tutorial pairing) itself before deleting
            // the animals — every player breeds with this same stallion, so this
            // path runs for every completed tutorial, not just an edge case.
            await db.tutorialAnimalPair.delete({ where: { playerAccountId: player.id } })
            await deleteAnimalsWithChildren([pair.ancestorOneId, pair.ancestorTwoId])
          }
        } catch (error) {
          console.error("Tutorial ancestor cleanup failed", error)
        }
        return
      }

      await db.tutorialProgress.upsert({
        where: { playerAccountId_stepDefId: { playerAccountId: player.id, stepDefId: stepDef!.id } },
        create: { playerAccountId: player.id, stepDefId: stepDef!.id, completedAt: new Date() },
        update: { completedAt: new Date() },
      })
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
        select: { ancestorOneId: true, ancestorTwoId: true, embryoId: true },
      })
      return pair ?? null
    }),

  requiredEquipmentItemIds: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true, seniority: { select: { tutorialDriverStep: true } } },
      })
      if (!player) return null

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: {
          ancestorOne: { select: { secondaryDisciplineDefId: true } },
          embryo: { select: { disciplineDefId: true } },
        },
      })

      const disciplineDefId = (player.seniority?.tutorialDriverStep ?? 0) >= 164
        ? pair?.embryo?.disciplineDefId
        : pair?.ancestorOne?.secondaryDisciplineDefId
      if (!disciplineDefId) return null

      const disc = await db.disciplineDef.findUnique({
        where: { id: disciplineDefId },
        select: { equipmentRequirements: { select: { itemDefId: true } } },
      })

      return disc?.equipmentRequirements.map((r) => r.itemDefId) ?? null
    }),

  shopAnimal: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true, seniority: { select: { tutorialDriverStep: true } } },
      })
      if (!player) return null
      // Once the foal phase begins the mare has already been bought, shown off, and
      // returned to her breeder (step 163) — she's not "for sale" again just because
      // her ownership moved off the player. Without this, the shop stays locked into
      // buy-the-mare-only mode (shopListings === []) for the rest of the tutorial.
      if ((player.seniority?.tutorialDriverStep ?? 0) >= 164) return null

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
        select: { id: true, seniority: { select: { tutorialDriverStep: true } } },
      })
      if (!player) throw new Error("Player not found")

      const baseCurrency = await db.currencyDef.findFirst({
        where: { gameId, currencyType: "BASE" },
        select: { id: true },
      })
      if (!baseCurrency) throw new Error("No base currency configured")

      const driverStep = player.seniority?.tutorialDriverStep
      if (driverStep == null || TUTORIAL_STEPS[driverStep]?.gold !== amount) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }
      // Identify the grant by its step, since care and competition both give 100G.
      // Count old transactions too so migrated accounts cannot claim them again.
      const grantId = `tutorial-grant:${player.id}:${driverStep}`
      const [sameGrant, previousGrants] = await Promise.all([
        db.transaction.findUnique({ where: { id: grantId }, select: { id: true } }),
        db.transaction.count({
        where: { toPlayerAccountId: player.id, txnType: "TESTING_GRANT", amount },
        }),
      ])
      const grantOrdinal = TUTORIAL_STEPS.slice(0, driverStep + 1).filter(step => step.gold === amount).length
      if (sameGrant || previousGrants >= grantOrdinal) return

      try { await db.$transaction([
        db.playerBalance.upsert({
          where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrency.id } },
          create: { playerAccountId: player.id, currencyDefId: baseCurrency.id, balance: amount },
          update: { balance: { increment: amount } },
        }),
        db.transaction.create({
          data: {
            id: grantId,
            gameId,
            toPlayerAccountId: player.id,
            currencyDefId: baseCurrency.id,
            amount,
            txnType: "TESTING_GRANT",
          },
        }),
      ]) } catch (error) {
        // Another tab may have claimed the same step while this request waited.
        if (!await db.transaction.findUnique({ where: { id: grantId }, select: { id: true } })) throw error
      }
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

      // Breeding listings/slots/records/cover offers/pregnancies referencing these
      // animals (e.g. game-account-owned stud listings, which won't be caught by
      // the ownerPlayerId delete below) are cleared by deleteAnimalsWithChildren
      // itself, in FK-safe order, before it removes the animals.

      // Tutorial competitions reference the mare via a RESTRICT FK — delete before animals.
      const tutorialComps = await db.competition.findMany({
        where: { tutorialPlayerAccountId: player.id },
        select: { id: true, entries: { select: { id: true } } },
      })
      const tutorialEntryIds = tutorialComps.flatMap(c => c.entries.map(e => e.id))
      const tutorialCompIds = tutorialComps.map(c => c.id)
      if (tutorialEntryIds.length > 0) {
        await db.competitionResult.deleteMany({ where: { entryId: { in: tutorialEntryIds } } })
        await db.competitionEntry.deleteMany({ where: { id: { in: tutorialEntryIds } } })
      }
      if (tutorialCompIds.length > 0) {
        await db.competition.deleteMany({ where: { id: { in: tutorialCompIds } } })
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

      await db.playerInventory.deleteMany({ where: { playerAccountId: player.id } })
      await db.playerAccount.delete({ where: { id: player.id } })
    }),

  // TODO: remove before launch
  devReset: protectedProcedure
    .input(z.object({ gameId: z.string(), stepIndex: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, stepIndex } = input
      // Venue-phase replay only removes the generated tutorial competition.
      // Earlier care, training, certificates, equipment, and mare state stay put.
      if (stepIndex >= 81) {
        const player = await db.playerAccount.findUnique({
          where: { userId_gameId: { userId: ctx.userId, gameId } },
          select: { id: true },
        })
        if (!player) throw new Error("Player not found")
        await db.$transaction(async tx => {
          const competitions = await tx.competition.findMany({
            where: { tutorialPlayerAccountId: player.id, gameId },
            select: { id: true, entries: { select: { id: true } } },
          })
          const competitionIds = competitions.map(c => c.id)
          const entryIds = competitions.flatMap(c => c.entries.map(e => e.id))
          if (entryIds.length) {
            await tx.competitionResult.deleteMany({ where: { entryId: { in: entryIds } } })
            await tx.competitionEntry.deleteMany({ where: { id: { in: entryIds } } })
          }
          if (competitionIds.length) {
            await tx.competition.deleteMany({ where: { id: { in: competitionIds } } })
          }
          await tx.playerSeniority.update({
            where: { playerAccountId: player.id },
            data: { tutorialDriverStep: 84 },
          })
        })
        return
      }
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
              ? [
                  db.animalCompetitionTier.deleteMany({ where: { animalId: femaleId, disciplineDefId: pair.ancestorOne.secondaryDisciplineDefId } }),
                  db.animalWeeklyPoints.deleteMany({ where: { animalId: femaleId, disciplineDefId: pair.ancestorOne.secondaryDisciplineDefId } }),
                ]
              : []),
          ] : []),
        ])
      }

      // Competition phase reset: delete any tutorial competitions (entries reference the mare via a RESTRICT FK).
      if (stepIndex >= 56) {
        const tutorialComps = await db.competition.findMany({
          where: { tutorialPlayerAccountId: player.id },
          select: { id: true, entries: { select: { id: true } } },
        })
        const entryIds = tutorialComps.flatMap(c => c.entries.map(e => e.id))
        const compIds = tutorialComps.map(c => c.id)
        if (entryIds.length > 0) {
          await db.competitionResult.deleteMany({ where: { entryId: { in: entryIds } } })
          await db.competitionEntry.deleteMany({ where: { id: { in: entryIds } } })
        }
        if (compIds.length > 0) {
          await db.competition.deleteMany({ where: { id: { in: compIds } } })
        }
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

      const AMOUNT = 3

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

  venueInfo: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true, seniority: { select: { tutorialDriverStep: true } }, tutorialAnimalPair: { select: { ancestorOneId: true } } },
      })
      if (!player?.tutorialAnimalPair) throw new TRPCError({ code: "NOT_FOUND" })
      const mare = await db.animal.findUniqueOrThrow({
        where: { id: player.tutorialAnimalPair.ancestorOneId },
        select: {
          preferredTerrain: true,
          preferredClimate: true,
          secondaryDisciplineDefId: true,
          compTiers: {
            select: {
              disciplineDefId: true,
              tierDef: { select: { id: true, name: true, tierIndex: true } },
            },
          },
        },
      })
      if (!mare.secondaryDisciplineDefId) throw new TRPCError({ code: "NOT_FOUND", message: "Mare has no secondary discipline" })
      const secondaryDiscipline = await db.disciplineDef.findUnique({
        where: { id: mare.secondaryDisciplineDefId },
        select: { id: true, name: true },
      })
      if (!secondaryDiscipline) throw new TRPCError({ code: "NOT_FOUND", message: "Secondary discipline not found" })
      const tier = mare.compTiers.find(t => t.disciplineDefId === mare.secondaryDisciplineDefId)
      const [priorCompetition, competitionStep] = await Promise.all([
        db.competition.findFirst({
          where: { tutorialPlayerAccountId: player.id },
          select: { id: true },
        }),
        db.tutorialStepDef.findFirst({
          where: { gameId: input.gameId, competitionNpcCount: { not: null } },
          orderBy: { stepIndex: "desc" },
          select: { competitionNpcCount: true },
        }),
      ])
      return {
        secondaryDisciplineId: secondaryDiscipline.id,
        secondaryDisciplineName: secondaryDiscipline.name,
        preferredTerrain: mare.preferredTerrain as string[],
        preferredClimate: mare.preferredClimate as string[],
        currentTier: tier?.tierDef ?? null,
        hasCompeted: !!priorCompetition && player.seniority?.tutorialDriverStep !== 96,
        isUnguidedPhase: player.seniority?.tutorialDriverStep === 96,
        competitionNpcCount: competitionStep?.competitionNpcCount ?? 4,
      }
    }),

  compete: protectedProcedure
    .input(z.object({ gameId: z.string(), venueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, venueId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true, seniority: { select: { tutorialDriverStep: true } } },
      })
      if (!player) throw new Error("Player not found")

      const isUnguidedPhase = player.seniority?.tutorialDriverStep === 96

      if (!isUnguidedPhase) {
        const priorCompetition = await db.competition.findFirst({
          where: { tutorialPlayerAccountId: player.id },
          select: { id: true },
        })
        if (priorCompetition) return { competitionId: priorCompetition.id, alreadyEntered: true }
      }

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: { ancestorOneId: true },
      })
      if (!pair) throw new Error("Tutorial not active")

      const mare = await db.animal.findUniqueOrThrow({
        where: { id: pair.ancestorOneId },
        select: {
          id: true,
          ageInCycles: true,
          secondaryDisciplineDefId: true,
          lifeStage: { select: { energyCostMultiplier: true } },
        },
      })
      if (!mare.secondaryDisciplineDefId) throw new Error("Mare has no secondary discipline")

      const [competitionStep, tierTargetStep] = await Promise.all([
        db.tutorialStepDef.findFirst({
          where: { gameId, competitionNpcCount: { not: null } },
          orderBy: { stepIndex: "desc" },
          select: { competitionNpcCount: true },
        }),
        db.tutorialStepDef.findFirst({
          where: { gameId, completionCondition: "COMPETITION_TIER" },
          orderBy: { stepIndex: "desc" },
          select: { completionTarget: true },
        }),
      ])
      if (isUnguidedPhase && tierTargetStep?.completionTarget == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set a competition tier completion target for the tutorial before continuing." })
      }

      const venue = await db.venue.findFirst({
        where: { id: venueId, gameId },
        select: { id: true, disciplines: { select: { disciplineDefId: true } } },
      })
      if (!venue) throw new Error("Venue not found in this game")
      if (!venue.disciplines.some(d => d.disciplineDefId === mare.secondaryDisciplineDefId)) {
        throw new Error("This venue does not host the mare's discipline")
      }

      const discipline = await db.disciplineDef.findUniqueOrThrow({
        where: { id: mare.secondaryDisciplineDefId },
        select: {
          id: true,
          name: true,
          statWeights: { select: { statDefId: true, weight: true, statDef: { select: { name: true } } } },
        },
      })

      let animalTier = await db.animalCompetitionTier.findUnique({
        where: { animalId_disciplineDefId: { animalId: mare.id, disciplineDefId: discipline.id } },
        include: {
          tierDef: { select: { id: true, tierIndex: true, advancementThreshold: true, energyCost: true, entryFee: true, name: true } },
        },
      })
      if (!animalTier) {
        const lowestTier = await db.competitionTierDef.findFirstOrThrow({
          where: { disciplineDefId: discipline.id },
          orderBy: { tierIndex: "asc" },
          select: { id: true, tierIndex: true, advancementThreshold: true, energyCost: true, entryFee: true, name: true },
        })
        animalTier = await db.animalCompetitionTier.create({
          data: { animalId: mare.id, disciplineDefId: discipline.id, tierDefId: lowestTier.id },
          include: {
            tierDef: { select: { id: true, tierIndex: true, advancementThreshold: true, energyCost: true, entryFee: true, name: true } },
          },
        })
      }

      const energyCost = animalTier.tierDef.energyCost * mare.lifeStage.energyCostMultiplier
      const energy = await db.animalEnergy.findUniqueOrThrow({ where: { animalId: mare.id } })

      // Daily care is the only way to regain energy within a cycle, so it is the
      // remedy for both energy guards below.
      const [careTotal, careDone] = isUnguidedPhase
        ? await Promise.all([
            db.careActionDef.count({ where: { gameId } }),
            db.careLog.count({ where: { animalId: mare.id, cycleNumber: mare.ageInCycles } }),
          ])
        : [0, 0]
      const careOutstanding = careTotal > 0 && careDone < careTotal

      if (energy.currentEnergy < energyCost) {
        if (careOutstanding) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Complete her daily care before entering another competition." })
        }
        throw new Error("Not enough energy to compete")
      }

      // Spending energy carries no penalty by itself — the cost lands when she
      // ages below the overwork threshold. So this only blocks once care has
      // been used up and the player has no remaining way to raise her energy.
      if (isUnguidedPhase && !careOutstanding) {
        const gameConfig = await db.gameConfig.findFirstOrThrow({ where: { gameId }, select: { overworkInjuryThreshold: true } })
        if (energy.currentEnergy - energyCost < gameConfig.overworkInjuryThreshold) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Your mare needs rest before competing again. Advance her age to restore energy." })
        }
      }

      const entryFee = animalTier.tierDef.entryFee
      let baseCurrencyId: string | null = null
      if (entryFee > 0) {
        const baseCurrency = await db.currencyDef.findFirst({ where: { gameId, currencyType: "BASE" }, select: { id: true } })
        if (!baseCurrency) throw new Error("No base currency configured")
        baseCurrencyId = baseCurrency.id
        const balance = await db.playerBalance.findUnique({
          where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrency.id } },
          select: { balance: true },
        })
        if (!balance || balance.balance < entryFee) throw new Error("Insufficient funds")
      }

      const statIds = discipline.statWeights.map(w => w.statDefId)
      const mareStats = await db.animalStat.findMany({
        where: { animalId: mare.id, statDefId: { in: statIds } },
        select: { statDefId: true, trainedValue: true },
      })
      const mareStatMap = new Map(mareStats.map(s => [s.statDefId, s.trainedValue]))

      // Self-normalised: mare is the world max for tutorial purposes.
      const mareScore = Math.max(0,
        discipline.statWeights.reduce((sum, w) => {
          const val = mareStatMap.get(w.statDefId) ?? 0
          return sum + w.weight * (val / Math.max(val, 1))
        }, 0) * 100,
      )

      const npcCount = competitionStep?.competitionNpcCount ?? 4
      const npcEntries = Array.from({ length: npcCount }, (_, i) => {
        const npcStats = discipline.statWeights.map(w => {
          const mareVal = Math.max(mareStatMap.get(w.statDefId) ?? 0, 1)
          const val = Math.random() * mareVal * 0.5
          return { statDefId: w.statDefId, statName: w.statDef.name, trainedValue: Math.round(val * 100) / 100 }
        })
        const npcScore = Math.max(0,
          discipline.statWeights.reduce((sum, w) => {
            const stat = npcStats.find(s => s.statDefId === w.statDefId)!
            const mareVal = Math.max(mareStatMap.get(w.statDefId) ?? 0, 1)
            return sum + w.weight * (stat.trainedValue / mareVal)
          }, 0) * 100,
        )
        return { name: `Competitor ${i + 1}`, stats: npcStats, score: Math.round(npcScore * 100) / 100, placement: i + 2 }
      })

      // Monday-based UTC week, matching the engine's own bucketing in competition/run.ts.
      const weekStartOf = (date: Date) => {
        const day = date.getUTCDay()
        const start = new Date(date)
        start.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
        start.setUTCHours(0, 0, 0, 0)
        return start
      }

      const now = new Date()
      const weekStart = weekStartOf(now)

      return db.$transaction(async (tx) => {
        // Seed 3 historical competition results so comp history tab looks populated.
        // Guard with an existence check so repeated unguided-phase calls don't duplicate them.
        const existingHistoricalCount = await tx.competition.count({
          where: { tutorialPlayerAccountId: player.id, status: "COMPLETED" },
        })
        const historicalVariants = [
          { daysAgo: 21, placement: 2, scoreMult: 0.88 },
          { daysAgo: 14, placement: 1, scoreMult: 0.94 },
          { daysAgo: 7,  placement: 3, scoreMult: 0.91 },
        ]
        if (existingHistoricalCount === 0) for (const v of historicalVariants) {
          const pastDate = new Date(now.getTime() - v.daysAgo * 24 * 3600 * 1000)
          const histScore = Math.round(mareScore * v.scoreMult * 100) / 100
          // Each historical competition needs its own NPC field. Without one the
          // history tab counts a single entry, so a 2nd- or 3rd-place finish reads
          // as a placement in a field of one. Scores are scaled off the mare's own
          // result so the placements shown always agree with the scores shown.
          const histNpcEntries = Array.from({ length: npcCount }, (_, i) => {
            const placement = i + 1 < v.placement ? i + 1 : i + 2
            const stepsFromMare = placement - v.placement
            const factor = v.scoreMult * (stepsFromMare < 0
              ? 1 - stepsFromMare * 0.03   // finished ahead of her
              : 1 - stepsFromMare * 0.06)  // finished behind her
            const npcStats = discipline.statWeights.map(w => {
              const mareVal = Math.max(mareStatMap.get(w.statDefId) ?? 0, 1)
              return { statDefId: w.statDefId, statName: w.statDef.name, trainedValue: Math.round(mareVal * factor * 100) / 100 }
            })
            return {
              name: `Competitor ${i + 1}`,
              stats: npcStats,
              score: Math.round(mareScore * factor * 100) / 100,
              placement,
            }
          })
          const histComp = await tx.competition.create({
            data: {
              gameId,
              venueId: venue.id,
              disciplineDefId: discipline.id,
              tierDefId: animalTier!.tierDefId,
              name: `${discipline.name} — ${animalTier!.tierDef.name}`,
              maxEntries: npcCount + 1,
              maxWaitHours: 0,
              status: "COMPLETED",
              tutorialPlayerAccountId: player.id,
              tutorialNpcData: histNpcEntries,
              expiresAt: pastDate,
              createdAt: pastDate,
            },
          })
          const histEntry = await tx.competitionEntry.create({
            data: {
              competitionId: histComp.id,
              animalId: mare.id,
              playerAccountId: player.id,
              tierDefId: animalTier!.tierDefId,
              cycleNumber: mare.ageInCycles,
              enteredAt: pastDate,
            },
          })
          await tx.competitionResult.create({
            data: { entryId: histEntry.id, placement: v.placement, score: histScore },
          })
          // Past results have to land in the points ledger too, in their own week —
          // otherwise the weeks they belong to read as zero-point weeks.
          await tx.animalWeeklyPoints.upsert({
            where: {
              animalId_disciplineDefId_weekStart: {
                animalId: mare.id,
                disciplineDefId: discipline.id,
                weekStart: weekStartOf(pastDate),
              },
            },
            create: { animalId: mare.id, disciplineDefId: discipline.id, weekStart: weekStartOf(pastDate), points: histScore },
            update: { points: { increment: histScore } },
          })
        }

        const competition = await tx.competition.create({
          data: {
            gameId,
            venueId: venue.id,
            disciplineDefId: discipline.id,
            tierDefId: animalTier!.tierDefId,
            name: `${discipline.name} — ${animalTier!.tierDef.name}`,
            maxEntries: npcCount + 1,
            maxWaitHours: 0,
            status: "COMPLETED",
            tutorialPlayerAccountId: player.id,
            tutorialNpcData: npcEntries,
            expiresAt: now,
          },
        })

        const entry = await tx.competitionEntry.create({
          data: {
            competitionId: competition.id,
            animalId: mare.id,
            playerAccountId: player.id,
            tierDefId: animalTier!.tierDefId,
            cycleNumber: mare.ageInCycles,
          },
        })
        if (mareStats.length > 0) {
          await tx.competitionEntryStat.createMany({
            data: mareStats.map(s => ({ entryId: entry.id, statDefId: s.statDefId, trainedValue: s.trainedValue })),
          })
        }

        await tx.competitionResult.create({ data: { entryId: entry.id, placement: 1, score: mareScore } })

        await tx.animalEnergy.update({
          where: { animalId: mare.id },
          data: { currentEnergy: energy.currentEnergy - energyCost },
        })

        const gameConfig = await tx.gameConfig.findFirst({ where: { gameId }, select: { conditionWorkGain: true } })
        if (gameConfig && gameConfig.conditionWorkGain > 0) {
          const cond = await tx.animalCondition.findUnique({ where: { animalId: mare.id } })
          if (cond) {
            await tx.animalCondition.update({
              where: { animalId: mare.id },
              data: { value: Math.min(100, cond.value + gameConfig.conditionWorkGain) },
            })
          }
        }

        if (entryFee > 0 && baseCurrencyId) {
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrencyId } },
            data: { balance: { decrement: entryFee } },
          })
          await tx.transaction.create({
            data: { gameId, fromPlayerAccountId: player.id, currencyDefId: baseCurrencyId, amount: entryFee, txnType: "COMPETITION_ENTRY" },
          })
        }

        const prizes = await tx.competitionTierPrize.findMany({
          where: { tierDefId: animalTier!.tierDefId, placement: 1, isInvitational: false },
          select: { currencyDefId: true, amount: true },
        })
        const prizesAwarded: { amount: number; currencyDefId: string }[] = []
        for (const prize of prizes) {
          if (!prize.currencyDefId) continue
          await tx.playerBalance.upsert({
            where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: prize.currencyDefId } },
            create: { playerAccountId: player.id, currencyDefId: prize.currencyDefId, balance: prize.amount },
            update: { balance: { increment: prize.amount } },
          })
          await tx.transaction.create({
            data: { gameId, toPlayerAccountId: player.id, currencyDefId: prize.currencyDefId, amount: prize.amount, txnType: "PRIZE" },
          })
          prizesAwarded.push({ amount: prize.amount, currencyDefId: prize.currencyDefId })
        }

        await tx.animalWeeklyPoints.upsert({
          where: { animalId_disciplineDefId_weekStart: { animalId: mare.id, disciplineDefId: discipline.id, weekStart } },
          create: { animalId: mare.id, disciplineDefId: discipline.id, weekStart, points: mareScore },
          update: { points: { increment: mareScore } },
        })

        // Advancement runs on her career total in the discipline, not the weekly
        // bucket above — weekly points are for invitational eligibility and reset
        // every Monday, which would otherwise throw away tier progress mid-climb.
        const career = await tx.competitionResult.aggregate({
          _sum: { score: true },
          where: { entry: { animalId: mare.id, competition: { disciplineDefId: discipline.id } } },
        })
        const careerPoints = career._sum.score ?? 0

        let newTierIndex: number | null = null

        if (animalTier!.tierDef.advancementThreshold !== null && careerPoints >= animalTier!.tierDef.advancementThreshold) {
          const nextTier = await tx.competitionTierDef.findFirst({
            where: { disciplineDefId: discipline.id, tierIndex: { gt: animalTier!.tierDef.tierIndex } },
            orderBy: { tierIndex: "asc" },
            select: { id: true, name: true, tierIndex: true },
          })
          if (nextTier) {
            await tx.animalCompetitionTier.update({
              where: { animalId_disciplineDefId: { animalId: mare.id, disciplineDefId: discipline.id } },
              data: { tierDefId: nextTier.id },
            })
            await tx.animalDailyLog.create({
              data: {
                animalId: mare.id,
                cycleNumber: mare.ageInCycles ?? 0,
                eventType: "TIER_ADVANCED",
                context: { newTierName: nextTier.name, disciplineName: discipline.name },
              },
            })
            newTierIndex = nextTier.tierIndex
          }
        }

        // The first guided entry may already have reached the target tier.
        // Signal completion once the mare is at or beyond the configured target.
        const tutorialTierReached = isUnguidedPhase &&
          tierTargetStep?.completionTarget !== null &&
          tierTargetStep?.completionTarget !== undefined &&
          (newTierIndex ?? animalTier!.tierDef.tierIndex) >= tierTargetStep.completionTarget

        return {
          competitionId: competition.id,
          placement: 1,
          score: Math.round(mareScore * 100) / 100,
          npcEntries,
          advanced: tutorialTierReached,
          newTierIndex,
          disciplineName: discipline.name,
          prizesAwarded,
        }
      })
    }),

  returnMare: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const [pair, baseCurrency] = await Promise.all([
        db.tutorialAnimalPair.findUnique({
          where: { playerAccountId: player.id },
          select: { ancestorOneId: true, ancestorOne: { select: { breederId: true, playerAccountId: true } } },
        }),
        db.currencyDef.findFirst({ where: { gameId, currencyType: "BASE" }, select: { id: true } }),
      ])
      if (!pair) throw new TRPCError({ code: "FORBIDDEN", message: "Tutorial not active" })
      if (!baseCurrency) throw new Error("No base currency configured")
      if (!pair.ancestorOne.breederId) throw new Error("The tutorial mare has no return owner")
      if (pair.ancestorOne.playerAccountId !== player.id) throw new TRPCError({ code: "CONFLICT", message: "The tutorial mare has already been returned" })

      const RETURN_AMOUNT = 300
      const grantId = `tutorial-return-mare:${player.id}`
      const existing = await db.transaction.findUnique({ where: { id: grantId }, select: { id: true } })
      if (existing) return

      try {
        await db.$transaction([
          db.playerBalance.upsert({
            where: { playerAccountId_currencyDefId: { playerAccountId: player.id, currencyDefId: baseCurrency.id } },
            create: { playerAccountId: player.id, currencyDefId: baseCurrency.id, balance: RETURN_AMOUNT },
            update: { balance: { increment: RETURN_AMOUNT } },
          }),
          db.transaction.create({
            data: {
              id: grantId,
              gameId,
              toPlayerAccountId: player.id,
              currencyDefId: baseCurrency.id,
              amount: RETURN_AMOUNT,
              txnType: "TESTING_GRANT",
            },
          }),
          db.animal.update({
            where: { id: pair.ancestorOneId },
            data: { playerAccountId: pair.ancestorOne.breederId },
          }),
        ])
      } catch (error) {
        if (!await db.transaction.findUnique({ where: { id: grantId }, select: { id: true } })) throw error
      }
    }),

  foalAnimal: protectedProcedure
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
          embryo: {
            select: {
              id: true,
              name: true,
              ageInCycles: true,
              playerAccountId: true,
              status: true,
              disciplineDefId: true,
              disciplineDef: { select: { id: true, name: true } },
              preferredTerrain: true,
              preferredClimate: true,
              breed: { select: { id: true, name: true } },
              lifeStage: { select: { id: true, name: true, stageIndex: true } },
            },
          },
        },
      })
      return pair?.embryo.playerAccountId === player.id && pair.embryo.status === "ALIVE" ? pair.embryo : null
    }),

  foalVenueInfo: protectedProcedure
    .input(z.object({ gameId: z.string(), venueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { gameId, venueId } = input
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) return null

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: {
          embryo: {
            select: {
              playerAccountId: true,
              status: true,
              disciplineDefId: true,
              disciplineDef: { select: { id: true, name: true } },
              preferredTerrain: true,
              preferredClimate: true,
            },
          },
        },
      })
      const foal = pair?.embryo
      if (!foal || foal.playerAccountId !== player.id || foal.status !== "ALIVE" || !foal.disciplineDef) return null

      const [existing, venue, competitionStep] = await Promise.all([
        db.competition.findFirst({
          where: { tutorialPlayerAccountId: player.id, disciplineDefId: foal.disciplineDefId! },
          select: { id: true },
        }),
        db.venue.findFirst({ where: { id: venueId, gameId }, select: { terrain: true, climate: true } }),
        db.tutorialStepDef.findFirst({
          where: { gameId, competitionNpcCount: { not: null } },
          orderBy: { stepIndex: "desc" },
          select: { competitionNpcCount: true },
        }),
      ])

      return {
        disciplineId: foal.disciplineDef.id,
        disciplineName: foal.disciplineDef.name,
        preferredTerrain: foal.preferredTerrain as string[],
        preferredClimate: foal.preferredClimate as string[],
        venueTerrain: venue?.terrain ?? null,
        venueClimate: venue?.climate ?? null,
        hasCompeted: !!existing,
        competitionNpcCount: competitionStep?.competitionNpcCount ?? 4,
      }
    }),

  competeConformation: protectedProcedure
    .input(z.object({ gameId: z.string(), venueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { gameId, venueId } = input

      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId } },
        select: { id: true },
      })
      if (!player) throw new Error("Player not found")

      const pair = await db.tutorialAnimalPair.findUnique({
        where: { playerAccountId: player.id },
        select: {
          embryo: {
            select: {
              id: true,
              playerAccountId: true,
              status: true,
              ageInCycles: true,
              disciplineDefId: true,
              lifeStage: { select: { stageIndex: true } },
            },
          },
        },
      })
      const foal = pair?.embryo
      if (!foal || foal.playerAccountId !== player.id || foal.status !== "ALIVE") throw new TRPCError({ code: "NOT_FOUND", message: "Foal not found" })

      const disciplineDefId = foal.disciplineDefId
      if (!disciplineDefId) throw new TRPCError({ code: "BAD_REQUEST", message: "Foal has no discipline set" })

      const existing = await db.competition.findFirst({
        where: { tutorialPlayerAccountId: player.id, disciplineDefId },
        select: { id: true },
      })
      if (existing) return { competitionId: existing.id, alreadyEntered: true, disciplineName: "" }

      const [venue, discipline, animalTier, competitionStep] = await Promise.all([
        db.venue.findFirst({
          where: { id: venueId, gameId },
          select: { id: true, disciplines: { select: { disciplineDefId: true } } },
        }),
        db.disciplineDef.findUnique({
          where: { id: disciplineDefId },
          select: { name: true, isConformation: true, minLifeStageIndex: true, maxLifeStageIndex: true },
        }),
        db.animalCompetitionTier.findUnique({
          where: { animalId_disciplineDefId: { animalId: foal.id, disciplineDefId } },
          include: { tierDef: { select: { id: true, name: true } } },
        }),
        db.tutorialStepDef.findFirst({
          where: { gameId, competitionNpcCount: { not: null } },
          orderBy: { stepIndex: "desc" },
          select: { competitionNpcCount: true },
        }),
      ])
      if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" })
      if (!discipline) throw new TRPCError({ code: "NOT_FOUND", message: "Discipline not found" })
      if (!discipline.isConformation || discipline.name !== "Weanling Halter") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose Weanling Halter" })
      if (!venue.disciplines.some(entry => entry.disciplineDefId === disciplineDefId)) throw new TRPCError({ code: "BAD_REQUEST", message: "This venue does not offer Weanling Halter" })
      if ((discipline.minLifeStageIndex != null && foal.lifeStage.stageIndex < discipline.minLifeStageIndex) ||
        (discipline.maxLifeStageIndex != null && foal.lifeStage.stageIndex > discipline.maxLifeStageIndex)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The foal is not in an eligible life stage" })
      }
      if (!animalTier) throw new TRPCError({ code: "NOT_FOUND", message: "No competition tier configured for this foal" })

      const npcCount = competitionStep?.competitionNpcCount ?? 4
      const competition = await db.competition.create({
        data: {
          gameId,
          venueId: venue.id,
          disciplineDefId,
          tierDefId: animalTier.tierDefId,
          name: `${discipline.name} — ${animalTier.tierDef.name}`,
          maxEntries: npcCount + 1,
          maxWaitHours: 0,
          status: "OPEN",
          tutorialPlayerAccountId: player.id,
          tutorialNpcData: [],
          expiresAt: new Date(),
        },
      })
      try {
        const { entry } = await enterCompetition(db, { competitionId: competition.id, animalId: foal.id, playerAccountId: player.id })
        await runCompetition(db, { competitionId: competition.id })
        const result = await db.competitionResult.findUniqueOrThrow({ where: { entryId: entry.id } })
        const score = Math.round(result.score * 100) / 100
        const npcEntries = Array.from({ length: npcCount }, (_, i) => ({
          name: `Competitor ${i + 1}`,
          score: Math.round(Math.max(0, score * (0.55 + Math.random() * 0.35)) * 100) / 100,
          placement: i + 2,
        }))
        await db.competition.update({ where: { id: competition.id }, data: { tutorialNpcData: npcEntries } })
        return { competitionId: competition.id, placement: result.placement, score, npcEntries, disciplineName: discipline.name }
      } catch (error) {
        await db.competition.delete({ where: { id: competition.id } }).catch(() => undefined)
        throw error
      }
    }),
})
