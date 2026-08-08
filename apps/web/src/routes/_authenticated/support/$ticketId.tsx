import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { ChevronLeft, Loader2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/support/$ticketId")({
  component: TicketPage,
})

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-primary/10 text-primary ring-primary/20",
  IN_PROGRESS: "bg-chart-3/15 text-chart-3 ring-chart-3/30",
  RESOLVED: "bg-chart-2/15 text-chart-2 ring-chart-2/30",
  CLOSED: "bg-muted text-muted-foreground ring-border",
}

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General", EXPLOIT: "Exploit", BILLING: "Billing",
  ACCOUNT: "Account", APPEAL: "Appeal", DISPUTE: "Dispute",
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

function TicketPage() {
  const { ticketId } = Route.useParams()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data: ticket, isLoading, refetch } = trpc.supportTicket.get.useQuery(
    { gameId, ticketId },
    { enabled: !!gameId }
  )

  const [replyBody, setReplyBody] = useState("")
  const replyMutation = trpc.supportTicket.reply.useMutation({
    onSuccess: () => { setReplyBody(""); refetch() },
  })

  if (isLoading || !gameId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ticket) return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Ticket not found.</div>

  const isClosed = ticket.status === "CLOSED"

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/support" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" /> Support
      </Link>

      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="font-serif text-xl font-semibold text-foreground leading-snug">{ticket.subject}</h1>
        <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 mt-1 ${STATUS_COLORS[ticket.status] ?? STATUS_COLORS.OPEN}`}>
          {ticket.status.replace("_", " ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-6">
        <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
        <span>·</span>
        <span>Opened {fmt(ticket.createdAt)}</span>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.body}</p>
      </div>

      {ticket.messages.length > 0 && (
        <div className="mb-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Messages ({ticket.messages.length})
          </h2>
          {ticket.messages.map(m => (
            <div key={m.id} className="rounded-md border border-border bg-card px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{m.author.name ?? "Support"}</span>
                <span className="text-[11px] text-muted-foreground">{fmt(m.createdAt)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
      )}

      {!isClosed ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <textarea
            placeholder="Reply to this ticket…"
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
          />
          <div className="flex justify-end">
            <button
              onClick={() => replyMutation.mutate({ gameId, ticketId, body: replyBody })}
              disabled={replyMutation.isPending || !replyBody.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {replyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send Reply"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-4">This ticket is closed.</p>
      )}
    </div>
  )
}
