import { router, publicProcedure } from "../trpc.js"
import { db, Prisma } from "@sim-engine/db"
import { z } from "zod"

export const itemAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.itemDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      description: z.string().nullish(),
      itemType: z.enum(["OTC_MEDICATION", "CARE_CONSUMABLE", "EQUIPMENT", "DIRECT_EFFECT", "PERMANENT_APPLIED", "ANIMAL_SLOT_EXPAND", "SUBCONTAINER_EXPAND", "AGING_BASE", "AGING_PREMIUM"]),
      category: z.enum(["AGING", "CARE", "HEALTH", "EQUIPMENT", "BREEDING", "STORAGE", "MISC"]),
      effectType: z.enum(["IMMORTALITY", "SEX_CHANGE", "FREE_AGING", "BREEDING_SLOT_RAISE", "ENERGY_MAX_RAISE", "TWIN_CHANCE_RAISE", "TWIN_GUARANTEE", "STAGE_SKIP"]).nullish(),
      effects: z.record(z.unknown()).nullish(),
      prizeEligible: z.boolean().default(true),
      isSellable: z.boolean().default(true),
    }))
    .mutation(({ input }) => {
      const { id, gameId, description, effectType, effects, ...rest } = input
      const data = {
        ...rest,
        description: description ?? null,
        effectType: effectType ?? null,
        effects: effects != null ? (effects as Prisma.InputJsonValue) : Prisma.DbNull,
      }
      if (id) return db.itemDef.update({ where: { id }, data })
      return db.itemDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.itemDef.delete({ where: { id: input.id } })
    ),
})
