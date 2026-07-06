import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const itemAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.itemDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    ),
})
