import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import type { ReactNode } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { ChevronLeft, Loader2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/bug-reports/$reportId")({
  component: ReportPage,
})

type Report = RouterOutputs["bugReport"]["get"]["report"]
type Comment = Report["comments"][number]

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
const badgeTones: Record<string, string> = {
  default: "bg-primary/10 text-primary ring-primary/20",
  muted: "bg-muted text-muted-foreground ring-border",
  accent: "bg-accent/15 text-accent-foreground ring-accent/30",
  success: "bg-chart-2/15 text-chart-2 ring-chart-2/30",
  danger: "bg-destructive/12 text-destructive ring-destructive/30",
}
function Badge({ tone, children }: { tone: string; children: string }) {
  return <span className={`${badgeBase} ${badgeTones[tone] ?? badgeTones.default}`}>{children}</span>
}
function severityTone(s: string) {
  if (s === "GAME_BREAKING") return "danger"
  if (s === "MAJOR") return "accent"
  return "muted"
}
function statusTone(s: string) {
  if (s === "RESOLVED" || s === "NOT_A_BUG" || s === "CLOSED") return "success"
  if (s === "NEEDS_MORE_INFO") return "accent"
  return "default"
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", CONFIRMED: "Confirmed", IN_PROGRESS: "In Progress",
  NEEDS_MORE_INFO: "Needs More Info", RESOLVED: "Resolved",
  NOT_A_BUG: "Not a Bug", CLOSED: "Closed",
}
const CATEGORY_LABELS: Record<string, string> = {
  VISUAL: "Visual", TEXT: "Text", UI: "UI",
  GAMEPLAY: "Gameplay", ECONOMY: "Economy", PERFORMANCE: "Performance",
}
const SEVERITY_LABELS: Record<string, string> = {
  MINOR: "Minor", MAJOR: "Major", GAME_BREAKING: "Game Breaking",
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{title}</h3>
      {children}
    </div>
  )
}

function CommentCard({ comment }: { comment: Comment }) {
  if (comment.isMergedReport) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Merged Report</p>
        <p className="text-sm text-foreground whitespace-pre-wrap">{comment.body}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{comment.author.username} · {fmt(comment.createdAt)}</p>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{comment.author.username}</span>
        <span className="text-[11px] text-muted-foreground">{fmt(comment.createdAt)}</span>
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap">{comment.body}</p>
    </div>
  )
}

function ReportPage() {
  const { reportId } = Route.useParams()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data, isLoading, refetch } = trpc.bugReport.get.useQuery(
    { gameId, reportId },
    { enabled: !!gameId }
  )

  const [commentBody, setCommentBody] = useState("")

  const upvoteMutation = trpc.bugReport.toggleUpvote.useMutation({
    onSuccess: () => refetch(),
  })
  const commentMutation = trpc.bugReport.comment.useMutation({
    onSuccess: () => { setCommentBody(""); refetch() },
  })

  if (isLoading || !gameId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Report not found.</div>

  const { report, hasUpvoted } = data

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/bug-reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" /> Bug Reports
      </Link>

      <div className="flex items-start justify-between gap-3 mb-3">
        <h1 className="font-serif text-xl font-semibold text-foreground leading-snug">{report.title}</h1>
        <span className="shrink-0 font-mono text-xs text-muted-foreground mt-1">#{report.id.slice(-8)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge tone="muted">{CATEGORY_LABELS[report.category] ?? report.category}</Badge>
        <Badge tone={severityTone(report.severity)}>{SEVERITY_LABELS[report.severity] ?? report.severity}</Badge>
        <Badge tone={statusTone(report.status)}>{STATUS_LABELS[report.status] ?? report.status}</Badge>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-6">
        <span>Reported by <span className="text-foreground">{report.author.username}</span></span>
        <span>·</span>
        <span>{fmt(report.createdAt)}</span>
        {report.claimedBy && (
          <>
            <span>·</span>
            <span>Handled by <span className="text-foreground">{report.claimedBy.name}</span></span>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-5 mb-4">
        <Section title="Description">
          <p className="text-sm text-foreground whitespace-pre-wrap">{report.description}</p>
        </Section>
        <Section title="Expected Outcome">
          <p className="text-sm text-foreground whitespace-pre-wrap">{report.expectedOutcome}</p>
        </Section>
        <Section title="Steps to Reproduce">
          <p className="text-sm text-foreground whitespace-pre-wrap">{report.stepsToReproduce}</p>
        </Section>
        {report.errorMessages && (
          <Section title="Error Messages">
            <pre className="text-sm text-foreground whitespace-pre-wrap bg-muted rounded px-2 py-1.5 font-mono">{report.errorMessages}</pre>
          </Section>
        )}
        <Section title="Page URL">
          <p className="text-sm text-foreground break-all">{report.pageUrl}</p>
        </Section>
      </div>

      {report.adminNote && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 mb-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-accent-foreground mb-1">Staff Note</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{report.adminNote}</p>
        </div>
      )}

      <button
        onClick={() => upvoteMutation.mutate({ gameId, reportId })}
        disabled={upvoteMutation.isPending}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors mb-8 ${
          hasUpvoted
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
        }`}
      >
        ↑ I'm experiencing this bug
        <span className="text-xs opacity-70">{report._count.upvotes}</span>
      </button>

      <div>
        <h2 className="font-serif text-base font-semibold text-foreground mb-3">
          Comments <span className="text-sm font-normal text-muted-foreground">({report._count.comments})</span>
        </h2>
        <div className="flex flex-col gap-2 mb-4">
          {report.comments.length === 0
            ? <p className="text-sm text-muted-foreground">No comments yet.</p>
            : report.comments.map(c => <CommentCard key={c.id} comment={c} />)
          }
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <textarea
            placeholder="Add a comment..."
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
          />
          <div className="flex justify-end">
            <button
              onClick={() => commentMutation.mutate({ gameId, reportId, body: commentBody })}
              disabled={commentMutation.isPending || !commentBody.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {commentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post Comment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}