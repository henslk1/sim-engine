import { Worker } from "bullmq";
import { connection, nightlyQueue } from "./queue.js";
import { db } from "@sim-engine/db";

export const nightlyDispatcherWorker = new Worker(
  "nightly-dispatch",
  async () => {
    const games = await db.game.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    for (const game of games) {
      await nightlyQueue.add("nightly", { gameId: game.id })
    }
    
    console.log(`[nightly-dispatch] enqueued ${games.length} game(s)`)
  },
  { connection }
)