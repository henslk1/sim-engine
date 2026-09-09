import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "@sim-engine/trpc"
import { auth } from "./auth.js"
import { cors } from "hono/cors"
import type { Server as HttpServer } from "node:http"
import { initSocket } from "./socket.js"
import { competitionDispatchQueue, venueRotationDispatchQueue, nightlyDispatchQueue } from "./jobs/queue.js"
import "./jobs/nightly.dispatcher.js"
import "./jobs/nightly.worker.js"
import "./jobs/competition.dispatcher.js"
import "./jobs/competition.worker.js"
import "./jobs/venue-rotation.worker.js"

const app = new Hono()

app.use("*", cors({
  origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
  credentials: true,
}))

app.get("/health", (c) => c.json({ status: "ok" }))

app.use("/trpc/*", trpcServer({
  router: appRouter,
  createContext: async (_opts, c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    return { userId: session?.user.id ?? null}
  }
}))

app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw))

const httpServer = serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log("Server running on port 3000")
  initSocket(httpServer as HttpServer)

  // Register job schedulers in the background — not blocking request handling
  Promise.all([
    nightlyDispatchQueue.upsertJobScheduler("nightly-dispatch-cron",
      { pattern: "0 0 * * *" }, { name: "nightly-dispatch", data: {} }),
    competitionDispatchQueue.upsertJobScheduler("competition-dispatch-cron",
      { pattern: "0 * * * *" }, { name: "competition-dispatch", data: {} }),
    venueRotationDispatchQueue.upsertJobScheduler("venue-rotation-dispatch-cron",
      { pattern: "0 0 * * 5" }, { name: "venue-rotation-dispatch", data: {} }),
  ]).then(() => console.log("Job schedulers registered"))
    .catch((err) => console.error("Job scheduler registration failed:", err))
}) as HttpServer
