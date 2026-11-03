import { useEffect } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useNightlyState } from "@/lib/nightly"
import { authClient } from "@/lib/auth-client"
import { endClientSession } from "@/lib/session-cleanup"
import { Button } from "@/components/ui/button"
import { Moon } from "lucide-react"

export const Route = createFileRoute("/_authenticated/new-day")({
  component: NewDay,
})

/**
 * Where everybody waits while the nightly runs.
 *
 * The block itself is on the server — every gameplay mutation is refused with
 * `GAME_UPDATE_IN_PROGRESS` for the duration, whatever the client does. This
 * page exists so that nobody has to discover it that way.
 *
 * Signing out keeps working, which is the one thing the plan insists on: a
 * player must never be held inside a game they cannot leave. It does not go
 * through tRPC at all, so the block cannot touch it — but that only covers the
 * server. A tutorial player was still held here by the *client*: the tutorial's
 * interaction guard stays armed on this page, and it refuses anything without a
 * permitted marker, so the one button on the page did nothing at all. Hence
 * `data-tutorial-signout` below, and the teardown in `_authenticated`.
 */
function NewDay() {
  const router = useRouter()

  const { data: game } = trpc.admin.game.get.useQuery()
  const gameId = game?.id

  // The scheduler announces the end of the run, so the usual way off this page
  // is a socket event rather than a poll. The poll stays, a little slower than
  // it was, for the reconnect that misses it and for the progress bar, which
  // has nothing to push it along — and in the background, because the player
  // who wandered off is exactly the one who should come back to a live game.
  const { data: state } = useNightlyState(gameId, () => 5_000)

  // Back to the game the moment the update finishes. `replace` so the update
  // screen is not somewhere the back button can return to.
  useEffect(() => {
    if (state && state.status !== "RUNNING") {
      void router.navigate({ to: "/dashboard", replace: true })
    }
  }, [state, router])

  async function handleSignOut() {
    endClientSession()
    await authClient.signOut()
    await router.invalidate()
    void router.navigate({ to: "/" })
  }

  const progress = state?.progress
  const pct = progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : null

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <Moon className="mx-auto mb-4 size-10 animate-pulse text-chart-1" />

        <h1 className="font-serif text-2xl font-semibold text-foreground">A new day is beginning</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please wait for a new day to begin.
        </p>

        {pct !== null && progress && (
          <div className="mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-chart-1 transition-[width] duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {progress.completed.toLocaleString()} of {progress.total.toLocaleString()} animals
              {state?.estimatedCompletionAt && (
                <>
                  {" · done around "}
                  {new Date(state.estimatedCompletionAt).toLocaleTimeString(undefined, { timeStyle: "short" })}
                </>
              )}
            </p>
          </div>
        )}

        {pct === null && (
          <p className="mt-6 text-xs text-muted-foreground">Getting started…</p>
        )}

        <Button
          data-tutorial-signout
          variant="ghost"
          size="sm"
          className="mt-8 text-muted-foreground"
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
