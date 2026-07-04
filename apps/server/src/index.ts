import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "@sim-engine/trpc"
import { auth } from "./auth.js"
import { cors } from "hono/cors"

const app = new Hono()

app.use("*", cors({
  origin: "http://localhost:5173",
  credentials: true,
}))

app.get("/health", (c) => c.json({ status: "ok" }))

app.use("/trpc/*", trpcServer({ router: appRouter }))

app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw))

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log("Server running on port 3000")
})
