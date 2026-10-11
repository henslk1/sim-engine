import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "./router.js"
export { appRouter } from "./router.js"
export { setGameMaintenance, syncGameMaintenance, gameMaintenance } from "./maintenance.js"
export type { AppRouter } from "./router.js"
export type RouterOutputs = inferRouterOutputs<AppRouter>