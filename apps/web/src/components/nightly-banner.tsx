import { useEffect, useState } from "react"
import { useLocation, useRouter } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useNightlyState } from "@/lib/nightly"
import { AlertTriangle } from "lucide-react"

/**
 * The run-up to the nightly, and the door closing when it starts.
 *
 * Pushed *and* polled. The socket event shortens the wait when the door shuts;
 * the poll below is what makes a missed event survivable, and the schedule in
 * the database stays the thing both of them end at — see `useNightlyState`,
 * which holds the three-way arrangement. The countdown is computed here from an
 * instant the server sent, so a sleeping tab or a slow response cannot leave a
 * clock running behind: it recalculates from the real time every second.
 */

const SECOND = 1000

/** How often to look while the warning is up and the door is about to shut. */
const WARNING_POLL_MS = 10 * SECOND

/** The longest to go without checking, however far away the nightly is. */
const IDLE_POLL_MS = 10 * 60 * SECOND

/**
 * When to ask the server again.
 *
 * This used to be every thirty seconds, forever, in every open tab, including
 * backgrounded ones. That is 120 requests an hour from somebody who has wandered
 * off — and on a database billed for the hours it is awake, one forgotten tab is
 * enough to keep it awake all night. The scheduler was taught to sleep; this had
 * to learn the same thing or it would simply take over the job of keeping the
 * lights on.
 *
 * It can afford to: the server already says when the warning window opens, and
 * the countdown runs locally from an instant rather than from polling. So when
 * the nightly is twenty hours away there is nothing to find out, and the next
 * check can be timed to land on the warning rather than to catch it by
 * repetition.
 */
function pollInterval(state: { status: string; warningStartsAt: Date | string | null } | undefined): number {
  if (!state) return 30 * SECOND
  // Running is a transient state the banner reacts to by navigating away, so
  // it is worth catching quickly; so is the warning, which ends in a lockout.
  if (state.status === "RUNNING") return 5 * SECOND
  if (state.status === "WARNING") return WARNING_POLL_MS

  if (!state.warningStartsAt) return IDLE_POLL_MS

  const until = new Date(state.warningStartsAt).getTime() - Date.now()
  // Aim at the warning rather than past it, but never busier than every thirty
  // seconds and never quieter than the ceiling.
  return Math.min(IDLE_POLL_MS, Math.max(30 * SECOND, until))
}

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

  // The cadence below is unchanged, but its job is not: it is the floor under
  // a missed event now, rather than the only way the door is noticed closing.
  // The countdown never depended on it — it ticks locally from `nextNightlyAt`.
  const { data: state } = useNightlyState(gameId, pollInterval)

  // A local clock, so the countdown is smooth between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (state?.status !== "WARNING") return
    const timer = setInterval(() => setNow(Date.now()), SECOND)
    return () => clearInterval(timer)
  }, [state?.status])

  const onNewDay = location.pathname === "/new-day"

  /**
   * Administration keeps working, because this is when it is needed.
   *
   * `isExempt` on the server lets every `admin.*` mutation through an update
   * on purpose — a stuck nightly is exactly when staff need their recovery
   * controls — and this redirect was quietly taking that away again: it fired
   * on every authenticated route, so a member of staff opening the operations
   * console mid-update was bounced to the waiting page with the controls on
   * the other side of it. The route itself is already gated; `_authenticated`
   * sends anybody without a staff role to the dashboard before this runs.
   */
  const onAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/")

  // The update has started: everything else stops. The server refuses gameplay
  // mutations regardless — this is the courtesy that stops a player meeting
  // that as an error on a page that looks like it should work.
  useEffect(() => {
    if (state?.status === "RUNNING" && !onNewDay && !onAdmin) {
      void router.navigate({ to: "/new-day", replace: true })
    }
  }, [state?.status, onNewDay, onAdmin, router])

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
