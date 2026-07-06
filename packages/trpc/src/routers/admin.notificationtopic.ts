import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const notificationTopicAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.notificationTopicDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { topicKey: "asc" },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      topicKey: z.string().min(1),
      name: z.string().min(1),
      isDefaultEnabled: z.boolean().default(true),
    }))
    .mutation(({ input }) => {
      const { id, gameId, ...data } = input
      if (id) return db.notificationTopicDef.update({ where: { id }, data })
      return db.notificationTopicDef.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.notificationSetting.deleteMany({ where: { topicDefId: input.id } })
        await tx.notification.deleteMany({ where: { topicDefId: input.id } })
        return tx.notificationTopicDef.delete({ where: { id: input.id } })
      })
    ),
})
