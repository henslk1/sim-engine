import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { generateOffspring, computePhenotypeDescription, computeBreedingQuality } from "@sim-engine/engine"

export const breedingMaterialRouter = router({
  myStorage: publicProcedure
    .input(z.object({
      playerAccountId: z.string(),
      storageType: z.enum(["PERSONAL", "VET", "GROUP"]).optional(),
    }))
    .query(async ({ input }) => {
      const [materials, capacity] = await Promise.all([
        db.geneticMaterial.findMany({
          where: {
            ownerPlayerId: input.playerAccountId,
            isUsed: false,
            ...(input.storageType ? { storageType: input.storageType } : {}),
          },
          orderBy: { collectedAt: "desc" },
          select: {
            id: true,
            materialType: true,
            storageType: true,
            collectedAt: true,
            donorSnapshot: true,
            animal: { select: { id: true, name: true, breed: { select: { name: true } } } },
          },
        }),
        db.playerCapacity.findUnique({
          where: { playerAccountId: input.playerAccountId },
          select: { geneticStorageBase: true, geneticStorageSubscription: true, geneticStoragePurchased: true },
        }),
      ])
      return { materials, capacity }
    }),

  collectMaterial: publicProcedure
    .input(z.object({
      animalId: z.string(),
      materialType: z.enum(["SPERM", "EGG"]),
      storageType: z.enum(["PERSONAL", "VET", "GROUP"]).default("PERSONAL"),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: {
            gameId: true,
            playerAccountId: true,
            ageInCycles: true,
            name: true,
            sex: true,
            breedId: true,
            inbreedingCoefficient: true,
            breed: { select: { id: true, name: true } },
            fertility: true,
            generation: true,
            breedGeneration: true,
            breedComposition: { select: { breedId: true, percentage: true } },
            immunity: { select: { innateMax: true } },
            ancestors: {
              select: {
                ancestorId: true,
                depth: true,
                ancestor: { select: { inbreedingCoefficient: true } },
              },
            },
            stats: {
              select: {
                statDefId: true,
                innateValue: true,
                trainedValue: true,
                statDef: { select: { name: true } },
              },
            },
            genotypes: {
              select: {
                locusId: true,
                alleleOneId: true,
                alleleTwoId: true,
                isTestedByOwner: true,
                locus: {
                  select: {
                    id: true,
                    name: true,
                    panelEntries: {
                      select: { panelDef: { select: { panelType: true } } },
                    },
                  },
                },
                alleleOne: { select: { id: true, symbol: true } },
                alleleTwo: { select: { id: true, symbol: true } },
              },
            },
            careScore: { select: { score: true } },
            compTiers: {
              select: {
                tierDef: { select: { tierIndex: true, name: true } },
                disciplineDef: {
                  select: {
                    compTierDefs: {
                      select: { tierIndex: true },
                      orderBy: { tierIndex: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            },
            conformationScores: { select: { score: true } },
            healthRecords: { select: { isActive: true } },
            personality: {
              select: {
                traitDefId: true,
                value: true,
                traitLabel: true,
                traitDef: { select: { name: true, conceptionModifier: true } },
              },
            },
            energy: { select: { currentEnergy: true } },
            groupAnimals: { select: { groupId: true }, take: 1 },
            geneticCollectionCooldownUntilCycle: true,
            game: {
              select: {
                gameConfig: {
                  select: {
                    trainingCeilingMultiplier: true,
                    breedingEnergyCost: true,
                    geneticCollectionCooldownCycles: true,
                  },
                },
              },
            },
          },
        })

        const config = animal.game.gameConfig
        const groupId = animal.groupAnimals[0]?.groupId ?? null
        const energyCost = config?.breedingEnergyCost ?? 0
        if (energyCost > 0) {
          if ((animal.energy?.currentEnergy ?? 0) < energyCost) {
            throw new Error("Not enough energy to collect genetic material")
          }
          await tx.animalEnergy.update({
            where: { animalId: input.animalId },
            data: { currentEnergy: { decrement: energyCost } },
          })
        }

        if ((animal.geneticCollectionCooldownUntilCycle ?? 0) > animal.ageInCycles) {
          throw new Error(`Genetic material collection on cooldown until cycle ${animal.geneticCollectionCooldownUntilCycle}`)
        }

        if (input.storageType === "PERSONAL" || input.storageType === "VET") {
          const capacity = await tx.playerCapacity.findUnique({
            where: { playerAccountId: animal.playerAccountId },
            select: {
              geneticStorageBase: true,
              geneticStorageSubscription: true,
              geneticStoragePurchased: true,
            },
          })
          if (input.storageType === "PERSONAL") {
            const maxSlots = (capacity?.geneticStorageBase ?? 0) + (capacity?.geneticStorageSubscription ?? 0)
            const used = await tx.geneticMaterial.count({
              where: { ownerPlayerId: animal.playerAccountId, storageType: "PERSONAL", isUsed: false },
            })
            if (used >= maxSlots) throw new Error("Personal genetic storage is full")
          } else {
            const maxSlots = capacity?.geneticStoragePurchased ?? 0
            if (maxSlots === 0) throw new Error("No vet genetic storage capacity available")
            const used = await tx.geneticMaterial.count({
              where: { ownerPlayerId: animal.playerAccountId, storageType: "VET", isUsed: false },
            })
            if (used >= maxSlots) throw new Error("Vet genetic storage is full")
          }
        } else {
          if (!groupId) throw new Error("Animal is not in a group")
          const group = await tx.group.findUnique({
            where: { id: groupId },
            select: { geneticStorageCapacity: true },
          })
          const maxSlots = group?.geneticStorageCapacity ?? 0
          if (maxSlots === 0) throw new Error("Group has no genetic storage capacity")
          const used = await tx.geneticMaterial.count({
            where: { groupId, storageType: "GROUP", isUsed: false },
          })
          if (used >= maxSlots) throw new Error("Group genetic storage is full")
        }

        const vetService = await tx.vetServiceDef.findFirst({
          where: { gameId: animal.gameId, serviceType: "GENETIC_COLLECTION" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        if (vetService && vetService.baseCost > 0) {
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: animal.playerAccountId,
                currencyDefId: vetService.currencyDefId,
              },
            },
            data: { balance: { decrement: vetService.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: animal.playerAccountId,
              currencyDefId: vetService.currencyDefId,
              amount: vetService.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        if (vetService) {
          await tx.vetVisitLog.create({
            data: {
              animalId: input.animalId,
              playerAccountId: animal.playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: animal.ageInCycles,
            },
          })
        }

        const topTier = [...animal.compTiers].sort((a, b) => b.tierDef.tierIndex - a.tierDef.tierIndex)[0]
        const isCross = animal.breedComposition.length > 1
        const activeConditions = animal.healthRecords.filter((r) => r.isActive).length
        const healthLoci = animal.genotypes.filter((g) =>
          g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
        )
        const trainedStatAvgRatio =
          animal.stats.length > 0 && config
            ? animal.stats.reduce((sum, s) => {
                const cap = s.innateValue * config.trainingCeilingMultiplier
                return sum + Math.min(s.trainedValue / cap, 1)
              }, 0) / animal.stats.length
            : 0
        const conformationAvg =
          !isCross && animal.conformationScores.length > 0
            ? animal.conformationScores.reduce((s, c) => s + c.score, 0) / animal.conformationScores.length
            : null

        const { score: qualityScore, grade: breedingGrade } = computeBreedingQuality({
          careScore: animal.careScore?.score ?? 0,
          compTier: topTier
            ? {
                tierIndex: topTier.tierDef.tierIndex,
                maxTierIndex: topTier.disciplineDef.compTierDefs[0]?.tierIndex ?? topTier.tierDef.tierIndex,
              }
            : null,
          inbreedingCoefficient: animal.inbreedingCoefficient,
          trainedStatAvgRatio,
          conformationAvg,
          healthTestedRatio: healthLoci.length > 0 ? healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length : null,
          activeConditions,
        })

        const donorSnapshot = {
          animalId: input.animalId,
          name: animal.name,
          sex: animal.sex,
          breedId: animal.breedId,
          breedName: animal.breed.name,
          fertility: animal.fertility,
          generation: animal.generation,
          breedGeneration: animal.breedGeneration,
          inbreedingCoefficient: animal.inbreedingCoefficient,
          breedComposition: animal.breedComposition,
          immunity: { innateMax: animal.immunity?.innateMax ?? 100 },
          ancestors: animal.ancestors.map((a) => ({
            ancestorId: a.ancestorId,
            depth: a.depth,
            ancestorCOI: a.ancestor.inbreedingCoefficient,
          })),
          quality: qualityScore,
          breedingGrade,
          careScore: animal.careScore?.score ?? 0,
          competitionTier: topTier
            ? { index: topTier.tierDef.tierIndex, name: topTier.tierDef.name }
            : null,
          conformationAvg,
          activeHealthConditions: activeConditions,
          stats: animal.stats.map((s) => ({
            statDefId: s.statDefId,
            name: s.statDef.name,
            innateValue: s.innateValue,
            trainedValue: s.trainedValue,
          })),
          genotypes: animal.genotypes.map((g) => ({
            locusId: g.locusId,
            locusName: g.locus.name,
            panelTypes: g.locus.panelEntries.map((e) => e.panelDef.panelType),
            alleleOneId: g.alleleOneId,
            alleleOneSymbol: g.alleleOne.symbol,
            alleleTwoId: g.alleleTwoId,
            alleleTwoSymbol: g.alleleTwo.symbol,
            isTestedByOwner: g.isTestedByOwner,
          })),
          personality: animal.personality.map((p) => ({
            traitDefId: p.traitDefId,
            name: p.traitDef.name,
            conceptionModifier: p.traitDef.conceptionModifier,
            value: p.value,
            label: p.traitLabel,
          })),
          collectedAtCycle: animal.ageInCycles,
        }

        const material = await tx.geneticMaterial.create({
          data: {
            gameId: animal.gameId,
            animalId: input.animalId,
            ownerPlayerId: animal.playerAccountId,
            materialType: input.materialType,
            storageType: input.storageType,
            groupId: input.storageType === "GROUP" ? groupId : null,
            donorSnapshot,
          },
          select: { id: true, materialType: true, storageType: true },
        })

        const cooldownCycles = config?.geneticCollectionCooldownCycles ?? 0
        if (cooldownCycles > 0) {
          await tx.animal.update({
            where: { id: input.animalId },
            data: { geneticCollectionCooldownUntilCycle: animal.ageInCycles + cooldownCycles },
          })
        }

        return material
      })
    }),

  createEmbryo: publicProcedure
    .input(z.object({
      spermId: z.string(),
      eggId: z.string(),
      playerAccountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const [sperm, egg] = await Promise.all([
          tx.geneticMaterial.findUniqueOrThrow({
            where: { id: input.spermId },
            select: { id: true, materialType: true, isUsed: true, gameId: true, animalId: true, donorSnapshot: true },
          }),
          tx.geneticMaterial.findUniqueOrThrow({
            where: { id: input.eggId },
            select: { id: true, materialType: true, isUsed: true, gameId: true, animalId: true, donorSnapshot: true },
          }),
        ])

        if (sperm.materialType !== "SPERM") throw new Error("First material must be of type SPERM")
        if (egg.materialType !== "EGG") throw new Error("Second material must be of type EGG")
        if (sperm.isUsed) throw new Error("Sperm sample has already been used")
        if (egg.isUsed) throw new Error("Egg sample has already been used")
        if (sperm.gameId !== egg.gameId) throw new Error("Materials must be from the same game")

        const gameId = sperm.gameId
        const spermSnap = sperm.donorSnapshot as any
        const eggSnap = egg.donorSnapshot as any

        // Build ParentData entirely from snapshots — live animal state is irrelevant
        function snapshotToParentData(snap: any, animalId: string) {
          return {
            id: animalId,
            fertility: snap.fertility ?? 0.8,
            inbreedingCoefficient: snap.inbreedingCoefficient ?? 0,
            breedGeneration: snap.breedGeneration ?? null,
            breedId: snap.breedId,
            quality: snap.quality ?? 50,
            stats: (snap.stats ?? []).map((s: any) => ({ statDefId: s.statDefId, innateValue: s.innateValue })),
            mood: null,
            // conceptionModifier not used with skipConceptionRoll; pass 0
            personality: (snap.personality ?? []).map((p: any) => ({
              traitDefId: p.traitDefId,
              value: p.value,
              traitDef: { conceptionModifier: 0 },
            })),
            genotypes: (snap.genotypes ?? []).map((g: any) => ({
              locusId: g.locusId,
              alleleOneId: g.alleleOneId,
              alleleTwoId: g.alleleTwoId,
              alleleOne: { id: g.alleleOneId, symbol: g.alleleOneSymbol },
              alleleTwo: { id: g.alleleTwoId, symbol: g.alleleTwoSymbol },
            })),
            breedComposition: snap.breedComposition ?? [],
            immunity: snap.immunity ?? null,
            ancestors: (snap.ancestors ?? []).map((a: any) => ({
              ancestorId: a.ancestorId,
              depth: a.depth,
              ancestor: { inbreedingCoefficient: a.ancestorCOI ?? 0 },
            })),
          }
        }

        const sireData = snapshotToParentData(spermSnap, sperm.animalId)
        const damData = snapshotToParentData(eggSnap, egg.animalId)

        const [gameConfig, gameInnateMax, gradeBread, firstLifeStage, expressionRules, personalityLabelRanges] =
          await Promise.all([
            tx.gameConfig.findUniqueOrThrow({
              where: { gameId },
              select: {
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
              },
            }),
            tx.gameInnateMax.findFirst({
              where: { gameId },
              select: { maxTotalInnate: true, averageTotalInnate: true },
            }),
            tx.breed.findFirst({
              where: { gameId, isUnregistered: true },
              select: { id: true, lifeExpectancyBaseline: true },
            }),
            tx.lifeStageDef.findFirst({
              where: { gameId },
              orderBy: { stageIndex: "asc" },
              select: { id: true },
            }),
            tx.expressionRule.findMany({
              where: { locus: { gameId } },
              select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
            }),
            tx.personalityLabelRange.findMany({
              where: { traitDef: { gameId } },
              select: { traitDefId: true, label: true, minValue: true, maxValue: true },
            }),
          ])

        if (!firstLifeStage) throw new Error("No life stages configured for this game")

        const isCrossBreed = spermSnap.breedId !== eggSnap.breedId
        if (isCrossBreed && !gradeBread) throw new Error("No grade breed configured for this game")

        // IVF bypasses the conception roll — genetics are combined in the lab
        const result = generateOffspring({
          sire: sireData,
          dam: damData,
          damCareScore: 100, // no care applied at embryo creation; stats deferred to birth
          gameConfig,
          gameInnateMax: gameInnateMax ?? { maxTotalInnate: 2000, averageTotalInnate: 1000 },
          gradeBreedId: gradeBread?.id ?? spermSnap.breedId,
          skipConceptionRoll: true,
        })

        if (!result.conceived) throw new Error("Embryo creation failed — please try again")

        const breedingRecord = await tx.breedingRecord.create({
          data: {
            gameId,
            sireId: sperm.animalId,
            damId: egg.animalId,
            // Store enough parent data for birth-time stat computation
            sireSnapshot: {
              animalId: sperm.animalId,
              name: spermSnap.name,
              breedId: spermSnap.breedId,
              breedName: spermSnap.breedName,
              generation: spermSnap.generation ?? 0,
              stats: sireData.stats,
              breedComposition: sireData.breedComposition,
              quality: sireData.quality,
            },
            damSnapshot: {
              animalId: egg.animalId,
              name: eggSnap.name,
              breedId: eggSnap.breedId,
              breedName: eggSnap.breedName,
              generation: eggSnap.generation ?? 0,
              stats: damData.stats,
              breedComposition: damData.breedComposition,
              quality: damData.quality,
            },
          },
          select: { id: true },
        })

        const lifeExpectancy = gradeBread?.lifeExpectancyBaseline ?? gameConfig.lifeExpectancyBaseline ?? 120
        const offspringGeneration = Math.max(spermSnap.generation ?? 0, eggSnap.generation ?? 0) + 1

        const ancestorEntries = new Map<string, number>([[sperm.animalId, 1], [egg.animalId, 1]])
        for (const a of [...sireData.ancestors, ...damData.ancestors]) {
          const d = a.depth + 1
          const existing = ancestorEntries.get(a.ancestorId)
          if (existing === undefined || d < existing) ancestorEntries.set(a.ancestorId, d)
        }

        const offspringSnapshot: { animalId: string }[] = []

        for (const offspring of result.offspring) {
          const phenotypeDescription = computePhenotypeDescription(offspring.genotypes, expressionRules)
          const animal = await tx.animal.create({
            data: {
              gameId,
              playerAccountId: input.playerAccountId,
              breederId: input.playerAccountId,
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
            // innateMax is genetic; value deferred to birth when surrogate care is known
            tx.animalImmunity.create({ data: { animalId: animal.id, innateMax: offspring.immunity.innateMax, value: offspring.immunity.innateMax } }),
            // Stats deferred to birth — surrogate care score applied then
            tx.animalGenotype.createMany({
              data: offspring.genotypes.map((g) => ({ animalId: animal.id, locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId })),
            }),
            tx.animalBreedComposition.createMany({
              data: offspring.breedComposition.map((c) => ({ animalId: animal.id, breedId: c.breedId, percentage: c.percentage })),
            }),
            tx.animalAncestor.createMany({
              data: Array.from(ancestorEntries.entries()).map(([ancestorId, depth]) => ({ animalId: animal.id, ancestorId, depth })),
            }),
            ...(personalityData.length > 0 ? [tx.animalPersonality.createMany({ data: personalityData })] : []),
          ])

          offspringSnapshot.push({ animalId: animal.id })
        }

        const embryo = await tx.geneticMaterial.create({
          data: {
            gameId,
            animalId: egg.animalId,
            ownerPlayerId: input.playerAccountId,
            materialType: "EMBRYO",
            storageType: "PERSONAL",
            producedByBreedingRecordId: breedingRecord.id,
            offspringSnapshot,
          },
          select: { id: true },
        })

        await Promise.all([
          tx.geneticMaterial.update({ where: { id: input.spermId }, data: { isUsed: true } }),
          tx.geneticMaterial.update({ where: { id: input.eggId }, data: { isUsed: true } }),
        ])

        return { embryoId: embryo.id, offspringCount: result.offspring.length }
      })
    }),

  artificialInsemination: publicProcedure
    .input(z.object({
      spermId: z.string(),
      damId: z.string(),
      playerAccountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const sperm = await tx.geneticMaterial.findUniqueOrThrow({
          where: { id: input.spermId },
          select: { id: true, materialType: true, isUsed: true, gameId: true, animalId: true, donorSnapshot: true },
        })

        if (sperm.materialType !== "SPERM") throw new Error("Material must be of type SPERM")
        if (sperm.isUsed) throw new Error("Sperm sample has already been used")

        const gameId = sperm.gameId
        const spermSnap = sperm.donorSnapshot as any

        const dam = await tx.animal.findUniqueOrThrow({
          where: { id: input.damId },
          select: {
            id: true,
            name: true,
            sex: true,
            status: true,
            playerAccountId: true,
            gameId: true,
            breedId: true,
            breedGeneration: true,
            generation: true,
            ageInCycles: true,
            breed: { select: { name: true } },
            isCastrated: true,
            lifeStage: { select: { canBreed: true } },
            breedingCooldownUntilCycle: true,
            fertility: true,
            inbreedingCoefficient: true,
            mood: { select: { value: true } },
            personality: {
              select: {
                traitDefId: true,
                value: true,
                traitDef: { select: { conceptionModifier: true } },
              },
            },
            careScore: { select: { score: true } },
            stats: { select: { statDefId: true, innateValue: true, trainedValue: true } },
            genotypes: {
              select: {
                locusId: true,
                alleleOneId: true,
                alleleTwoId: true,
                alleleOne: { select: { id: true, symbol: true } },
                alleleTwo: { select: { id: true, symbol: true } },
                isTestedByOwner: true,
                locus: { select: { panelEntries: { select: { panelDef: { select: { panelType: true } } } } } },
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
            compTiers: {
              select: {
                tierDef: { select: { tierIndex: true } },
                disciplineDef: {
                  select: {
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
          },
        })

        if (dam.sex !== "FEMALE") throw new Error("Dam must be female")
        if (dam.status !== "ALIVE") throw new Error("Dam must be alive")
        if (dam.isCastrated) throw new Error("Dam is castrated")
        if (!dam.lifeStage.canBreed) throw new Error("Dam cannot breed at this life stage")
        if (dam.gameId !== gameId) throw new Error("Sperm and dam must be from the same game")
        if ((dam.breedingCooldownUntilCycle ?? 0) > dam.ageInCycles) {
          throw new Error(`Dam is on a breeding cooldown until cycle ${dam.breedingCooldownUntilCycle}`)
        }

        const activePregnancy = await tx.pregnancy.count({
          where: { animalId: input.damId, isCompleted: false },
        })
        if (activePregnancy > 0) throw new Error("Dam is already pregnant")

        const sireData = {
          id: sperm.animalId,
          fertility: spermSnap.fertility ?? 0.8,
          inbreedingCoefficient: spermSnap.inbreedingCoefficient ?? 0,
          breedGeneration: spermSnap.breedGeneration ?? null,
          breedId: spermSnap.breedId,
          quality: spermSnap.quality ?? 50,
          stats: (spermSnap.stats ?? []).map((s: any) => ({ statDefId: s.statDefId, innateValue: s.innateValue })),
          mood: null,
          personality: (spermSnap.personality ?? []).map((p: any) => ({
            traitDefId: p.traitDefId,
            value: p.value,
            traitDef: { conceptionModifier: p.conceptionModifier ?? 0 },
          })),
          genotypes: (spermSnap.genotypes ?? []).map((g: any) => ({
            locusId: g.locusId,
            alleleOneId: g.alleleOneId,
            alleleTwoId: g.alleleTwoId,
            alleleOne: { id: g.alleleOneId, symbol: g.alleleOneSymbol },
            alleleTwo: { id: g.alleleTwoId, symbol: g.alleleTwoSymbol },
          })),
          breedComposition: spermSnap.breedComposition ?? [],
          immunity: spermSnap.immunity ?? null,
          ancestors: (spermSnap.ancestors ?? []).map((a: any) => ({
            ancestorId: a.ancestorId,
            depth: a.depth,
            ancestor: { inbreedingCoefficient: a.ancestorCOI ?? 0 },
          })),
        }

        const [gameConfig, gameInnateMax, gradeBread, firstLifeStage, expressionRules, personalityLabelRanges] =
          await Promise.all([
            tx.gameConfig.findUniqueOrThrow({
              where: { gameId },
              select: {
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
                trainingCeilingMultiplier: true,
              },
            }),
            tx.gameInnateMax.findFirst({
              where: { gameId },
              select: { maxTotalInnate: true, averageTotalInnate: true },
            }),
            tx.breed.findFirst({
              where: { gameId, isUnregistered: true },
              select: { id: true, lifeExpectancyBaseline: true },
            }),
            tx.lifeStageDef.findFirst({
              where: { gameId },
              orderBy: { stageIndex: "asc" },
              select: { id: true },
            }),
            tx.expressionRule.findMany({
              where: { locus: { gameId } },
              select: { locusId: true, alleleOneId: true, alleleTwoId: true, phenotype: true },
            }),
            tx.personalityLabelRange.findMany({
              where: { traitDef: { gameId } },
              select: { traitDefId: true, label: true, minValue: true, maxValue: true },
            }),
          ])

        if (!firstLifeStage) throw new Error("No life stages configured for this game")

        const isCrossBreed = spermSnap.breedId !== dam.breedId
        if (isCrossBreed && !gradeBread) throw new Error("No grade breed configured for this game")

        const damTopTier = dam.compTiers[0]
        const damIsCross = dam.breedComposition.length > 1
        const damHealthLoci = dam.genotypes.filter((g) =>
          g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
        )
        const damQuality = computeBreedingQuality({
          careScore: dam.careScore?.score ?? 0,
          compTier: damTopTier
            ? {
                tierIndex: damTopTier.tierDef.tierIndex,
                maxTierIndex: damTopTier.disciplineDef.compTierDefs[0]?.tierIndex ?? damTopTier.tierDef.tierIndex,
              }
            : null,
          inbreedingCoefficient: dam.inbreedingCoefficient,
          trainedStatAvgRatio:
            dam.stats.length > 0 && gameConfig.trainingCeilingMultiplier
              ? dam.stats.reduce((sum, s) => {
                  const cap = s.innateValue * gameConfig.trainingCeilingMultiplier
                  return sum + Math.min((s.trainedValue ?? 0) / cap, 1)
                }, 0) / dam.stats.length
              : 0,
          conformationAvg:
            !damIsCross && dam.conformationScores.length > 0
              ? dam.conformationScores.reduce((s, c) => s + c.score, 0) / dam.conformationScores.length
              : null,
          healthTestedRatio:
            damHealthLoci.length > 0
              ? damHealthLoci.filter((g) => g.isTestedByOwner).length / damHealthLoci.length
              : null,
          activeConditions: dam.healthRecords.filter((r) => r.isActive).length,
        }).score

        const result = generateOffspring({
          sire: sireData,
          dam: { ...dam, quality: damQuality },
          damCareScore: dam.careScore?.score ?? 100,
          gameConfig,
          gameInnateMax: gameInnateMax ?? { maxTotalInnate: 2000, averageTotalInnate: 1000 },
          gradeBreedId: gradeBread?.id ?? spermSnap.breedId,
        })

        await tx.geneticMaterial.update({ where: { id: input.spermId }, data: { isUsed: true } })

        if (!result.conceived) {
          await tx.animalDailyLog.create({
            data: {
              animalId: input.damId,
              cycleNumber: dam.ageInCycles,
              eventType: "ARTIFICIAL_INSEMINATION",
              outcome: "NOT_CONCEIVED",
            },
          })
          return { conceived: false as const }
        }

        const breedingRecord = await tx.breedingRecord.create({
          data: {
            gameId,
            sireId: sperm.animalId,
            damId: input.damId,
            sireSnapshot: { animalId: sperm.animalId, name: spermSnap.name, breedId: spermSnap.breedId, breedName: spermSnap.breedName },
            damSnapshot: { animalId: input.damId, name: dam.name, breedId: dam.breedId, breedName: dam.breed.name },
          },
          select: { id: true },
        })

        const pregnancy = await tx.pregnancy.create({
          data: {
            animalId: input.damId,
            breedingRecordId: breedingRecord.id,
            requiredCycles: gameConfig.gestationCycles,
          },
          select: { id: true },
        })

        const lifeExpectancy = gradeBread?.lifeExpectancyBaseline ?? gameConfig.lifeExpectancyBaseline ?? 120
        const offspringGeneration = Math.max(spermSnap.generation ?? 0, dam.generation) + 1

        const ancestorEntries = new Map<string, number>([[sperm.animalId, 1], [input.damId, 1]])
        const spermAncestors: { ancestorId: string; depth: number }[] = (spermSnap.ancestors ?? []).map((a: any) => ({
          ancestorId: a.ancestorId,
          depth: a.depth,
        }))
        for (const a of [...spermAncestors, ...dam.ancestors]) {
          const d = a.depth + 1
          const existing = ancestorEntries.get(a.ancestorId)
          if (existing === undefined || d < existing) ancestorEntries.set(a.ancestorId, d)
        }

        for (const [i, offspring] of result.offspring.entries()) {
          const phenotypeDescription = computePhenotypeDescription(offspring.genotypes, expressionRules)
          const animal = await tx.animal.create({
            data: {
              gameId,
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
            ...(personalityData.length > 0
              ? [tx.animalPersonality.createMany({ data: personalityData })]
              : []),
          ])
        }

        await tx.animalDailyLog.create({
          data: {
            animalId: input.damId,
            cycleNumber: dam.ageInCycles,
            eventType: "ARTIFICIAL_INSEMINATION",
            outcome: "CONCEIVED",
          },
        })

        return {
          conceived: true as const,
          pregnancyId: pregnancy.id,
          offspringCount: result.offspring.length,
          requiredCycles: gameConfig.gestationCycles,
        }
      })
    }),

  flushEmbryo: publicProcedure
    .input(z.object({ pregnancyId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const pregnancy = await tx.pregnancy.findUniqueOrThrow({
          where: { id: input.pregnancyId },
          include: {
            animal: {
              select: {
                gameId: true,
                playerAccountId: true,
                ageInCycles: true,
              },
            },
            breedingRecord: { select: { id: true, damId: true } },
            offspring: { select: { animalId: true } },
          },
        })

        if (pregnancy.currentCycles !== 0) {
          throw new Error("Embryo flush is only available at conception (cycle 0)")
        }

        const { gameId, playerAccountId, ageInCycles } = pregnancy.animal

        const vetService = await tx.vetServiceDef.findFirst({
          where: { gameId, serviceType: "GENETIC_COLLECTION" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        if (vetService && vetService.baseCost > 0) {
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId,
                currencyDefId: vetService.currencyDefId,
              },
            },
            data: { balance: { decrement: vetService.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId,
              fromPlayerAccountId: playerAccountId,
              currencyDefId: vetService.currencyDefId,
              amount: vetService.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        if (vetService) {
          await tx.vetVisitLog.create({
            data: {
              animalId: pregnancy.animalId,
              playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: ageInCycles,
            },
          })
        }

        const offspringSnapshot = pregnancy.offspring.map((o) => ({ animalId: o.animalId }))

        const embryo = await tx.geneticMaterial.create({
          data: {
            gameId,
            animalId: pregnancy.breedingRecord.damId,
            ownerPlayerId: playerAccountId,
            materialType: "EMBRYO",
            storageType: "PERSONAL",
            producedByBreedingRecordId: pregnancy.breedingRecordId,
            offspringSnapshot,
          },
          select: { id: true },
        })

        const offspringAnimalIds = pregnancy.offspring.map((o) => o.animalId)
        if (offspringAnimalIds.length > 0) {
          await tx.animal.updateMany({
            where: { id: { in: offspringAnimalIds } },
            data: { status: "EMBRYO_STORED" },
          })
        }

        await tx.pregnancyOffspring.deleteMany({ where: { pregnancyId: input.pregnancyId } })
        await tx.pregnancy.delete({ where: { id: input.pregnancyId } })

        const gameConfig = await tx.gameConfig.findUnique({
          where: { gameId },
          select: { breedingCooldownCycles: true },
        })
        if ((gameConfig?.breedingCooldownCycles ?? 0) > 0) {
          await tx.animal.update({
            where: { id: pregnancy.animalId },
            data: { breedingCooldownUntilCycle: ageInCycles + gameConfig!.breedingCooldownCycles },
          })
        }

        return { embryoId: embryo.id }
      })
    }),

  implant: publicProcedure
    .input(z.object({
      embryoId: z.string(),
      surrogateAnimalId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const embryo = await tx.geneticMaterial.findUniqueOrThrow({
          where: { id: input.embryoId },
          select: {
            id: true,
            materialType: true,
            isUsed: true,
            gameId: true,
            animalId: true,
            producedByBreedingRecordId: true,
            offspringSnapshot: true,
          },
        })

        if (embryo.materialType !== "EMBRYO") throw new Error("Material is not an embryo")
        if (embryo.isUsed) throw new Error("Embryo has already been used")
        if (!embryo.producedByBreedingRecordId) throw new Error("Embryo has no associated breeding record")

        const offspringSnap = embryo.offspringSnapshot as Array<{ animalId: string }> | null
        if (!offspringSnap || offspringSnap.length === 0) {
          throw new Error("Embryo has no offspring data and cannot be implanted")
        }

        const surrogate = await tx.animal.findUniqueOrThrow({
          where: { id: input.surrogateAnimalId },
          select: {
            sex: true,
            status: true,
            ageInCycles: true,
            isCastrated: true,
            lifeStage: { select: { canBreed: true } },
            breedingCooldownUntilCycle: true,
          },
        })

        if (surrogate.sex !== "FEMALE") throw new Error("Surrogate must be female")
        if (surrogate.status !== "ALIVE") throw new Error("Surrogate must be alive")
        if (surrogate.isCastrated) throw new Error("Surrogate is castrated")
        if (!surrogate.lifeStage.canBreed) throw new Error("Surrogate cannot breed at this life stage")
        if ((surrogate.breedingCooldownUntilCycle ?? 0) > surrogate.ageInCycles) {
          throw new Error(`Surrogate is on a breeding cooldown until cycle ${surrogate.breedingCooldownUntilCycle}`)
        }

        const activePregnancy = await tx.pregnancy.count({
          where: { animalId: input.surrogateAnimalId, isCompleted: false },
        })
        if (activePregnancy > 0) throw new Error("Surrogate is already pregnant")

        const gameConfig = await tx.gameConfig.findUnique({
          where: { gameId: embryo.gameId },
          select: { gestationCycles: true },
        })

        const vetService = await tx.vetServiceDef.findFirst({
          where: { gameId: embryo.gameId, serviceType: "GENETIC_COLLECTION" },
          select: { id: true, baseCost: true, currencyDefId: true },
        })

        const ownerPlayerId = (await tx.animal.findUnique({
          where: { id: input.surrogateAnimalId },
          select: { playerAccountId: true },
        }))?.playerAccountId

        if (vetService && vetService.baseCost > 0 && ownerPlayerId) {
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: ownerPlayerId, currencyDefId: vetService.currencyDefId } },
            data: { balance: { decrement: vetService.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId: embryo.gameId,
              fromPlayerAccountId: ownerPlayerId,
              currencyDefId: vetService.currencyDefId,
              amount: vetService.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        if (vetService && ownerPlayerId) {
          await tx.vetVisitLog.create({
            data: {
              animalId: input.surrogateAnimalId,
              playerAccountId: ownerPlayerId,
              vetServiceDefId: vetService.id,
              visitCycle: surrogate.ageInCycles,
            },
          })
        }

        const breedingRecord = await tx.breedingRecord.findUnique({
          where: { id: embryo.producedByBreedingRecordId! },
          select: {
            sire: { select: { name: true } },
            dam: { select: { name: true } },
          },
        })

        const pregnancy = await tx.pregnancy.create({
          data: {
            animalId: input.surrogateAnimalId,
            breedingRecordId: embryo.producedByBreedingRecordId,
            requiredCycles: gameConfig?.gestationCycles ?? 12,
          },
          select: { id: true },
        })

        await tx.surrogacyRecord.create({
          data: {
            pregnancyId: pregnancy.id,
            biologicalDamId: embryo.animalId,
            geneticMaterialId: embryo.id,
          },
        })

        if (offspringSnap.length > 0) {
          await tx.pregnancyOffspring.createMany({
            data: offspringSnap.map((o, i) => ({
              pregnancyId: pregnancy.id,
              animalId: o.animalId,
              birthOrder: i + 1,
            })),
          })
          if (ownerPlayerId) {
            await tx.animal.updateMany({
              where: { id: { in: offspringSnap.map((o) => o.animalId) } },
              data: { playerAccountId: ownerPlayerId },
            })
          }
        }

        await tx.geneticMaterial.update({
          where: { id: embryo.id },
          data: { isUsed: true },
        })

        await tx.animalDailyLog.create({
          data: {
            animalId: input.surrogateAnimalId,
            cycleNumber: surrogate.ageInCycles,
            eventType: "EMBRYO_IMPLANTED",
            context: {
              sireName: breedingRecord?.sire.name ?? null,
              biologicalDamName: breedingRecord?.dam.name ?? null,
            },
          },
        })

        return { pregnancyId: pregnancy.id }
      })
    }),
})
