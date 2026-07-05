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
    <div className="min-h-screen flex flex-col">
      <Header session={session!} />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
