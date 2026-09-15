import { Worker } from "bullmq";
import { connection } from "./queue.js";
import { db } from "@sim-engine/db";
import { checkCompetitions } from "@sim-engine/engine"

export const competitionWorker = new Worker(
  "competition-check",
  async (job) => {
    const { gameId } = job.data
    await checkCompetitions(db, gameId)
  },
  { connection }
)

competitionWorker.on("failed", (job, err) => console.error(`[competition] job ${job?.id} failed:`, err))
competitionWorker.on("error", (err) => console.error("[competition] worker error:", err))
