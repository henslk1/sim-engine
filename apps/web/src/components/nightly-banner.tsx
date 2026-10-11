import { useEffect, useState } from "react"
import { useLocation, useRouter } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { AlertTriangle } from "lucide-react"

/**
 * The run-up to the nightly, and the door closing when it starts.
 *
 * Polled rather than pushed. A socket event arrives sooner but it is also
 * missable — a refresh, a reconnect, a second tab — and the plan is explicit
 * that the schedule in the database stays authoritative and must be readable
 * over HTTP for exactly that reason. The countdown is computed here from an
 * instant the server sent, so a sleeping tab or a slow response cannot leave a
 * clock running behind: it recalculates from the real time every second.
 */

const SECOND = 1000

function formatCountdown(ms: number): string {
  if (ms <= 0) return "any moment"
  const total = Math.floor(ms / SECOND)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function NightlyBanner() {
  const router = useRouter()
  const location = useLocation()

  const { data: game } = trpc.admin.game.get.useQuery()
  const gameId = game?.id

  const { data: state } = trpc.game.nightlyState.useQuery(
    { gameId: gameId! },
    {
      enabled: !!gameId,
      // Often enough that the door shuts promptly, rarely enough to be free.
      // The countdown itself does not depend on this — it ticks locally.
      refetchInterval: (query) => (query.state.data?.status === "WARNING" ? 10_000 : 30_000),
      refetchIntervalInBackground: true,
    },
  )

  // A local clock, so the countdown is smooth between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (state?.status !== "WARNING") return
    const timer = setInterval(() => setNow(Date.now()), SECOND)
    return () => clearInterval(timer)
  }, [state?.status])

  const onNewDay = location.pathname === "/new-day"

  // The update has started: everything stops. The server refuses gameplay
  // mutations regardless — this is the courtesy that stops a player meeting
  // that as an error on a page that looks like it should work.
  useEffect(() => {
    if (state?.status === "RUNNING" && !onNewDay) {
      void router.navigate({ to: "/new-day", replace: true })
    }
  }, [state?.status, onNewDay, router])

  if (!state || state.status !== "WARNING" || !state.nextNightlyAt) return null

  const remaining = new Date(state.nextNightlyAt).getTime() - now

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/15 px-4 py-1.5 text-sm text-destructive backdrop-blur-sm"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span>
        A new day begins in{" "}
        <span className="font-semibold tabular-nums">{formatCountdown(remaining)}</span>
      </span>
    </div>
  )
}
