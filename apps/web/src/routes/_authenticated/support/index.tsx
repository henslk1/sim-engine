import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { Loader2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/support/")({
  component: SupportPage,
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
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function SupportPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""
  const { data: tickets, isLoading } = trpc.supportTicket.list.useQuery(
    { gameId },
    { enabled: !!gameId }
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your open tickets or submit a new one.</p>
        </div>
        <Link to="/support/new">
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            New Ticket
          </button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!tickets || tickets.length === 0) && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No support tickets yet.</p>
          <Link to="/support/new" className="mt-3 inline-block text-sm text-primary hover:underline">
            Submit your first ticket
          </Link>
        </div>
      )}

      {tickets && tickets.length > 0 && (
        <div className="flex flex-col gap-2">
          {tickets.map(t => (
            <Link
              key={t.id}
              to="/support/$ticketId"
              params={{ ticketId: t.id }}
              className="block rounded-lg border border-border bg-card p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-snug">{t.subject}</span>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${STATUS_COLORS[t.status] ?? STATUS_COLORS.OPEN}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                <span>·</span>
                <span>{t._count.messages} {t._count.messages === 1 ? "message" : "messages"}</span>
                <span>·</span>
                <span>{fmt(t.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
