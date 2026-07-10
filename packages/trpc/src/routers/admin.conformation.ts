import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const conformationAdminRouter = router({
  listSections: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.conformationSection.findMany({
        where: { gameId: input.gameId },
        orderBy: { displayOrder: "asc" },
        include: { _count: { select: { entries: true } } },
      })
    ),

  saveSection: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      displayOrder: z.number().int().default(0),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.conformationSection.update({ where: { id }, data })
      return db.conformationSection.create({ data: { gameId, ...data } })
    }),

  removeSection: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.conformationSectionEntry.deleteMany({ where: { sectionId: input.id } })
        return tx.conformationSection.delete({ where: { id: input.id } })
      })
    ),

  listEntries: publicProcedure
    .input(z.object({ sectionId: z.string() }))
    .query(({ input }) =>
      db.conformationSectionEntry.findMany({
        where: { sectionId: input.sectionId },
        include: { locus: { select: { id: true, name: true, displayGroup: true } } },
        orderBy: { displayOrder: "asc" },
      })
    ),

  saveEntry: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      sectionId: z.string(),
      locusId: z.string(),
      displayOrder: z.number().int().default(0),
    }))
    .mutation(({ input }) => {
      const { id, sectionId, ...data } = input
      if (id) return db.conformationSectionEntry.update({ where: { id }, data })
      return db.conformationSectionEntry.create({ data: { sectionId, ...data } })
    }),

  removeEntry: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.conformationSectionEntry.delete({ where: { id: input.id } })),
})
