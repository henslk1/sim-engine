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
  canTrain: z.boolean(),
  canReceiveCare: z.boolean(),
  hasUniqueActionSet: z.boolean(),
  profileLayout: z.string().min(1),
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
      const { id, gameId, ...data } = input
      if(id) {
        return db.lifeStageDef.update({ where: { id }, data})
      }
      return db.lifeStageDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.lifeStageDef.delete({ where: { id: input.id } })
    ),
})