import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { tutorialMutationQueue } from "@/lib/tutorial/mutation-queue"
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
      // In dev the server may be restarting — wait briefly and retry once
      // before concluding there is no session and redirecting to login.
      if (import.meta.env.DEV) {
        await new Promise<void>((r) => setTimeout(r, 1500))
        try {
          const { data: session } = await authClient.getSession()
          return { session }
        } catch {}
      }
      return { session: null }
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [tutorialMutationQueue, httpBatchLink({ 
        url: `${import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000"}/trpc`,
        fetch: (url, options) => fetch(url, { ...options, credentials: "include" }),
      })],
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
