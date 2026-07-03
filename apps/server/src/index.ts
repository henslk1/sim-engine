import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { trpcServer } from "@hono/trpc-server"
import { appRouter } from "./router.js"

const app = new Hono()

app.get("/health", (c) => c.json({ status: "ok" }))

app.use("/trpc/*", trpcServer({ router: appRouter }))

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log("Server running on port 3000")
})
