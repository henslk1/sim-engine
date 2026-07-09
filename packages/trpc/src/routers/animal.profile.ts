import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalProfileRouter = router({
  get: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .query(async ({ input }) => {
      return db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        include: {
          breed: {
            include: {
              statProfile: { include: { statDef: true } },
              personalityProfiles: { include: { traitDef: true } },
            },
          },
          playerAccount: { select: { id: true, username: true } },
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
          stats: { include: { statDef: true } },

          // personality
          personality: { include: { traitDef: true } },

          // genetics
          genotypes: {
            include: {
              locus: true,
              alleleOne: true,
              alleleTwo: true,
            },
          },
          conformationScores: { include: { breed: true } },

          // health
          healthRecords: {
            orderBy: { diagnosedCycle: "desc" },
            include: {
              conditionDef: true,
              treatmentRecords: {
                include: {
                  treatmentDef: true,
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
            include: { vetServiceDef: true },
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
                include: {
                  equipmentRequirements: true,
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
            include: { stageActivityDef: true },
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
            },
          },

          // game config
          game: {
            select: {
              innateMax: true,
              gameConfig: {
                select: {
                  cyclesPerYear: true,
                  trainingCeilingMultiplier: true,
                  immunityMin: true,
                  immunityMax: true,
                },
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
