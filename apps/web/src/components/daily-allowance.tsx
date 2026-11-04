import { useEffect, useRef, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { trpc, trpcVanilla } from "@/lib/trpc"
import { createDailyVisitRunner, type DailyVisitRunner } from "@/lib/daily-visit"
import { Gift, X } from "lucide-react"

/**
 * The daily allowance, claimed and then announced.
 *
 * Mounted once in the authenticated layout. The decision of *when* to ask lives
 * in `lib/daily-visit.ts`, away from React, because the interesting part is a
 * sequence of events over time and that is not something a component can be
 * asked about. This file is the wiring: which browser events become which
 * reason, and what to do with an answer.
 *
 * The banner only appears on the visit that actually claimed something, which
 * is at most once a day and is the only moment a player's balance moves without
 * them having done anything. Granting silently would leave them to notice the
 * number had changed and wonder what they had spent.
 */

type Grant = {
  currencies: { currencyDefId: string; name: string; symbol: string | null; amount: number }[]
  items: { itemDefId: string; name: string; quantity: number }[]
}

type VisitResult = { claimed: boolean; granted: Grant } | null

export function DailyAllowance() {
  const { data: game } = trpc.admin.game.get.useQuery()
  const gameId = game?.id
  const utils = trpc.useUtils()
  const location = useLocation()

  const [granted, setGranted] = useState<Grant | null>(null)
  const runnerRef = useRef<DailyVisitRunner | null>(null)

  // The nightly state the banner already keeps. Another observer of the same
  // query key shares its cache and its refetching, so watching the update end
  // costs no extra requests.
  const { data: nightly } = trpc.game.nightlyState.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  // One runner for the life of the layout, built when the game's id arrives.
  useEffect(() => {
    if (!gameId) return

    const runner = createDailyVisitRunner<VisitResult>({
      visit: () => trpcVanilla.player.visit.mutate({ gameId }),
      onResult: (result) => {
        if (!result?.claimed) return

        // The balance in the header and anything showing inventory are stale.
        void utils.player.balances.invalidate()
        void utils.inventory.mine.invalidate()

        const { currencies, items } = result.granted
        if (currencies.length === 0 && items.length === 0) return
        setGranted(result.granted)
      },
      // Nothing to tell the player. The usual refusal is the nightly, which
      // shuts the game to every write, and the day this would have claimed is
      // still unclaimed afterwards - the retry or the update ending collects it.
      onFailure: () => {},
    })

    runnerRef.current = runner
    runner.trigger("opened")

    return () => {
      runner.stop()
      runnerRef.current = null
    }
  }, [gameId, utils])

  // A tab focused into a day it has not seen. Both events, because a browser
  // gives one, the other, or both depending on how the tab came back; the
  // runner collapses them.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") runnerRef.current?.trigger("focused")
    }
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    return () => {
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
    }
  }, [])

  // Moving around the game. Most of these are dropped by the quiet window; the
  // one that matters is the walk back from the nightly's waiting page, which
  // usually arrives after a long gap.
  useEffect(() => {
    runnerRef.current?.trigger("navigated")
  }, [location.pathname])

  // The update finishing. `useRef` rather than comparing against the render
  // before, because this has to fire on the transition and not on every render
  // that happens to follow it.
  const wasRunning = useRef(false)
  useEffect(() => {
    const running = nightly?.status === "RUNNING"
    if (wasRunning.current && !running) runnerRef.current?.trigger("update-finished")
    wasRunning.current = running
  }, [nightly?.status])

  if (!granted) return null

  const parts = [
    ...granted.currencies.map((c) => `${c.amount.toLocaleString()} ${c.name}`),
    ...granted.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)),
  ]

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-foreground"
    >
      <Gift className="size-4 shrink-0 text-primary" />
      <span>
        Welcome back — your daily allowance:{" "}
        <span className="font-semibold">{parts.join(", ")}</span>
      </span>
      <button
        type="button"
        onClick={() => setGranted(null)}
        aria-label="Dismiss"
        className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
