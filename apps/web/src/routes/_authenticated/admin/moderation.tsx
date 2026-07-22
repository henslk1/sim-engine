import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: OpsModeration,
})

const REPORT_TYPE_LABELS: Record<string, string> = {
  PLAYER: "Player",
  ANIMAL: "Animal",
  GROUP: "Group",
  FORUM_POST: "Forum Post",
  FORUM_THREAD: "Forum Thread",
  CHAT_MESSAGE: "Chat Message",
  DIRECT_MESSAGE: "Direct Message",
  MARKETPLACE_LISTING: "Listing",
}

function OpsModeration() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "REVIEWED" | "DISMISSED" | undefined>(undefined)
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)
  const [adminNote, setAdminNote] = useState("")
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = trpc.admin.ops.moderation.list.useInfiniteQuery(
    { gameId: gameId!, status: statusFilter, reportType: typeFilter as never, limit: 50 },
    { enabled: !!gameId, getNextPageParam: (last) => last.nextCursor },
  )

  const reviewMutation = trpc.admin.ops.moderation.review.useMutation({
    onSuccess: () => { refetch(); setReviewingId(null); setAdminNote("") },
  })

  const reports = data?.pages.flatMap(p => p.reports) ?? []

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Moderation Queue</h1>
        <span className="text-sm text-muted-foreground">{reports.length} shown</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter ?? ""}
          onChange={e => setStatusFilter((e.target.value || undefined) as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <select
          value={typeFilter ?? ""}
          onChange={e => setTypeFilter(e.target.value || undefined)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All types</option>
          {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {reports.map(r => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{REPORT_TYPE_LABELS[r.reportType] ?? r.reportType}</span>
                  <span className={cn(
                    "font-semibold",
                    r.status === "PENDING" ? "text-chart-1" : r.status === "REVIEWED" ? "text-chart-2" : "text-muted-foreground"
                  )}>{r.status}</span>
                  <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm font-medium">
                  {r.reporterPlayer?.username ?? "Unknown"} reported{" "}
                  {r.reportedPlayer
                    ? <Link to="/admin/players/$playerId" params={{ playerId: r.reportedPlayer.id }} className="text-primary hover:underline">{r.reportedPlayer.username}</Link>
                    : "content"}
                </p>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
              </div>
              {r.status === "PENDING" && reviewingId !== r.id && (
                <button
                  onClick={() => setReviewingId(r.id)}
                  className="shrink-0 rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
                >
                  Review
                </button>
              )}
            </div>

            {reviewingId === r.id && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Admin note (optional)"
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => reviewMutation.mutate({ reportId: r.id, status: "REVIEWED", adminNote: adminNote || undefined, reviewedByPlayerId: "CURRENT_PLAYER_ACCOUNT" })}
                    disabled={reviewMutation.isPending}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    onClick={() => reviewMutation.mutate({ reportId: r.id, status: "DISMISSED", adminNote: adminNote || undefined, reviewedByPlayerId: "CURRENT_PLAYER_ACCOUNT" })}
                    disabled={reviewMutation.isPending}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => { setReviewingId(null); setAdminNote("") }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
                {r.reportedPlayer && (
                  <p className="text-xs text-muted-foreground">
                    To take action against this player, visit{" "}
                    <Link to="/admin/players/$playerId" params={{ playerId: r.reportedPlayer.id }} className="text-primary hover:underline">
                      {r.reportedPlayer.username}'s profile
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {reports.length === 0 && (
          <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">No reports found.</p>
        )}
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
