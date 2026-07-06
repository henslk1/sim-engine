import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const personalityAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.personalityTraitDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { _count: { select: { labelRanges: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      description: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, ...rest } = input
      const data = { ...rest, description: description ?? null }
      if (id) return db.personalityTraitDef.update({ where: { id }, data })
      return db.personalityTraitDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.personalityLabelRange.deleteMany({ where: { traitDefId: input.id } })
        await tx.breedPersonalityProfile.deleteMany({ where: { traitDefId: input.id } })
        return tx.personalityTraitDef.delete({ where: { id: input.id } })
      })
    ),

  listLabelRanges: publicProcedure
    .input(z.object({ traitDefId: z.string() }))
    .query(({ input }) =>
      db.personalityLabelRange.findMany({
        where: { traitDefId: input.traitDefId },
        orderBy: { minValue: "asc" },
      })
    ),

  saveLabelRange: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      traitDefId: z.string(),
      label: z.string().min(1),
      minValue: z.number(),
      maxValue: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, traitDefId, ...data } = input
      if (id) return db.personalityLabelRange.update({ where: { id }, data })
      return db.personalityLabelRange.create({ data: { traitDefId, ...data } })
    }),

  removeLabelRange: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.personalityLabelRange.delete({ where: { id: input.id } })),
})
