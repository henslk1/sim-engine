import { router, publicProcedure } from "./trpc.js";
import { adminRouter } from "./routers/admin.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
