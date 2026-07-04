import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@sim-engine/trpc"

export const trpc = createTRPCReact<AppRouter>()