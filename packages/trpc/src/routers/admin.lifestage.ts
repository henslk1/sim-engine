import { router, publicProcedure } from "../trpc.js";
import { db } from "@sim-engine/db";
import { z } from "zod";

const stageInput = z.object({
  id: z.string().optional(),
  gameId: z.string(),
  name: z.string().min(1),
  stageIndex: z.number().int().min(0),
  minCycle: z.number().int().min(0),
  ageCap: z.number().int().min(0),
  canCompete: z.boolean(),
  canBreed: z.boolean(),
  canSurrogate: z.boolean().default(false),
  canTrain: z.boolean(),
  canReceiveCare: z.boolean(),
  hasUniqueActionSet: z.boolean(),
  profileLayout: z.string().min(1),
  immunityCapMultiplier: z.number().default(1.0),
  energyCostMultiplier: z.number().min(0).default(1),
  deathChanceStartCycle: z.number().int().nullish(),
  deathChancePerCycle: z.number().min(0).max(1).nullish(),
})

export const lifeStageAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string()}))
    .query(({ input }) =>
      db.lifeStageDef.findMany({ 
        where: { gameId: input.gameId }, 
        orderBy: { stageIndex: "asc" }, 
      })
    ),
  save: publicProcedure
    .input(stageInput)
    .mutation(({ input }) => {
      const { id, gameId, deathChanceStartCycle, deathChancePerCycle, ...rest } = input
      const data = {
        ...rest,
        deathChanceStartCycle: deathChanceStartCycle ?? null,
        deathChancePerCycle: deathChancePerCycle ?? null,
      }
      if (id) return db.lifeStageDef.update({ where: { id }, data })
      return db.lifeStageDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.lifeStageDef.delete({ where: { id: input.id } })
    ),
})