import type { inferRouterOutputs } from "@trpc/server"
export { appRouter } from "./router.js"
export type { AppRouter } from "./router.js"
export type RouterOutputs = inferRouterOutputs<AppRouter>