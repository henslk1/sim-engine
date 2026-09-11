import { createFileRoute, redirect, Outlet, useLocation, useRouter } from "@tanstack/react-router"
import { Header } from "@/components/header"
import { trpc, trpcVanilla } from "@/lib/trpc"
import { MessagingWidget } from "@/components/messaging-widget"
import { authClient } from "@/lib/auth-client"
import { isTourRunning, destroyActiveTour } from "@/lib/tutorial"

type Session = typeof authClient.$Infer.Session

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

function SetupHeader({ session }: { session: Session }) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    await router.invalidate()
    void router.navigate({ to: "/" })
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="font-serif text-lg font-semibold text-foreground">Sim Engine</span>
        <div className="relative group">
          <button className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground overflow-hidden">
              {session.user.image
                ? <img src={session.user.image} alt={session.user.name ?? ""} className="h-full w-full object-cover" />
                : getInitials(session.user.name ?? "?")}
            </div>
            <span>{session.user.name}</span>
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-focus-within:block group-hover:block w-36 rounded-md border border-border bg-card shadow-md py-1 z-50">
            <button
              onClick={handleSignOut}
              className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

// TODO: remove before launch
const TUTORIAL_DEV_MODE = true

function TutorialDevBar() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const devReset = trpc.tutorial.devReset.useMutation({
    onSuccess: () => {
      localStorage.removeItem("tutorial_step")
      window.location.href = "/dashboard"
    },
  })
  const devFixStarter = trpc.tutorial.devFixStarter.useMutation({
    onSuccess: () => { window.location.reload() },
    onError: (e) => { alert(e.message) },
  })
  const devDeleteAccount = trpc.tutorial.devDeleteAccount.useMutation({
    onSuccess: () => {
      localStorage.removeItem("tutorial_step")
      window.location.href = "/"
    },
    onError: (e) => { alert(e.message) },
  })

  if (!TUTORIAL_DEV_MODE || !gameData) return null

  return (
    <div className="fixed right-3 top-15 z-100002 flex flex-col gap-1">
      <button
        onClick={() => { destroyActiveTour(); devReset.mutate({ gameId: gameData.id }) }}
        disabled={devReset.isPending}
        className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devReset.isPending ? "Resetting…" : "↺ Restart Step"}
      </button>
      <button
        onClick={() => { destroyActiveTour(); devFixStarter.mutate({ gameId: gameData.id }) }}
        disabled={devFixStarter.isPending}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devFixStarter.isPending ? "Fixing…" : "Fix Starter"}
      </button>
      <button
        onClick={() => { if (confirm("Delete your player account? This cannot be undone.")) { destroyActiveTour(); devDeleteAccount.mutate({ gameId: gameData.id }) } }}
        disabled={devDeleteAccount.isPending}
        className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devDeleteAccount.isPending ? "Deleting…" : "Delete Account"}
      </button>
    </div>
  )
}

// Pages that skip the tutorial check entirely (auth only)
const SKIP_TUTORIAL_CHECK = ["/tutorial", "/setup", "/admin"]
const completedUsers = new Set<string>()

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    if (!context.session) throw redirect({ to: "/login" })
    if (!context.session.user.emailVerified) throw redirect({ to: "/verify-email" })

    if (SKIP_TUTORIAL_CHECK.some(p => location.pathname.startsWith(p))) return

    const userId = context.session.user.id
    if (completedUsers.has(userId)) return

    const game = await trpcVanilla.admin.game.get.query()
    if (!game) return

    const player = await trpcVanilla.player.me.query({ gameId: game.id })
    if (!player) throw redirect({ to: "/setup" })
    if (player?.seniority?.tutorialCompleted) {
      completedUsers.add(userId)
      return
    }
    if (player?.seniority && !player.seniority.tutorialCompleted) {
      // isTourRunning() is a module-level flag set to true by beginTutorial (before navigation)
      // and cleared when Driver.js is destroyed. It resets on every full page load — never stale.
      // localStorage.tutorial_step tracks the current step across sessions for resume.
      const touring = isTourRunning()
      const lsRaw = parseInt(localStorage.getItem("tutorial_step") ?? "", 10)
      const currentStep = isNaN(lsRaw) ? 0 : lsRaw

      // If the tour is live and the user client-navigates back to /dashboard, return them to the
      // active tour page so Driver.js isn't spotlighting header elements on the wrong page.
      if (touring && location.pathname.startsWith("/dashboard") && currentStep > 0) {
        throw redirect({ to: currentStep >= 6 ? "/stable" : "/shop" })
      }

      const allowed = ["/dashboard"]
      if (touring) {
        allowed.push("/shop")
        if (currentStep >= 6) { allowed.push("/stable"); allowed.push("/animal") }
      }

      if (!allowed.some((p) => location.pathname.startsWith(p))) {
        throw redirect({ to: "/dashboard" })
      }
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext()
  const location = useLocation()
  const isSetup = location.pathname === "/setup"

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {isSetup ? <SetupHeader session={session!} /> : <Header session={session!} />}
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      {!isSetup && <MessagingWidget />}
      {!isSetup && <TutorialDevBar />}
    </div>
  )
}
