import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  component: OpsBroadcast,
})

function OpsBroadcast() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: players } = trpc.admin.ops.players.list.useInfiniteQuery(
    { gameId: gameId!, limit: 100 },
    { enabled: !!gameId, getNextPageParam: (last) => last.nextCursor },
  )

  const sendMutation = trpc.admin.ops.broadcast.send.useMutation({
    onSuccess: (res) => {
      setSent(res.sent)
      setBody("")
      setTargetMode("all")
    },
  })

  const [fromAccountId, setFromAccountId] = useState("")
  const [body, setBody] = useState("")
  const [targetMode, setTargetMode] = useState<"all" | "custom">("all")
  const [customTargets, setCustomTargets] = useState("")
  const [sent, setSent] = useState<number | null>(null)

  const allPlayers = players?.pages.flatMap(p => p.players) ?? []

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  function handleSend() {
    if (!gameId || !fromAccountId || !body.trim()) return
    const targets = targetMode === "custom"
      ? customTargets.split(",").map(s => s.trim()).filter(Boolean)
      : undefined
    sendMutation.mutate({ gameId, fromPlayerAccountId: fromAccountId, body, targetPlayerAccountIds: targets, staffUserId: "CURRENT_USER" })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">Broadcast</h1>
      <p className="text-sm text-muted-foreground">
        Send direct messages from the system game account (shop, campaign studs, raffles) to players. Uses existing DM threads.
      </p>

      {sent !== null && (
        <div className="rounded-lg border border-chart-2/30 bg-chart-2/5 px-4 py-3 text-sm font-medium text-chart-2">
          Message sent to {sent} player{sent !== 1 ? "s" : ""}.
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">From Account (system account player ID)</label>
          <select
            value={fromAccountId}
            onChange={e => setFromAccountId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Select sender…</option>
            {allPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.username}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Recipients</label>
          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="target" checked={targetMode === "all"} onChange={() => setTargetMode("all")} />
              All active players
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="target" checked={targetMode === "custom"} onChange={() => setTargetMode("custom")} />
              Specific players
            </label>
          </div>
          {targetMode === "custom" && (
            <textarea
              value={customTargets}
              onChange={e => setCustomTargets(e.target.value)}
              placeholder="Comma-separated player account IDs…"
              rows={3}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary resize-none"
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={6}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={!fromAccountId || !body.trim() || sendMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sendMutation.isPending ? "Sending…" : targetMode === "all" ? "Send to All Players" : "Send to Selected"}
          </button>
          {targetMode === "all" && (
            <span className="text-xs text-muted-foreground">This will create or update a DM thread with every player in the game.</span>
          )}
        </div>
      </div>
    </div>
  )
}
