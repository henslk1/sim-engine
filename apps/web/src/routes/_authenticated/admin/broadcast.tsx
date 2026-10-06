import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  component: OpsBroadcast,
})

function OpsBroadcast() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const sendMutation = trpc.messaging.admin.broadcastAnnouncement.useMutation({
    onSuccess: () => {
      setSent(true)
      setBody("")
    },
  })

  const [body, setBody] = useState("")
  const [sent, setSent] = useState(false)

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  function handleSend() {
    if (!gameId || !body.trim()) return
    sendMutation.mutate({ gameId, content: body })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">Broadcast</h1>
      <p className="text-sm text-muted-foreground">
        Post an announcement from the game itself. It appears immediately in the configured announcement channel for this game's server.
      </p>

      {sent && (
        <div className="rounded-lg border border-chart-2/30 bg-chart-2/5 px-4 py-3 text-sm font-medium text-chart-2">
          Announcement posted.
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
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
            disabled={!body.trim() || sendMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sendMutation.isPending ? "Posting…" : "Post Announcement"}
          </button>
          <span className="text-xs text-muted-foreground">Visible to everyone who can view the announcement channel.</span>
        </div>
      </div>
    </div>
  )
}
