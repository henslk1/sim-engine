import { Worker } from "bullmq"
import { connection, competitionQueue } from "./queue.js"
import { db } from "@sim-engine/db"

export const competitionDispatcherWorker = new Worker(
  "competition-dispatch",
  async () => {
    const games = await db.game.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    for (const game of games) {
      await competitionQueue.add("competition-check", { gameId: game.id })
    }

    console.log(`[competition-dispatch] enqueued ${games.length} game(s)`)
  },
  { connection }
)
