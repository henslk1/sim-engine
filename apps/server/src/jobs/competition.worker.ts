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
