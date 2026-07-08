import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "@sim-engine/trpc"
import { auth } from "./auth.js"
import { cors } from "hono/cors"
import { nightlyQueue, competitionQueue, venueRotationQueue, nightlyDispatchQueue } from "./jobs/queue.js"
import "./jobs/nightly.dispatcher.js"
import "./jobs/nightly.worker.js"
import "./jobs/competition.worker.js"

const app = new Hono()

app.use("*", cors({
  origin: "http://localhost:5173",
  credentials: true,
}))

app.get("/health", (c) => c.json({ status: "ok" }))

app.use("/trpc/*", trpcServer({ router: appRouter }))

app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw))

serve({ fetch: app.fetch, port: 3000 }, async () => {
  console.log("Server running on port 3000")

  await nightlyDispatchQueue.upsertJobScheduler("nightly-dispatch-cron", {
  pattern: "0 0 * * *",
}, { name: "nightly-dispatch", data: {} })

  await competitionQueue.upsertJobScheduler("competition-cron", {
    pattern: "0 * * * *",
  }, { name: "competition-check", data: { gameId: "PLACEHOLDER" } })

  await venueRotationQueue.upsertJobScheduler("venue-rotation-cron", {
    pattern: "0 0 * * 5",
  }, { name: "venue-rotation", data: { gameId: "PLACEHOLDER" } })

  console.log("Job schedulers registered")
})
