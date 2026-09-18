import { useEffect } from "react"
import { createFileRoute, redirect, Outlet, useLocation, useRouter } from "@tanstack/react-router"
import { Header } from "@/components/header"
import { trpc, trpcVanilla } from "@/lib/trpc"
import { MessagingWidget } from "@/components/messaging-widget"
import { authClient } from "@/lib/auth-client"
import { isTourRunning, destroyActiveTour, startTutorial } from "@/lib/tutorial"
import { clearTutorialStep, clearTutorialVenueId, configureTutorialStorage, getTutorialAccess, installTutorialInteractionGuard, readTutorialStep, readTutorialVenueId, saveTutorialStep, setTutorialAccess, useTutorialAccess, wasTutorialRunning } from "@/lib/tutorial/access"
import { isTutorialRouteAllowed } from "@sim-engine/trpc/tutorial-policy"
import { grantGold } from "@/lib/tutorial/utils/grant-gold"
import { grantPremium } from "@/lib/tutorial/utils/grant-premium"

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
const TUTORIAL_DEV_MODE = import.meta.env.DEV

function TutorialDevBar() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const devReset = trpc.tutorial.devReset.useMutation({
    onSuccess: () => {
      window.location.href = "/dashboard"
    },
    onError: (e) => { alert(`Reset failed: ${e.message}`) },
  })
  const devFixStarter = trpc.tutorial.devFixStarter.useMutation({
    onSuccess: () => { window.location.reload() },
    onError: (e) => { alert(e.message) },
  })
  const devDeleteAccount = trpc.tutorial.devDeleteAccount.useMutation({
    onSuccess: () => {
      clearTutorialStep()
      window.location.href = "/"
    },
    onError: (e) => { alert(e.message) },
  })

  if (!TUTORIAL_DEV_MODE || !gameData) return null

  return (
    <div data-tutorial-dev className="fixed right-3 top-15 flex flex-col gap-1" style={{ zIndex: 1000000001, pointerEvents: "auto" }}>
      <button
        onMouseDown={() => {
        const raw = parseInt(localStorage.getItem("tutorial_step") ?? "", 10)
        const stepIndex = isNaN(raw) ? 0 : raw
        const phaseStart = stepIndex >= 81 ? 84 : stepIndex >= 56 ? 56 : stepIndex >= 49 ? 49 : stepIndex >= 20 ? 20 : stepIndex >= 10 ? 10 : stepIndex >= 5 ? 5 : 0
        if (stepIndex >= 81) clearTutorialVenueId()
        saveTutorialStep(phaseStart)
        destroyActiveTour()
        devReset.mutate({ gameId: gameData.id, stepIndex })
      }}
        disabled={devReset.isPending}
        style={{ pointerEvents: "auto" }}
        className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devReset.isPending ? "Resetting…" : "↺ Restart Step"}
      </button>
      <button
        onMouseDown={() => { destroyActiveTour(); devFixStarter.mutate({ gameId: gameData.id }) }}
        disabled={devFixStarter.isPending}
        style={{ pointerEvents: "auto" }}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devFixStarter.isPending ? "Fixing…" : "Fix Starter"}
      </button>
      <button
        onMouseDown={() => { if (confirm("Delete your player account? This cannot be undone.")) { destroyActiveTour(); devDeleteAccount.mutate({ gameId: gameData.id }) } }}
        disabled={devDeleteAccount.isPending}
        style={{ pointerEvents: "auto" }}
        className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {devDeleteAccount.isPending ? "Deleting…" : "Delete Account"}
      </button>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    if (!context.session) throw redirect({ to: "/login" })
    if (!context.session.user.emailVerified) throw redirect({ to: "/verify-email" })
    installTutorialInteractionGuard()

    // Only actual staff can leave the tutorial for administration.
    if (location.pathname === "/admin" || location.pathname.startsWith("/admin/")) {
      const roles = await trpcVanilla.admin.ops.players.myRoles.query()
      if (!roles.length) throw redirect({ to: "/dashboard", replace: true })
      destroyActiveTour()
      setTutorialAccess({ restricted: false })
      return
    }
    const game = await trpcVanilla.admin.game.get.query()
    if (!game) return
    const player = await trpcVanilla.player.me.query({ gameId: game.id })
    if (!player) {
      if (location.pathname === "/setup") { setTutorialAccess({ restricted: false }); return }
      throw redirect({ to: "/setup" })
    }
    if (player.seniority?.tutorialCompleted) {
      setTutorialAccess({ restricted: false })
      return
    }
    configureTutorialStorage(context.session.user.id, game.id)
    const pair = await trpcVanilla.tutorial.pairIds.query({ gameId: game.id })
    const step = isTourRunning() ? getTutorialAccess().step : (player.seniority?.tutorialDriverStep ?? readTutorialStep())
    setTutorialAccess({ restricted: true, step, mareId: pair?.ancestorOneId ?? null })
    if (location.pathname === "/dashboard") {
      destroyActiveTour()
      return
    }
    const routeAllowed = isTutorialRouteAllowed(step, pair?.ancestorOneId, location.pathname, location.search)
    if (!routeAllowed) {
      destroyActiveTour()
      throw redirect({ to: "/dashboard", replace: true })
    }
    // A reload clears Driver.js memory but keeps this tab's active-tour marker.
    // Restore only the authoritative step on its valid route; other interrupted
    // or manually opened pages still return to the dashboard dialog.
    if (!isTourRunning()) {
      const savedVenueId = readTutorialVenueId()
      const venueMatches = !location.pathname.startsWith("/venue/") ||
        location.pathname === `/venue/${savedVenueId}`
      if (!wasTutorialRunning() || !venueMatches) {
        destroyActiveTour()
        throw redirect({ to: "/dashboard", replace: true })
      }
      startTutorial({
        setStep: async index => { await trpcVanilla.tutorial.setDriverStep.mutate({ gameId: game.id, step: index }) },
        recover: error => {
          if (error) console.error("Tutorial recovery:", error)
          setTutorialAccess({ recoveryMessage: error ? "The tutorial couldn't continue. Your progress is saved; use Continue Tutorial to retry." : null })
          window.location.replace("/dashboard")
        },
        grantGold: amount => grantGold(game.id, amount),
        grantPremium: () => grantPremium(game.id),
        completeStep: async stepKey => { await trpcVanilla.tutorial.completeStep.mutate({ gameId: game.id, stepKey }) },
      }, step)
    }
  },
  component: AuthenticatedLayout,
})

function TutorialRecovery() {
  const access = useTutorialAccess()
  const location = useLocation()
  const router = useRouter()
  useEffect(() => {
    if (!access.restricted) return
    if (location.pathname !== "/dashboard" && !access.running) {
      destroyActiveTour()
      void router.navigate({ to: "/dashboard", replace: true })
    }
  }, [access, location.pathname, location.search, router])
  if (!access.restricted || (!access.running && location.pathname === "/dashboard")) return null
  return <a
    href="/dashboard"
    data-tutorial-recovery
    className="fixed bottom-4 left-4 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-lg"
    style={{ zIndex: 1000000002, pointerEvents: "auto" }}
    onClick={event => { event.preventDefault(); destroyActiveTour(); void router.navigate({ to: "/dashboard", replace: true }) }}
  >Return to Dashboard</a>
}
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
      {!isSetup && <TutorialRecovery />}
    </div>
  )
}
