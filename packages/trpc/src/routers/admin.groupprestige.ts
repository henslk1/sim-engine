import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const groupPrestigeAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.groupPrestigeTierDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { tierIndex: "asc" },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      tierIndex: z.number().int().min(0),
      minScore: z.number().min(0),
      maxMembers: z.number().int().min(1),
      maxGroupAnimals: z.number().int().min(0),
      maxHostedShowsPerDay: z.number().int().nullish(),
      prestigeCurrencyRewardPerDay: z.number().min(0).default(0),
      vetDiscountPercent: z.number().min(0).max(100).default(0),
      canHaveVenue: z.boolean().default(false),
      canHostInvitational: z.boolean().default(false),
      entryFeeSharePercent: z.number().min(0).max(100).default(0),
    }))
    .mutation(({ input }) => {
      const { id, gameId, maxHostedShowsPerDay, ...rest } = input
      const data = { ...rest, maxHostedShowsPerDay: maxHostedShowsPerDay ?? null }
      if (id) return db.groupPrestigeTierDef.update({ where: { id }, data })
      return db.groupPrestigeTierDef.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.groupPrestigeTierDef.delete({ where: { id: input.id } })),
})
