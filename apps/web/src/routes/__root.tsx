import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { queryClient } from "@/lib/query-client"
import { authClient } from "@/lib/auth-client"

type Session = typeof authClient.$Infer.Session

type RouterContext = {
  session: Session | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    try {
      const { data: session } = await authClient.getSession()
      return { session }
    } catch {
      return { session: null }
    }
  },
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
