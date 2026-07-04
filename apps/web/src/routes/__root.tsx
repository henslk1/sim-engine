import { createRootRoute, Outlet } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { queryClient } from "@/lib/query-client"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "http://localhost:3000/trpc" })],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </trpc.Provider>
  )
}