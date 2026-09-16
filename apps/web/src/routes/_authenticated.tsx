import { useState, useEffect } from "react"
import { createFileRoute, redirect, Outlet, useLocation, useRouter } from "@tanstack/react-router"
import { Header } from "@/components/header"
import { trpc, trpcVanilla } from "@/lib/trpc"
import { MessagingWidget } from "@/components/messaging-widget"
import { authClient } from "@/lib/auth-client"
import { isTourRunning, destroyActiveTour, startTutorial, setTourRunning } from "@/lib/tutorial"
import { grantGold } from "@/lib/tutorial/utils/grant-gold"

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
      localStorage.removeItem("tutorial_step")
      window.location.href = "/"
    },
    onError: (e) => { alert(e.message) },
  })

  if (!TUTORIAL_DEV_MODE || !gameData) return null

  return (
    <div className="fixed right-3 top-15 flex flex-col gap-1" style={{ zIndex: 1000000001, pointerEvents: "auto" }}>
      <button
        onMouseDown={() => {
        const raw = parseInt(localStorage.getItem("tutorial_step") ?? "", 10)
        const stepIndex = isNaN(raw) ? 0 : raw
        const phaseStart = stepIndex >= 56 ? 56 : stepIndex >= 49 ? 49 : stepIndex >= 20 ? 20 : stepIndex >= 10 ? 10 : stepIndex >= 5 ? 5 : 0
        localStorage.setItem("tutorial_step", String(phaseStart))
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

// Pages that skip the tutorial check entirely (auth only)
const SKIP_TUTORIAL_CHECK = ["/tutorial", "/setup", "/admin"]

// Per-step page allowlist. Each range covers exactly the pages a player should
// be able to reach at that point — no cumulative unlocking.
// Cross-page nav steps (5, 9, 57, 60, 68, 69, 71, 72) include both source and
// destination so the routing guard passes regardless of whether beforeLoad fires
// before or after ctrl.moveNext() updates localStorage.
function getTutorialAllowed(step: number): string[] {
  const d = "/dashboard"
  if (step <= 4)  return [d, "/shop"]
  if (step === 5) return [d, "/shop", "/stable"]
  if (step <= 8)  return [d, "/stable"]
  if (step === 9) return [d, "/stable", "/animal"]
  if (step <= 56) return [d, "/animal"]
  if (step === 57) return [d, "/animal", "/vet"]   // book-cert click: source + dest
  if (step <= 59) return [d, "/vet"]
  if (step === 60) return [d, "/vet", "/animal"]   // vet-back click: source + dest
  if (step <= 67) return [d, "/animal"]
  if (step === 68) return [d, "/animal", "/town"]  // town nav click: source + dest
  if (step === 69) return [d, "/town", "/shop"]    // shop card click: source + dest
  if (step <= 70) return [d, "/shop"]
  if (step === 71) return [d, "/shop", "/stable"]  // stable nav click: source + dest
  if (step === 72) return [d, "/stable", "/animal"] // mare card click: source + dest
  return [d, "/animal"]
}
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
        const dest =
          currentStep >= 58 && currentStep <= 60 ? "/vet" :
          currentStep === 69 ? "/town" :
          currentStep >= 70 && currentStep <= 71 ? "/shop" :
          currentStep === 72 ? "/stable" :
          currentStep >= 5 ? "/stable" : "/shop"
        throw redirect({ to: dest })
      }

      const allowed = getTutorialAllowed(currentStep)

      if (!allowed.some((p) => location.pathname.startsWith(p))) {
        throw redirect({ to: "/dashboard" })
      }
    }
  },
  component: AuthenticatedLayout,
})

// Auto-resumes Driver.js when a page refreshes mid-tutorial.
// Only fires when: not on /dashboard (welcome dialog handles that), not already touring,
// already on the correct page for the stored step, and tutorial data has loaded.
function TutorialResumeGate() {
  const location = useLocation()

  const lsRaw = parseInt(localStorage.getItem("tutorial_step") ?? "", 10)
  const storedStep = isNaN(lsRaw) ? 0 : lsRaw

  const skipPaths = ["/tutorial", "/setup", "/admin", "/dashboard"]
  const isSkipPath = skipPaths.some(p => location.pathname.startsWith(p))
  const active = storedStep > 0 && !isTourRunning() && !isSkipPath

  const { data: gameData } = trpc.admin.game.get.useQuery(undefined, { enabled: active })
  const gameId = gameData?.id

  const { data: me, isLoading: meLoading } = trpc.player.me.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && active },
  )
  const tutorialComplete = me?.seniority?.tutorialCompleted

  const { data: tutorialPair, isLoading: pairLoading } = trpc.tutorial.pairIds.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && active && storedStep >= 11 },
  )

  const completeStepMutation = trpc.tutorial.completeStep.useMutation()
  const grantPremiumMutation = trpc.tutorial.grantStartingPremium.useMutation()

  const [launched, setLaunched] = useState(false)

  useEffect(() => {
    if (!active || launched || isTourRunning()) return
    if (!gameId || meLoading || tutorialComplete == null) return
    if (tutorialComplete) return
    if (storedStep >= 11 && pairLoading) return

    // Only resume if already on the correct page — wrong-page case falls back to welcome dialog
    const animalId = tutorialPair?.ancestorOneId
    const onCorrectPage =
      storedStep >= 73
        ? !!animalId && location.pathname === `/animal/${animalId}`
        : storedStep === 72
          ? location.pathname.startsWith("/stable")
          : storedStep >= 70 && storedStep <= 71
            ? location.pathname.startsWith("/shop")
            : storedStep === 69
              ? location.pathname.startsWith("/town")
              : storedStep >= 61
                ? !!animalId && location.pathname === `/animal/${animalId}`
                : storedStep >= 58
                  ? location.pathname.startsWith("/vet")
                  : storedStep >= 11
                    ? !!animalId && location.pathname === `/animal/${animalId}`
                    : storedStep >= 6
                      ? location.pathname.startsWith("/stable")
                      : location.pathname.startsWith("/shop")

    if (!onCorrectPage) return

    setLaunched(true)
    setTourRunning(true)
    setTimeout(() => {
      startTutorial(
        {
          grantGold: (amount) => grantGold(gameId!, amount),
          grantPremium: () => grantPremiumMutation.mutateAsync({ gameId: gameId! }),
          completeStep: (key) => completeStepMutation.mutateAsync({ gameId: gameId!, stepKey: key }),
        },
        storedStep,
        () => completeStepMutation.mutate({ gameId: gameId!, stepKey: "tutorial_complete" }),
      )
    }, 500)
  }, [active, launched, gameId, meLoading, tutorialComplete, pairLoading, tutorialPair, storedStep, location.pathname])

  return null
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
      {!isSetup && <TutorialResumeGate />}
    </div>
  )
}
