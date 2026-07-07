import { Worker } from "bullmq";
import { connection } from "./queue.js";

export const nightlyWorker = new Worker (
  "nightly",
  async (job) => {
    const { gameId } = job.data
    //TODO advanceAnimalAging(client, gameId)
    console.log(`[nightly] processing gameId=${gameId}`)
  },
  { connection }
)