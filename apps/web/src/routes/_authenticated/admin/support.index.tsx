import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/support/")({
  component: OpsSupport,
})

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-chart-1/10 text-chart-1 border-chart-1/30",
  IN_PROGRESS: "bg-primary/10 text-primary border-primary/30",
  RESOLVED: "bg-chart-2/10 text-chart-2 border-chart-2/30",
  CLOSED: "bg-muted text-muted-foreground border-border",
}

function OpsSupport() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | undefined>(undefined)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.admin.ops.support.list.useInfiniteQuery(
    { gameId: gameId!, status: statusFilter, limit: 50 },
    { enabled: !!gameId, getNextPageParam: (last) => last.nextCursor },
  )

  const tickets = data?.pages.flatMap(p => p.tickets) ?? []

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Support Tickets</h1>
        <select
          value={statusFilter ?? ""}
          onChange={e => setStatusFilter((e.target.value || undefined) as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Player</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Messages</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Opened</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">
                  {t.jobContractId && <span className="mr-1.5 rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">DISPUTE</span>}
                  {t.subject}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{t.playerAccount.username}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLORS[t.status])}>
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{t._count.messages}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/admin/support/$ticketId"
                    params={{ ticketId: t.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No tickets found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  )
}
