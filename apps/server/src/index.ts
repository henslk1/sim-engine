import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "@sim-engine/trpc"
import { auth } from "./auth.js"
import { cors } from "hono/cors"
import type { Server as HttpServer } from "node:http"
import { initSocket, getIo } from "./socket.js"
import { realtimeControl } from "./realtime.js"
import { db } from "@sim-engine/db"
import { configureMessagingRateLimitBackend } from "@sim-engine/trpc/messaging"
import {
  closeMessagingRateLimitBackend,
  redisMessagingRateLimitBackend,
} from "./messaging-rate-limit.js"
import { resolveSchedulerBackend } from "./scheduler/backend.js"
import { createScheduler, type SchedulerHealth } from "./scheduler/runner.js"

const app = new Hono()

// Read before the server starts listening: an unrecognised value should stop
// the process here, with a clear message, rather than three seconds later from
// inside a timer callback.
const SCHEDULER_BACKEND = resolveSchedulerBackend(process.env["SCHEDULER_BACKEND"])

// Whichever backend wins sets these, and the rest of the file calls them
// without caring which one is running.
let stopScheduler: () => Promise<void> = async () => {}
let schedulerHealth: () => SchedulerHealth | null = () => null

configureMessagingRateLimitBackend(redisMessagingRateLimitBackend)

app.use("*", cors({
  origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
  credentials: true,
}))

// Readiness, not liveness. A process that is serving pages while scheduling
// nothing looks completely healthy from the outside — no errors, no failed
// requests — and the first sign of trouble is a player asking why their
// animals did not age. This is what makes that detectable.
app.get("/health", (c) => {
  const scheduler = schedulerHealth()
  const expected = SCHEDULER_BACKEND !== "none"
  const healthy = !expected || scheduler?.started === true

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      scheduler: { backend: SCHEDULER_BACKEND, ...(scheduler ?? {}) },
    },
    healthy ? 200 : 503
  )
})

app.use("/trpc/*", trpcServer({
  router: appRouter,
  createContext: async (_opts, c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    return { userId: session?.user.id ?? null, realtime: realtimeControl }
  }
}))

app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw))

const PORT = Number(process.env["PORT"] ?? 3000)

const httpServer = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on port ${PORT}`)
  initSocket(httpServer as HttpServer)

  // Start the scheduler in the background — not blocking request handling.
  void startScheduler().catch((err) => console.error("Scheduler start failed:", err))
}) as HttpServer

async function startScheduler(): Promise<void> {
  if (SCHEDULER_BACKEND === "none") {
    console.log("Scheduler disabled (SCHEDULER_BACKEND=none)")
    return
  }

  const scheduler = createScheduler()
  stopScheduler = scheduler.stop
  schedulerHealth = scheduler.getHealth
  scheduler.start()
}

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
// kill it after a short grace period (Fly's kill_timeout defaults to 5s). The
// HTTP server, Socket.io and the scheduler all live in this one process, so
// the scheduler gets a chance to wind down with everything else — see
// `stopScheduler`, which each backend sets to its own drain.
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
    await Promise.all([
      closeServer,
      closeMessagingRateLimitBackend(),
      stopScheduler(),
    ])
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
