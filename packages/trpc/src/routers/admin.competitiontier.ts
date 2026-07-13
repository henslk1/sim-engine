import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const competitionTierAdminRouter = router({
  list: publicProcedure
    .input(z.object({ disciplineDefId: z.string() }))
    .query(({ input }) =>
      db.competitionTierDef.findMany({
        where: { disciplineDefId: input.disciplineDefId },
        orderBy: { tierIndex: "asc" },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      disciplineDefId: z.string(),
      name: z.string().min(1),
      tierIndex: z.number().int(),
      minScore: z.number().nullish(),
      advancementThreshold: z.number().nullish(),
      energyCost: z.number().default(0),
      entryFee: z.number().int().min(0).default(0),
      minWeeklyPointsForInvitational: z.number().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, disciplineDefId, minScore, advancementThreshold, energyCost, entryFee, minWeeklyPointsForInvitational, ...rest } = input
      const data = {
        ...rest,
        disciplineDefId,
        minScore: minScore ?? null,
        advancementThreshold: advancementThreshold ?? null,
        energyCost,
        entryFee,
        minWeeklyPointsForInvitational: minWeeklyPointsForInvitational ?? null,
      }
      if (id) return db.competitionTierDef.update({ where: { id }, data })
      return db.competitionTierDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.animalCompetitionTier.deleteMany({ where: { tierDefId: input.id } })
        return tx.competitionTierDef.delete({ where: { id: input.id } })
      })
    ),

  listPrizes: publicProcedure
    .input(z.object({ tierDefId: z.string() }))
    .query(({ input }) =>
      db.competitionTierPrize.findMany({
        where: { tierDefId: input.tierDefId },
        orderBy: [{ isInvitational: "asc" }, { placement: "asc" }],
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
      })
    ),

  savePrize: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      tierDefId: z.string(),
      placement: z.number().int().min(1),
      currencyDefId: z.string().optional(),
      amount: z.number().int().min(0),
      isInvitational: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const { id, tierDefId, currencyDefId, ...rest } = input
      const data = { ...rest, currencyDefId: currencyDefId ?? null }
      if (id) return db.competitionTierPrize.update({ where: { id }, data: { currencyDefId: data.currencyDefId, amount: data.amount } })
      return db.competitionTierPrize.create({ data: { tierDefId, ...data } })
    }),

  removePrize: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.competitionTierPrize.delete({ where: { id: input.id } })),
})
