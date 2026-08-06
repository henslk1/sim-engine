import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"

export const Route = createFileRoute("/_authenticated/support-tickets/")({
  component: SupportTicketsPage,
})

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", CLOSED: "Closed",
}
const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General", EXPLOIT: "Exploit", BILLING: "Billing",
  ACCOUNT: "Account", APPEAL: "Appeal", DISPUTE: "Dispute",
}

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
function statusClass(s: string) {
  if (s === "CLOSED") return "bg-chart-2/15 text-chart-2 ring-chart-2/30"
  if (s === "IN_PROGRESS") return "bg-accent/15 text-accent-foreground ring-accent/30"
  return "bg-primary/10 text-primary ring-primary/20"
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function SupportTicketsPage() {
  const navigate = useNavigate()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data: tickets, isLoading } = trpc.supportTicket.list.useQuery(
    { gameId },
    { enabled: !!gameId }
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Support Tickets</h1>
        <Link to="/support-tickets/new">
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            New Ticket
          </button>
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && !tickets?.length && (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">You have no support tickets.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {tickets?.map(ticket => (
          <div
            key={ticket.id}
            onClick={() => navigate({ to: "/support-tickets/$ticketId", params: { ticketId: ticket.id } })}
            className="cursor-pointer rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-foreground leading-snug">{ticket.subject}</span>
              <span className={`${badgeBase} ${statusClass(ticket.status)} shrink-0`}>
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
              <span>·</span>
              <span>{ticket._count.messages} {ticket._count.messages === 1 ? "message" : "messages"}</span>
              <span>·</span>
              <span>Updated {fmt(ticket.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
