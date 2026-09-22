import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"

export const directoryRouter = router({
  listDiseases: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.healthConditionDef.findMany({
        where: { gameId: input.gameId },
        select: {
          id: true,
          name: true,
          description: true,
          conditionType: true,
          isGenetic: true,
          isFatal: true,
          isEpisodic: true,
          onsetMinCycle: true,
        },
        orderBy: { name: "asc" },
      })
    ),

  listConformation: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: {
          gameId: input.gameId,
          isHiddenModifier: false,
          panelEntries: { some: { panelDef: { panelType: "CONFORMATION" } } },
        },
        select: {
          id: true,
          name: true,
          description: true,
          minTestCycle: true,
          expressionRules: {
            select: { id: true, phenotype: true },
            orderBy: { phenotype: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })
    ),

  listColor: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: {
          gameId: input.gameId,
          isHiddenModifier: false,
          panelEntries: { some: { panelDef: { panelType: "COLOR" } } },
        },
        select: {
          id: true,
          name: true,
          description: true,
          expressionRules: {
            select: {
              id: true,
              phenotype: true,
              alleleOne: { select: { symbol: true } },
              alleleTwo: { select: { symbol: true } },
              ruleConditions: {
                select: {
                  healthConditionDef: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { phenotype: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })
    ),

  listPersonality: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.personalityTraitDef.findMany({
        where: { gameId: input.gameId },
        select: {
          id: true,
          name: true,
          description: true,
          labelRanges: {
            select: {
              id: true,
              label: true,
              minValue: true,
              maxValue: true,
              trainingModifier: true,
              moodModifier: true,
              conceptionModifier: true,
            },
            orderBy: { minValue: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })
    ),
})
