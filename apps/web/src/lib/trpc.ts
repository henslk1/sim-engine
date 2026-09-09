import { createTRPCReact } from "@trpc/react-query"
import { httpBatchLink } from "@trpc/client"
import type { AppRouter } from "@sim-engine/trpc"

export const trpc = createTRPCReact<AppRouter>()
export type { RouterOutputs } from "@sim-engine/trpc"

// Vanilla client for use outside React (beforeLoad, loaders, workers)
export const trpcVanilla = trpc.createClient({
  links: [httpBatchLink({
    url: `${import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000"}/trpc`,
    fetch: (url, options) => fetch(url, { ...options, credentials: "include" }),
  })],
})