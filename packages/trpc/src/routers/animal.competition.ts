import { enterCompetition, runCompetition } from "@sim-engine/engine";
import { db } from "@sim-engine/db";
import { router, publicProcedure } from "../trpc.js";
import { z } from "zod";

export const animalCompetitionRouter = router({
  listVenues: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.venue.findMany({
        where: { gameId: input.gameId },
        orderBy: [{ rotationOrder: "asc" }, { name: "asc" }],
      })
    ),

  listOpen: publicProcedure
    .input(z.object({
      gameId: z.string(),
      disciplineDefId: z.string().optional(),
      isConformation: z.boolean().optional(),
    }))
    .query(({ input }) =>
      db.competition.findMany({
        where: {
          gameId: input.gameId,
          status: "OPEN",
          ...(input.disciplineDefId ? { disciplineDefId: input.disciplineDefId } : {}),
          ...(input.isConformation != null ? { disciplineDef: { isConformation: input.isConformation } } : {}),
        },
        include: {
          disciplineDef: {
            select: {
              id: true,
              name: true,
              isConformation: true,
              equipmentRequirements: {
                select: {
                  id: true,
                  quantity: true,
                  itemDef: { select: { id: true, name: true } },
                },
              },
              statWeights: {
                select: {
                  weight: true,
                  statDef: { select: { id: true, name: true } },
                },
                orderBy: { weight: "desc" },
              },
            },
          },
          venue: { select: { id: true, name: true } },
          tierDef: { select: { id: true, name: true, tierIndex: true, entryFee: true } },
          breed: { select: { id: true, name: true } },
          entries: {
            orderBy: { enteredAt: "asc" },
            select: {
              animal: {
                select: {
                  id: true,
                  name: true,
                  breed: { select: { name: true } },
                  conformationScores: {
                    select: { score: true, breedId: true },
                  },
                },
              },
              entryStats: {
                select: {
                  trainedValue: true,
                  statDef: { select: { id: true } },
                },
              },
              playerAccount: { select: { username: true } },
            },
          },
          _count: { select: { entries: true } },
        },
        orderBy: { expiresAt: "asc" },
      })
    ),

  eligibility: publicProcedure
    .input(z.object({ animalId: z.string(), gameId: z.string() }))
    .query(({ input }) =>
      Promise.all([
        db.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: {
            ageInCycles: true,
            equipment: { select: { itemDef: { select: { id: true } } } },
            healthCertificates: {
              select: {
                isValid: true,
                expiresAtCycle: true,
                certDef: { select: { id: true, name: true } },
              },
            },
            healthRecords: {
              where: { isActive: true },
              select: {
                treatmentRecords: {
                  where: { isActive: true },
                  select: {
                    treatmentDef: {
                      select: {
                        restrictionDefs: { select: { restrictionType: true } },
                      },
                    },
                    activityRestriction: {
                      where: { isActive: true },
                      select: { restrictionType: true },
                    },
                  },
                },
              },
            },
          },
        }),
        db.healthCertificateDef.findMany({
          where: { gameId: input.gameId, requiredForCompetition: true },
          select: { id: true, name: true },
        }),
        db.animalCompetitionTier.findMany({
          where: { animalId: input.animalId },
          select: { disciplineDefId: true, tierDefId: true },
        }),
      ]).then(([animal, requiredCertDefs, compTiers]) => ({ animal, requiredCertDefs, compTiers }))
    ),

  enter: publicProcedure
    .input(z.object({
      animalId: z.string(),
      competitionId: z.string(),
      playerAccountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { entry, shouldRun } = await enterCompetition(db, input)
      if (shouldRun) {
        await runCompetition(db, { competitionId: input.competitionId })
      }
      return entry
    }),
  run: publicProcedure
    .input(z.object({
      competitionId: z.string(),
    }))
    .mutation(({ input }) => runCompetition(db, input)),

  get: publicProcedure
    .input(z.object({ competitionId: z.string() }))
    .query(({ input }) =>
      db.competition.findUniqueOrThrow({
        where: { id: input.competitionId },
        include: {
          venue: { select: { id: true, name: true } },
          disciplineDef: { select: { id: true, name: true, isConformation: true } },
          entries: {
            orderBy: [{ result: { placement: "asc" } }, { enteredAt: "asc" }],
            include: {
              animal: { select: { id: true, name: true, sex: true, breed: { select: { name: true } } } },
              playerAccount: { select: { id: true, username: true } },
              tierDef: { select: { name: true } },
              result: true,
            },
          },
          _count: { select: { entries: true } },
        },
      })
    ),
})