import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: OpsAudit,
})

const TARGET_TYPES = ["PlayerAccount", "User", "Animal", "SupportTicket", "BugReport", "IpAddress", "LiveOpsEvent", "Broadcast", "GameConfig"]

function OpsAudit() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const [targetTypeFilter, setTargetTypeFilter] = useState("")
  const [staffFilter, setStaffFilter] = useState("")

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.admin.ops.audit.list.useInfiniteQuery(
    { gameId: gameId!, targetType: targetTypeFilter || undefined, staffUserId: staffFilter || undefined, limit: 50 },
    { enabled: !!gameId, getNextPageParam: (last) => last.nextCursor },
  )

  const logs = data?.pages.flatMap(p => p.logs) ?? []

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  return (
    <div className="space-y-4 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">Audit Log</h1>

      <div className="flex flex-wrap gap-3">
        <select
          value={targetTypeFilter}
          onChange={e => setTargetTypeFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All target types</option>
          {TARGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={staffFilter}
          onChange={e => setStaffFilter(e.target.value)}
          placeholder="Filter by staff user ID…"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Staff</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Target</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Target ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{log.user.name ?? log.user.email}</td>
                <td className="px-3 py-2 font-mono text-xs">{log.action}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{log.targetType}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate max-w-32">{log.targetId}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No audit log entries.</td></tr>
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
