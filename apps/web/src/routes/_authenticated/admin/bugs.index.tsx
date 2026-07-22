import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/bugs/")({
  component: OpsBugs,
})

const SEVERITY_COLORS: Record<string, string> = {
  GAME_BREAKING: "bg-destructive/10 text-destructive border-destructive/30",
  MAJOR: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  MINOR: "bg-muted text-muted-foreground border-border",
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-foreground",
  CONFIRMED: "text-primary",
  IN_PROGRESS: "text-chart-1",
  RESOLVED: "text-chart-2",
  CLOSED: "text-muted-foreground",
}

function OpsBugs() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const [exploitsOnly, setExploitsOnly] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<"MINOR" | "MAJOR" | "GAME_BREAKING" | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CONFIRMED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | undefined>(undefined)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.admin.ops.bugs.list.useInfiniteQuery(
    { gameId: gameId!, severity: severityFilter, status: statusFilter, exploitsOnly: exploitsOnly || undefined, limit: 50 },
    { enabled: !!gameId, getNextPageParam: (last) => last.nextCursor },
  )

  const reports = data?.pages.flatMap(p => p.reports) ?? []

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Bug Reports</h1>
        <span className="text-sm text-muted-foreground">{reports.length} shown</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={severityFilter ?? ""}
          onChange={e => setSeverityFilter((e.target.value || undefined) as typeof severityFilter)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All severities</option>
          <option value="GAME_BREAKING">Game Breaking</option>
          <option value="MAJOR">Major</option>
          <option value="MINOR">Minor</option>
        </select>
        <select
          value={statusFilter ?? ""}
          onChange={e => setStatusFilter((e.target.value || undefined) as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exploitsOnly}
            onChange={e => setExploitsOnly(e.target.checked)}
            className="rounded border-border"
          />
          Exploits only
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Severity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Category</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Votes</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reporter</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">
                  {r.isExploit && <span className="mr-1.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-bold text-destructive">EXPLOIT</span>}
                  {r.title}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", SEVERITY_COLORS[r.severity])}>
                    {r.severity.replace("_", " ")}
                  </span>
                </td>
                <td className={cn("px-3 py-2 text-xs font-medium", STATUS_COLORS[r.status])}>
                  {r.status.replace("_", " ")}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.category}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r._count.upvotes}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.author.username}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/admin/bugs/$bugId"
                    params={{ bugId: r.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">No reports found.</td></tr>
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
