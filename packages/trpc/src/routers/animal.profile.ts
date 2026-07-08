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
          lifeStage: {
            include: {
              stageActivityDefs: { include: { traitDef: true } },
            },
          },
          disciplineDef: true,
          breedComposition: { include: { breed: true } },

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
              disciplineDef: true,
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
})
