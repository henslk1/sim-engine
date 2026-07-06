import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const seasonAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.season.findMany({
        where: { gameId: input.gameId },
        orderBy: { startsAt: "desc" },
        include: { _count: { select: { categories: true } } },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      startsAt: z.string(),
      endsAt: z.string(),
      isActive: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, gameId, startsAt, endsAt, ...rest } = input
      const data = { ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt) }
      if (id) return db.season.update({ where: { id }, data })
      return db.season.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.seasonRanking.deleteMany({ where: { seasonId: input.id } })
        await tx.seasonCategory.deleteMany({ where: { seasonId: input.id } })
        return tx.season.delete({ where: { id: input.id } })
      })
    ),
  listCategories: publicProcedure
    .input(z.object({ seasonId: z.string() }))
    .query(({ input }) =>
      db.seasonCategory.findMany({
        where: { seasonId: input.seasonId },
        orderBy: { name: "asc" },
        include: {
          disciplineDef: { select: { id: true, name: true } },
          breed: { select: { id: true, name: true } },
        },
      })
    ),
  saveCategory: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      seasonId: z.string(),
      name: z.string().min(1),
      categoryType: z.enum(["OVERALL", "PER_BREED", "PER_DISCIPLINE"]),
      breedId: z.string().nullish(),
      disciplineDefId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, seasonId, breedId, disciplineDefId, ...rest } = input
      const data = { ...rest, breedId: breedId ?? null, disciplineDefId: disciplineDefId ?? null }
      if (id) return db.seasonCategory.update({ where: { id }, data })
      return db.seasonCategory.create({ data: { seasonId, ...data } })
    }),
  removeCategory: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.seasonRanking.deleteMany({ where: { categoryId: input.id } })
        return tx.seasonCategory.delete({ where: { id: input.id } })
      })
    ),
})
