import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/bugs/$bugId")({
  component: BugDetail,
})

const SEVERITY_COLORS: Record<string, string> = {
  GAME_BREAKING: "bg-destructive/10 text-destructive border-destructive/30",
  MAJOR: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  MINOR: "bg-muted text-muted-foreground border-border",
}

function BugDetail() {
  const { bugId } = Route.useParams()
  const { data, refetch } = trpc.admin.ops.bugs.getById.useQuery({ reportId: bugId })
  const setStatusMutation = trpc.admin.ops.bugs.setStatus.useMutation({ onSuccess: () => refetch() })
  const setExploitMutation = trpc.admin.ops.bugs.setExploit.useMutation({ onSuccess: () => refetch() })
  const addCommentMutation = trpc.admin.ops.bugs.addComment.useMutation({ onSuccess: () => { refetch(); setCommentBody("") } })
  const [commentBody, setCommentBody] = useState("")

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-6">
      <Link to="/admin/bugs" className="text-xs text-muted-foreground hover:text-foreground">← All reports</Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", SEVERITY_COLORS[data.severity])}>
            {data.severity.replace("_", " ")}
          </span>
          {data.isExploit && (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">EXPLOIT</span>
          )}
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{data.category}</span>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{data._count.upvotes} votes</span>
        </div>
        <h1 className="font-serif text-xl font-semibold text-foreground">{data.title}</h1>
        <p className="text-sm text-muted-foreground">
          by {data.author.username} · {new Date(data.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm whitespace-pre-wrap">{data.body}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Status:</label>
          <select
            value={data.status}
            onChange={e => setStatusMutation.mutate({ reportId: bugId, status: e.target.value as never, staffUserId: "CURRENT_USER" })}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          >
            <option value="OPEN">Open</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <button
          onClick={() => setExploitMutation.mutate({ reportId: bugId, isExploit: !data.isExploit, staffUserId: "CURRENT_USER" })}
          className={cn(
            "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
            data.isExploit
              ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
        >
          {data.isExploit ? "Remove Exploit Flag" : "Flag as Exploit"}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Comments ({data.comments.length})
        </h2>
        {data.comments.map(c => {
          const isStaff = c.author.user.staffRoles.length > 0
          return (
            <div key={c.id} className={cn("rounded-lg border p-3", isStaff ? "border-primary/20 bg-primary/5" : "border-border bg-card")}>
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{c.author.username}</span>
                {isStaff && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{c.author.user.staffRoles[0]?.role}</span>}
                <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          )
        })}

        <div className="space-y-2">
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            placeholder="Add a staff comment…"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
          <button
            onClick={() => addCommentMutation.mutate({ bugReportId: bugId, authorId: "CURRENT_PLAYER_ACCOUNT", body: commentBody })}
            disabled={!commentBody.trim() || addCommentMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Post Comment
          </button>
        </div>
      </div>
    </div>
  )
}
