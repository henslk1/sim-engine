import { Worker } from "bullmq";
import { connection } from "./queue.js";

export const competitionWorker = new Worker(
  "competition-check",
  async (job) => {
    const { gameId } = job.data
    //todo: checkCompetitions(client, gameId)
    console.log(`[competition-check] processing gameId=${gameId}`)
  },
  { connection }
)
