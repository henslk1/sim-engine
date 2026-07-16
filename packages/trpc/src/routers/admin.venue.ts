import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

const CLIMATES = ["HOT", "WARM", "COLD", "TEMPERATE"] as const
const TERRAINS = ["FLAT", "COASTAL", "HILLY", "MOUNTAIN"] as const

export const venueAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.venue.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: {
          disciplines: { include: { disciplineDef: { select: { id: true, name: true } } } },
        },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      climate: z.enum(CLIMATES),
      terrain: z.enum(TERRAINS),
      rotationOrder: z.number().int().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, rotationOrder, ...rest } = input
      const data = { ...rest, rotationOrder: rotationOrder ?? null }
      if (id) return db.venue.update({ where: { id }, data })
      return db.venue.create({ data: { gameId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.venue.delete({ where: { id: input.id } })),

  saveDiscipline: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      venueId: z.string(),
      disciplineDefId: z.string(),
      defaultMaxEntries: z.number().int().min(1),
      defaultMaxWaitHours: z.number().int().min(1),
      invitationalMaxEntries: z.number().int().nullish(),
      invitationalMaxWaitHours: z.number().int().nullish(),
      maxOpenAtOnce: z.number().int().min(1).default(1),
      isInvitationalEligible: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, venueId, invitationalMaxEntries, invitationalMaxWaitHours, ...rest } = input
      const data = {
        ...rest,
        invitationalMaxEntries: invitationalMaxEntries ?? null,
        invitationalMaxWaitHours: invitationalMaxWaitHours ?? null,
      }
      if (id) return db.venueDiscipline.update({ where: { id }, data })
      return db.venueDiscipline.create({ data: { venueId, ...data } })
    }),

  removeDiscipline: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.venueDiscipline.delete({ where: { id: input.id } })),
})
