import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"

export const Route = createFileRoute("/_authenticated/bug-reports/")({
  validateSearch: z.object({
    tab: z.enum(["pending", "fixed", "mine"]).optional(),
    category: z.enum(["VISUAL", "TEXT", "UI", "GAMEPLAY", "ECONOMY", "PERFORMANCE"]).optional(),
    severity: z.enum(["MINOR", "MAJOR", "GAME_BREAKING"]).optional(),
    search: z.string().optional()
  }),
  component: BugReportsPage,
})

type ReportItem = RouterOutputs["bugReport"]["list"]["reports"][number]

const CATEGORIES = [
  { value: "VISUAL" , label: "Visual" },
  { value: "TEXT", label: "Text" },
  { value: "UI", label: "UI" },
  { value: "GAMEPLAY", label: "Gameplay" },
  { value: "ECONOMY", label: "Economy" },
  { value: "PERFORMANCE", label: "Performance" },
] as const

const SEVERITIES = [
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "GAME_BREAKING", label: "Game Breaking" },
] as const

const TABS = [
  { id: undefined, label: "Home" },
  { id: "pending", label: "Pending" },
  { id: "fixed", label: "Fixed" },
  { id: "mine", label: "My Reports" },
] as const

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

function ReportCard({ report }: { report: ReportItem }) {
  const navigate = useNavigate()
  
  return (
    <div
      onClick={() => navigate({ to: "/bug-reports/$reportId", params: { reportId: report.id } })}
      className="cursor-pointer rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground leading-snug">{report.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{report.id.slice(-6)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="muted">{report.category}</Badge>
        <Badge tone={severityTone(report.severity)}>{report.severity}</Badge>
        <Badge tone={statusTone(report.status)}>{report.status}</Badge>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>↑ {report._count.upvotes}</span>
        <span>💬 {report._count.comments}</span>
        <span className="ml-auto">{report.author.username}</span>
      </div>
    </div>
  )
}

function ReportSection({ title, reports }: { title: string, reports?: ReportItem[] }) {
  if (!reports?.length) return (
    <div>
      <h2 className="font-serif text-base font-semibold text-foreground mb-3">{title}</h2>
      <p className="text-sm text-muted-foreground">No reports found.</p>
    </div>
  )
  return (
    <div>
      <h2 className="font-serif text-base font-semibold text-foreground mb-3">{title}</h2>
      <div className="flex flex-col gap-2">
        {reports.map(r => <ReportCard key={r.id} report={r} /> )}
      </div>
    </div>
  )
}

function BugReportsPage() {
  const { tab, category, severity, search } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const [searchInput, setSearchInput] = useState(search ?? "")
  
  const isHome = !tab
  const isMine = tab === "mine"

  const trendingQuery = trpc.bugReport.list.useQuery(
    { gameId, tab: "hottest", category, severity, search, limit: 10 },
    { enabled: !!gameId && isHome } 
  )
  const latestQuery = trpc.bugReport.list.useQuery(
    { gameId, tab: "latest", category, severity, search, limit: 10 },
    { enabled: !!gameId && isHome }
  )
  const tabQuery = trpc.bugReport.list.useQuery(
    { gameId, tab: tab as "pending" | "fixed", category, severity, search },
    { enabled: !!gameId && !isHome && !isMine }
  )
  const myQuery = trpc.bugReport.myReports.useQuery(
    { gameId },
    { enabled: !!gameId && isMine }
  )

  const selectClass = "rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Bug Reports</h1>
        <Link to="/bug-reports/new">
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Report a Bug
          </button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          placeholder="Search bug reports..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")
              navigate({ search: { tab, category, severity, search: searchInput || undefined } })
          }}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={category ?? ""}
          onChange={e => navigate({ search: { tab, category: (e.target.value as typeof CATEGORIES[number]["value"]) || undefined, severity, search } })}
          className={selectClass}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          value={severity ?? ""}
          onChange={e => navigate({ search: { tab, category, severity: (e.target.value as typeof SEVERITIES[number]["value"]) || undefined, search } })}
          className={selectClass}
        >
          <option value="">All severities</option>
          {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(t => (
          <button
            key={t.label}
            onClick={() => navigate({ search: { tab: t.id, category, severity, search } })}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isHome && (
        <div className="grid grid-cols-2 gap-6">
          <ReportSection title="Trending" reports={trendingQuery.data?.reports} />
          <ReportSection title="Latest" reports={latestQuery.data?.reports} />
        </div>
      )}

      {!isHome && !isMine && (
        <div className="flex flex-col gap-2">
          {tabQuery.data?.reports.map(r => <ReportCard key={r.id} report={r} />)}
          {tabQuery.data?.reports.length === 0 && (
            <p className="text-sm text-muted-foreground">No reports found.</p>
          )}
        </div>
      )}

      {isMine && myQuery.data && (
        <div className="flex flex-col gap-8">
          <ReportSection title="Submitted" reports={myQuery.data.submitted} />
          <ReportSection title="Engaged" reports={myQuery.data.engaged} />
        </div>
      )}
    </div>
  )
}
