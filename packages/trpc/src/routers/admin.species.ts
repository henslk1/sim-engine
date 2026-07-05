import { router, publicProcedure } from "../trpc.js";
import { db } from "@sim-engine/db";
import { z } from "zod/v4";

export const speciesAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.species.findMany({ where: { gameId: input.gameId }, orderBy: { name: "asc" } })
  ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(), 
      name: z.string().min(1),
    })) 
    .mutation(({ input }) => {
      if (input.id) {
        return db.species.update({ where: { id: input.id }, data: { name: input.name } })
      }
      return db.species.create({ data: { gameId: input.gameId, name: input.name } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.species.delete({ where: { id: input.id } })
    ),
})
