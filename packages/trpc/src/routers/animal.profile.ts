import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalProfileRouter = router({
  get: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .query(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        include: {
          breed: {
            include: {
              statProfile: { include: { statDef: true } },
              personalityProfiles: { include: { traitDef: true } },
              dqTraits: { select: { locusId: true, expression: true } },
              coatDqSelections: { select: { expression: true } },
            },
          },
          playerAccount: { select: { id: true, username: true, avatar: true } },
          breeder: {select: { id: true, username: true } },
          brands: { include: { playerBrand: true } },

          lifeStage: {
            include: {
              stageActivityDefs: { include: { traitDef: true } },
            },
          },
          disciplineDef: {
            include: { equipmentRequirements: { select: { itemDefId: true } } },
          },
          secondaryDisciplineDef: {
            include: { equipmentRequirements: { select: { itemDefId: true } } },
          },
          breedComposition: { include: { breed: true } },

          // Pedigree
          ancestors: {
            orderBy: { depth: "asc" },
            include: {
              ancestor: {
                select: {
                  id: true,
                  name: true,
                  sex: true,
                  status: true,
                  image: true,
                  bornAt: true,
                  inbreedingCoefficient: true,
                  breed: { select: { id: true, name: true } },
                },
              },
            },
          },

          // vitals
          energy: true,
          mood: true,
          condition: true,
          careScore: true,
          immunity: true,

          // stats
          stats: { include: { statDef: true }, orderBy: { statDef: { name: "asc" } } },

          // personality
          personality: {
            orderBy: { traitDef: { name: "asc" } },
            include: {
              traitDef: { include: { labelRanges: { select: { label: true, minValue: true, maxValue: true, trainingModifier: true } } } },
            },
          },

          // genetics — hidden modifier loci are excluded; players must not see those alleles
          genotypes: {
            where: { locus: { isHiddenModifier: false } },
            orderBy: { id: "asc" },
            include: {
              locus: {
                include: {
                  panelEntries: { include: { panelDef: true } },
                  expressionRules: {
                    select: { alleleOneId: true, alleleTwoId: true, phenotype: true, ruleConditions: { select: { penetrance: true } } },
                  },
                },
              },
              alleleOne: true,
              alleleTwo: true,
            },
          },
          conformationScores: { include: { breed: true } },
          conformationSectionScores: {
            include: {
              section: {
                include: {
                  entries: {
                    orderBy: { displayOrder: "asc" },
                    include: { locus: { select: { id: true, name: true } } },
                  },
                },
              },
              breed: { select: { id: true, name: true } },
            },
          },

          // health
          healthRecords: {
            orderBy: [{ isActive: "desc" }, { diagnosedAt: { sort: "desc", nulls: "last" } }],
            include: {
              conditionDef: {
                include: {
                  treatments: {
                    select: { id: true, name: true, treatmentType: true, durationCycles: true },
                  },
                },
              },
              treatmentRecords: {
                include: {
                  treatmentDef: {
                    include: {
                      restrictionDefs: true,
                      items: { include: { itemDef: { select: { id: true, name: true } } } },
                    },
                  },
                  activityRestriction: true,
                },
              },
            },
          },
          testResults: {
            orderBy: { testedCycle: "desc" },
            include: { conditionDef: true },
          },
          healthCertificates: { include: { certDef: true } },
          vetVisitLogs: {
            orderBy: { visitCycle: "desc" },
            take: 5,
            include: { vetServiceDef: true, conditionDef: true },
          },

          // care
          longTermCareRecords: {
            include: { longTermCareActionDef: true },
            orderBy: { id: "asc" },
          },
          careLogs: {
            orderBy: { cycleNumber: "desc" },
            take: 10,
            include: { careActionDef: true },
          },

          // training
          trainingLogs: {
            orderBy: { cycleNumber: "desc" },
            take: 10,
            select: {
              id: true,
              cycleNumber: true,
              statGained: true,
              energyUsed: true,
              reachedCap: true,
              createdAt: true,
              trainingActionDef: { include: { statDef: true } },
              intensityTierDef: true,
            },
          },

          // competition
          compTiers: {
            include: {
              disciplineDef: {
                select: {
                  id: true,
                  name: true,
                  isConformation: true,
                  minLifeStageIndex: true,
                  maxLifeStageIndex: true,
                  equipmentRequirements: {
                    select: {
                      id: true,
                      quantity: true,
                      itemDef: { select: { id: true, name: true } },
                    },
                  },
                  compTierDefs: {
                    select: { tierIndex: true },
                    orderBy: { tierIndex: "desc" },
                    take: 1,
                  },
                },
              },
              tierDef: true,
            },
          },
          titles: {
            include: {
              titleDef: { include: { disciplineDef: true } },
            },
          },
          weeklyPoints: {
            orderBy: { weekStart: "desc" },
            take: 20,
          },
          competitionEntries: {
            orderBy: { enteredAt: "desc" },
            include: {
              competition: {
                include: {
                  venue: { select: { name: true } },
                  disciplineDef: { select: { name: true } },
                  _count: { select: { entries: true } },
                },
              },
              tierDef: { select: { name: true } },
              result: true,
            },
          },
          equipment: { include: { itemDef: true } },

          // stage activities
          stageActivityLogs: {
            orderBy: { cycleNumber: "desc" },
            take: 10,
            include: { stageActivityDef: { include: { traitDef: true } } },
          },

          // breeding events
          dailyLogs: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              partner: { select: { id: true, name: true } },
            },
          },

          // pregnancy (active, or completed but offspring not yet born)
          pregnancies: {
            where: {
              OR: [
                { isCompleted: false },
                { isCompleted: true, offspring: { some: { animal: { status: "EMBRYO_STORED" } } } },
              ],
            },
            take: 1,
            include: {
              breedingRecord: {
                include: {
                  sire: { select: { id: true, name: true } },
                  dam: { select: { id: true, name: true } },
                },
              },
              surrogacyRecord: {
                select: {
                  biologicalDam: { select: { id: true, name: true } },
                },
              },
              offspring: {
                orderBy: { birthOrder: "asc" },
                include: {
                  animal: { select: { id: true, sex: true, phenotypeDescription: true, status: true } },
                },
              },
            },
          },

          // breeding listing (male)
          breedingListings: {
            where: { isActive: true },
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              isActive: true,
              pricePerSlot: true,
              title: true,
              pureBredOnly: true,
              description: true,
              requiredTitleDefId: true,
              requiredTitleDef: { select: { id: true, name: true } },
              currencyDef: { select: { id: true, name: true, symbol: true } },
              slots: { select: { id: true, status: true } },
              breedRestrictions: { select: { id: true, breedId: true, breed: { select: { id: true, name: true } } } },
              statMinimums: { select: { id: true, statDefId: true, minValue: true, statDef: { select: { id: true, name: true } } } },
            },
          },

          // outgoing cover offers (male)
          coverOffersAsSire: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "asc" as const },
            select: {
              id: true,
              price: true,
              createdAt: true,
              dam: {
                select: {
                  id: true,
                  name: true,
                  breedName: true,
                  breed: { select: { id: true, name: true } },
                  playerAccount: { select: { id: true, username: true } },
                },
              },
            },
          },

          // incoming cover offers (female)
          coverOffersAsDam: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "asc" as const },
            select: {
              id: true,
              price: true,
              createdAt: true,
              sire: {
                select: {
                  id: true,
                  name: true,
                  breedName: true,
                  breed: { select: { id: true, name: true } },
                  playerAccount: { select: { id: true, username: true } },
                },
              },
            },
          },

          gameShopAnimal: {
            select: {
              id: true,
              isAvailable: true,
              shopBreedConfig: {
                select: {
                  price: true,
                  currencyDef: { select: { id: true, name: true, symbol: true } },
                },
              },
            },
          },

          // game config
          game: {
            select: {
              conformationSections: {
                orderBy: { displayOrder: "asc" },
                select: { name: true, displayOrder: true },
              },
              gameInnateMax: {
                select: { averageTotalInnate: true, maxTotalInnate: true },
              },
              gameConfig: {
                select: {
                  cyclesPerYear: true,
                  trainingCeilingMultiplier: true,
                  immunityMin: true,
                  immunityMax: true,
                  maxLocusTestsPerCycle: true,
                  subContainerLabel: true,
                  ultrasoundOpenCycle: true,
                  breedingEnergyCost: true,
                  maxBreedingSlots: true,
                  conformationInspectionMinCycle: true,
                  overworkInjuryThreshold: true,
                },
              },
              lifeStageDefs: {
                where: { canCompete: true },
                orderBy: { stageIndex: "asc" },
                take: 1,
                select: { name: true, minCycle: true },
              },
              careActionDefs: {
                select: {
                  id: true, name: true, costType: true, currencyAmount: true,
                  careScoreGain: true, energyRestore: true, moodBoost: true,
                  items: { select: { id: true, quantity: true, itemDef: { select: { id: true, name: true } } } },
                },
              },
              intensityTierDefs: {
                orderBy: { tierIndex: "asc" as const },
                select: { id: true, name: true, energyCost: true, tierIndex: true, minMood: true, minCondition: true },
              },
              trainingActionDefs: {
                select: { id: true, name: true, statDefId: true },
              },
              healthCertificateDefs: {
                select: { id: true, name: true, validForCycles: true, requiredForCompetition: true },
              },
              currencyDefs: {
                select: { id: true, name: true, symbol: true },
              },
              breeds: {
                select: { id: true, name: true },
                orderBy: { name: "asc" as const },
              },
            },
          },
        },
      })

      if (animal.breedId) {
        const breedFreqs = await db.breedAlleleFrequency.findMany({
          where: { breedId: animal.breedId, frequency: { gt: 0 } },
          select: { allele: { select: { locusId: true } } },
        })
        const breedLoci = new Set(breedFreqs.map(f => f.allele.locusId))
        return {
          ...animal,
          genotypes: animal.genotypes.filter(g => {
            const isHealth = g.locus.panelEntries.some(e => e.panelDef.panelType === "HEALTH")
            return !isHealth || breedLoci.has(g.locusId)
          }),
        }
      }

      return animal
    }),

    getOffspring: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .query(async ({ input }) => {
        return db.animal.findMany({
          where: {
            pregnancyOffspring: {
              some: {
                pregnancy: {
                  breedingRecord: {
                    OR: [{ sireId: input.animalId }, { damId: input.animalId }],
                  },
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            sex: true,
            status: true,
            image: true,
            ageInCycles: true,
            breedingCooldownUntilCycle: true,
            bornAt: true,
            breedName: true,
            breed: { select: { id: true, name: true } },
            breedComposition: { select: { breedId: true, percentage: true } },
            conformationScores: {
              select: { score: true, breedId: true },
              orderBy: { calculatedAt: "desc" },
              take: 1,
            },
            pregnancyOffspring: {
              take: 1,
              select: {
                pregnancy: {
                  select: {
                    breedingRecord: {
                      select: {
                        dam: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { bornAt: "desc" },
        })
      }),

      getStatHistory: publicProcedure
        .input(z.object({ animalId: z.string() }))
        .query(async ({ input }) => {
          return db.animalStatHistory.findMany({
            where: { animalId: input.animalId },
            orderBy: { cycleNumber: "desc" },
            take: 20,
            include: { statDef: true },
          })
        }),
})
