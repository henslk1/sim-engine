import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { ChevronLeft, Loader2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/support-tickets/$ticketId")({
  component: TicketPage,
})

type Ticket = RouterOutputs["supportTicket"]["get"]
type Message = Ticket["messages"][number]

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", CLOSED: "Closed",
}
const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General", EXPLOIT: "Exploit / Cheating", BILLING: "Billing",
  ACCOUNT: "Account Access", APPEAL: "Ban / Warning Appeal", DISPUTE: "Trade Dispute",
}

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
function statusClass(s: string) {
  if (s === "CLOSED") return "bg-chart-2/15 text-chart-2 ring-chart-2/30"
  if (s === "IN_PROGRESS") return "bg-accent/15 text-accent-foreground ring-accent/30"
  return "bg-primary/10 text-primary ring-primary/20"
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{message.author.name ?? "Support"}</span>
        <span className="text-[11px] text-muted-foreground">{fmt(message.createdAt)}</span>
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap">{message.body}</p>
    </div>
  )
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
      <Link to="/support-tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" /> Support Tickets
      </Link>

      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="font-serif text-xl font-semibold text-foreground leading-snug">{ticket.subject}</h1>
        <span className={`${badgeBase} ${statusClass(ticket.status)} shrink-0 mt-1`}>
          {STATUS_LABELS[ticket.status] ?? ticket.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-6">
        <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
        <span>·</span>
        <span>Opened {fmt(ticket.createdAt)}</span>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Your Message</p>
        <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.body}</p>
      </div>

      {ticket.messages.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          <h2 className="font-serif text-base font-semibold text-foreground mb-1">Replies</h2>
          {ticket.messages.map(m => <MessageBubble key={m.id} message={m} />)}
        </div>
      )}

      {isClosed ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground text-center">
          This ticket is closed.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Add a Reply</p>
          <textarea
            placeholder="Provide additional details..."
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
          />
          {replyMutation.error && <p className="text-sm text-destructive mb-2">{replyMutation.error.message}</p>}
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
      )}
    </div>
  )
}
