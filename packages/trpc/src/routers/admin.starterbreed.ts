import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const starterBreedAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.starterBreedOption.findMany({
        where: { gameId: input.gameId },
        include: {
          breed: { select: { id: true, name: true } },
          colorOptions: { orderBy: { name: "asc" } },
        },
        orderBy: { breed: { name: "asc" } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      breedId: z.string(),
      isActive: z.boolean(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.starterBreedOption.update({ where: { id }, data })
      return db.starterBreedOption.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.starterColorOption.deleteMany({ where: { starterBreedOptionId: input.id } })
        return tx.starterBreedOption.delete({ where: { id: input.id } })
      })
    ),

  saveColorOption: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      starterBreedOptionId: z.string(),
      name: z.string().min(1),
      image: z.string().nullish(),
      isActive: z.boolean(),
    }))
    .mutation(({ input }) => {
      const { id, starterBreedOptionId, image, ...data } = input
      if (id) return db.starterColorOption.update({ where: { id }, data: { ...data, image: image ?? null } })
        return db.starterColorOption.create({ data: { starterBreedOptionId, ...data, image: image ?? null } })
    }),

  removeColorOption: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.starterColorOption.delete({ where: { id: input.id } })),
})