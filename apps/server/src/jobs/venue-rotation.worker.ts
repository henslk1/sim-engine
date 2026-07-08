import { Worker } from "bullmq";
import { connection } from "./queue.js";

export const venueRotationWorker = new Worker(
  "venue-rotation",
  async (job) => {
    const { gameId } = job.data
    console.log(`[venue-rotation] stub - gameId=${gameId}`)
  },
  { connection }
)