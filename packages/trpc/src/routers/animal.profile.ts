import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalProfileRouter = router({
  get: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .query(({ input }) => {
      return db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        include: {
          breed: {
            include: {
              statProfile: { include: { statDef: true } },
              personalityProfiles: { include: { traitDef: true } },
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
          disciplineDef: true,
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
            include: {
              traitDef: { include: { labelRanges: { select: { label: true, minValue: true, maxValue: true } } } },
            },
          },

          // genetics
          genotypes: {
            orderBy: { id: "asc" },
            include: {
              locus: { include: { panelEntries: { include: { panelDef: true } } } },
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
            orderBy: { diagnosedCycle: "desc" },
            include: {
              conditionDef: true,
              treatmentRecords: {
                include: {
                  treatmentDef: { include: { restrictionDefs: true } },
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
            include: {
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
                  equipmentRequirements: {
                    select: {
                      id: true,
                      quantity: true,
                      itemDef: { select: { id: true, name: true } },
                    },
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
            take: 4,
          },
          competitionEntries: {
            orderBy: { enteredAt: "desc" },
            take: 5,
            include: {
              competition: { include: { venue: true } },
              tierDef: true,
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

          // pregnancy
          pregnancies: {
            where: { isCompleted: false },
            take: 1,
            include: {
              breedingRecord: {
                include: {
                  sire: { select: { id: true, name: true } },
                },
              },
              offspring: {
                include: {
                  animal: { select: { id: true, sex: true, phenotypeDescription: true } },
                },
              },
            },
          },

          // breeding listing (male)
          breedingListings: {
            take: 1,
            select: {
              id: true,
              isActive: true,
              pricePerSlot: true,
              currencyDef: { select: { id: true, name: true, symbol: true } },
              slots: { select: { id: true, status: true } },
              breedRestrictions: { select: { id: true, breedId: true, breed: { select: { id: true, name: true } } } },
              statMinimums: { select: { id: true, statDefId: true, minValue: true, statDef: { select: { id: true, name: true } } } },
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
                  breed: { select: { id: true, name: true } },
                  playerAccount: { select: { id: true, username: true } },
                },
              },
            },
          },

          // game config
          game: {
            select: {
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
                },
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
            bornAt: true,
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
