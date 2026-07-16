import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

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
            breedComposition: { select: { breedId: true, percentage: true } },
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
                value: true,
                traitLabel: true,
                traitDef: { select: { name: true } },
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

        // Mirrors computeBreedingGrade in web utils.ts — keep in sync if formula changes
        const gradeComponents: number[] = []
        gradeComponents.push(Math.min((animal.careScore?.score ?? 0) / 100, 1))
        const topTier = [...animal.compTiers].sort((a, b) => b.tierDef.tierIndex - a.tierDef.tierIndex)[0]
        if (topTier) {
          const maxTierIndex = topTier.disciplineDef.compTierDefs[0]?.tierIndex ?? topTier.tierDef.tierIndex
          gradeComponents.push((topTier.tierDef.tierIndex + 1) / (maxTierIndex + 1))
        } else {
          gradeComponents.push(0)
        }
        gradeComponents.push(Math.max(0, 1 - animal.inbreedingCoefficient / 0.25))
        if (animal.stats.length > 0 && config) {
          const avg = animal.stats.reduce((sum, s) => {
            const cap = s.innateValue * config.trainingCeilingMultiplier
            return sum + Math.min(s.trainedValue / cap, 1)
          }, 0) / animal.stats.length
          gradeComponents.push(avg)
        } else {
          gradeComponents.push(0)
        }
        const isCross = animal.breedComposition.length > 1
        if (!isCross && animal.conformationScores.length > 0) {
          const avg = animal.conformationScores.reduce((sum, s) => sum + s.score, 0) / animal.conformationScores.length
          gradeComponents.push(avg / 100)
        }
        const healthLoci = animal.genotypes.filter((g) =>
          g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
        )
        if (healthLoci.length > 0) {
          gradeComponents.push(healthLoci.filter((g) => g.isTestedByOwner).length / healthLoci.length)
        }
        const activeConditions = animal.healthRecords.filter((r) => r.isActive).length
        gradeComponents.push(Math.max(0, 1 - activeConditions * 0.15))
        const pct = (gradeComponents.reduce((a, b) => a + b, 0) / gradeComponents.length) * 100
        const breedingGrade =
          pct >= 100 ? "S" : pct >= 85 ? "A" : pct >= 70 ? "B" : pct >= 55 ? "C" : pct >= 40 ? "D" : "F"

        const donorSnapshot = {
          animalId: input.animalId,
          name: animal.name,
          sex: animal.sex,
          breedId: animal.breedId,
          breedName: animal.breed.name,
          inbreedingCoefficient: animal.inbreedingCoefficient,
          breedComposition: animal.breedComposition,
          careScore: animal.careScore?.score ?? 0,
          competitionTier: topTier
            ? { index: topTier.tierDef.tierIndex, name: topTier.tierDef.name }
            : null,
          conformationAvg:
            animal.conformationScores.length > 0
              ? animal.conformationScores.reduce((s, c) => s + c.score, 0) / animal.conformationScores.length
              : null,
          activeHealthConditions: activeConditions,
          breedingGrade,
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
            name: p.traitDef.name,
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
