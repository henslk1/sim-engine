import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const disciplineAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.disciplineDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { statWeights: true, personalityWeights: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      description: z.string().nullish(),
      isConformation: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, ...rest } = input
      const data = { ...rest, description: description ?? null }
      if (id) return db.disciplineDef.update({ where: { id }, data })
      return db.disciplineDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.animalCompetitionTier.deleteMany({ where: { disciplineDefId: input.id } })
        await tx.disciplinePersonalityWeight.deleteMany({ where: { disciplineDefId: input.id } })
        await tx.disciplineStatWeight.deleteMany({ where: { disciplineDefId: input.id } })
        await tx.competitionTierDef.deleteMany({ where: { disciplineDefId: input.id } })
        return tx.disciplineDef.delete({ where: { id: input.id } })
      })
    ),

  listStatWeights: publicProcedure
    .input(z.object({ disciplineDefId: z.string() }))
    .query(({ input }) =>
      db.disciplineStatWeight.findMany({
        where: { disciplineDefId: input.disciplineDefId },
        orderBy: { statDef: { name: "asc" } },
        include: { statDef: { select: { id: true, name: true } } },
      })
    ),

  saveStatWeight: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      disciplineDefId: z.string(),
      statDefId: z.string(),
      weight: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, disciplineDefId, ...data } = input
      if (id) return db.disciplineStatWeight.update({ where: { id }, data })
      return db.disciplineStatWeight.create({ data: { disciplineDefId, ...data } })
    }),

  removeStatWeight: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.disciplineStatWeight.delete({ where: { id: input.id } })),

  listPersonalityWeights: publicProcedure
    .input(z.object({ disciplineDefId: z.string() }))
    .query(({ input }) =>
      db.disciplinePersonalityWeight.findMany({
        where: { disciplineDefId: input.disciplineDefId },
        orderBy: { traitDef: { name: "asc" } },
        include: { traitDef: { select: { id: true, name: true } } },
      })
    ),

  savePersonalityWeight: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      disciplineDefId: z.string(),
      traitDefId: z.string(),
      weight: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, disciplineDefId, ...data } = input
      if (id) return db.disciplinePersonalityWeight.update({ where: { id }, data })
      return db.disciplinePersonalityWeight.create({ data: { disciplineDefId, ...data } })
    }),

  removePersonalityWeight: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.disciplinePersonalityWeight.delete({ where: { id: input.id } })),
})
