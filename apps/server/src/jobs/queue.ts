import { Queue } from "bullmq";

export const connection = {
  url: process.env.REDIS_URL!,
  maxRetriesPerRequest: null,
}

export const nightlyQue = new Queue("nightly", { connection })
export const competitionQueue = new Queue("competition-check", { connection })
export const venueRotatingQueue = new Queue("venue-rotation", { connection })