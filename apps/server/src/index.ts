import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "@sim-engine/trpc"
import { auth } from "./auth.js"
import { cors } from "hono/cors"
import type { Server as HttpServer } from "node:http"
import { initSocket, getIo } from "./socket.js"
import { db } from "@sim-engine/db"
import { competitionDispatchQueue, venueRotationDispatchQueue, nightlyDispatchQueue } from "./jobs/queue.js"
import { nightlyDispatcherWorker } from "./jobs/nightly.dispatcher.js"
import { nightlyWorker } from "./jobs/nightly.worker.js"
import { competitionDispatcherWorker } from "./jobs/competition.dispatcher.js"
import { competitionWorker } from "./jobs/competition.worker.js"
import { venueRotationWorker } from "./jobs/venue-rotation.worker.js"

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

const PORT = Number(process.env["PORT"] ?? 3000)

const httpServer = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on port ${PORT}`)
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

// Without this, a failed bind surfaces as an unhandled 'error' event: Node
// rethrows it and the process dies with a raw stack trace, or silently if
// nothing is watching that terminal. The usual cause in dev is a second
// `pnpm dev` stack already holding the port — every watcher restart then
// races for it, and whichever loses disappears without explanation.
httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use — another dev server is probably running. Stop it, or set PORT to use a different one.`)
  } else {
    console.error("HTTP server error:", error)
  }
  process.exit(1)
})


// Deploys and platform restarts stop this process with a signal, then force
// kill it after a short grace period (Fly's kill_timeout defaults to 5s).
// The HTTP server, Socket.io and all five BullMQ workers live in this one
// process, so without draining them an in-flight job is cut mid-run and never
// releases its Redis lock: BullMQ waits out lockDuration, marks the job
// stalled, and past maxStalledCount fails it outright. That matters most for
// the nightly tick, which advances every animal in a game.
const WORKERS = [
  nightlyDispatcherWorker,
  nightlyWorker,
  competitionDispatcherWorker,
  competitionWorker,
  venueRotationWorker,
]

let shuttingDown = false
async function shutdown(signal: string) {
  // A second signal during the drain must not restart it.
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received — draining before exit`)

  // A hung drain is worse than an abrupt exit: the platform SIGKILLs us
  // anyway and we lose the logs explaining why. Keep this under the
  // platform's grace period.
  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out — exiting without a clean drain")
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  try {
    // Socket.io's close() disconnects every client and closes the HTTP server
    // it is attached to, so it covers both. Long-lived websockets would
    // otherwise keep the HTTP server open indefinitely.
    const closeServer = new Promise<void>((resolve) => {
      try { getIo().close(() => resolve()) }
      catch { httpServer.close(() => resolve()) }
    })
    // close() resolves once the worker's active job finishes, which is what
    // releases the lock cleanly rather than leaving it to expire.
    await Promise.all([closeServer, ...WORKERS.map((worker) => worker.close())])
    await db.$disconnect()
    console.log("Drained cleanly")
    process.exit(0)
  } catch (error) {
    console.error("Shutdown failed:", error)
    process.exit(1)
  }
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })