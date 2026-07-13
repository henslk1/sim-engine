import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalAnimalRouter = router({
  list: publicProcedure.query(() =>
    db.animal.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        sex: true,
        breed: { select: { name: true } },
        lifeStage: { select: { name: true } },
      },
    })
  ),

  archive: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { status: "ARCHIVED" },
        select: { id: true, status: true },
      })
    ),

  bury: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { status: "BURIED" },
        select: { id: true, status: true },
      })
    ),

  moveToSubContainer: publicProcedure
    .input(z.object({ animalId: z.string(), subContainerId: z.string().nullable() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { subContainerId: input.subContainerId },
        select: { id: true, subContainerId: true },
      })
    ),

  updateName: publicProcedure
    .input(z.object({ animalId: z.string(), name: z.string().min(1).max(100).trim() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { name: input.name },
        select: { id: true, name: true },
      })
    ),

  updateNotes: publicProcedure
    .input(z.object({ animalId: z.string(), notes: z.string().max(5000) }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { notes: input.notes.trim() || null },
        select: { id: true, notes: true },
      })
    ),

    togglePin: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        const animal = await db.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { isPinned: true },
        })
        return db.animal.update({
          where: { id: input.animalId },
          data: { isPinned: !animal.isPinned },
          select: { id: true, isPinned: true },
        })
      }),
})
