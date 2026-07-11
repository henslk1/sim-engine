import { createFileRoute, redirect, Outlet } from "@tanstack/react-router"
import { Header } from "@/components/header"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" })
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext()

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header session={session!} />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
