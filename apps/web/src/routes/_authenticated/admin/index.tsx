import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, useEffect } from "react"
import {
  Bug, MessageSquare, Flag, ShieldBan,
  CheckCircle2, XCircle, ChevronRight, Circle, AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/")({
  component: OpsOverview,
})

function OpsOverview() {
  const { data } = trpc.admin.ops.overview.stats.useQuery({})

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const totalBugs = data.bugGameBreaking + data.bugMajor + data.bugMinor
  const recentPlayers = data.recentPlayers ?? []
  const recentActions = data.recentActions ?? []

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Admin Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Operations overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={MessageSquare} label="Open Tickets" value={data.openTickets + data.inProgressTickets} href="/admin/support" color="blue" />
        <StatCard icon={Bug} label="Active Bugs" value={totalBugs} href="/admin/bugs" color="orange" />
        <StatCard icon={Flag} label="Pending Reports" value={data.pendingReports} href="/admin/moderation" color="yellow" />
        <StatCard icon={ShieldBan} label="Active Bans" value={data.activeBans} href="/admin/moderation" color="red" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px_240px]">

        {/* Users this week */}
        <Panel
          title="New Users This Week"
          count={recentPlayers.length}
          action={{ label: "All users", href: "/admin/users" }}
        >
          {recentPlayers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No new users this week.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Username</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last IP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Games</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last Active</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Flags</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {recentPlayers.map((p) => {
                  const ban = p.user.banRecords?.[0]
                  const isBanned = ban && (!ban.expiresAt || new Date(ban.expiresAt) > new Date())
                  const lastIp = p.user.userIpLogs?.[0]
                  const staffRoles = p.user.staffRoles ?? []
                  const games = p.user.playerAccounts?.map((pa: { game: { id: string; name: string } }) => pa.game) ?? []
                  const warningCount = p._count?.warnings ?? 0
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{p.username}</span>
                          {staffRoles.map((r: { role: string }) => (
                            <span key={r.role} className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">
                              {r.role.slice(0, 3)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">{p.user.email}</span>
                          {p.user.emailVerified
                            ? <CheckCircle2 className="size-3 shrink-0 text-chart-2" />
                            : <Circle className="size-3 shrink-0 text-muted-foreground/30" />
                          }
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {lastIp
                          ? <span className="font-mono text-xs text-muted-foreground">{lastIp.ipAddress}</span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {games.map((g: { id: string; name: string }) => (
                            <span key={g.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{g.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {isBanned && (
                            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                              <ShieldBan className="size-3" />{ban?.expiresAt ? "Temp" : "Banned"}
                            </span>
                          )}
                          {warningCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                              <AlertTriangle className="size-3" />{warningCount}
                            </span>
                          )}
                          {!isBanned && warningCount === 0 && <span className="text-muted-foreground/40">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to="/admin/users/$playerId"
                          params={{ playerId: p.id }}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Active alerts */}
        <Panel title="Active Alerts" action={{ label: "Details", href: "/admin" }}>
          <div className="px-4 py-3 space-y-4">
            {/* Support */}
            <AlertGroup label="Support">
              <AlertRow label="Open Tickets" value={data.openTickets} href="/admin/support" dot="blue" />
              <AlertRow label="In Progress" value={data.inProgressTickets} href="/admin/support" dot="blue" dim />
            </AlertGroup>

            {/* Bugs */}
            <AlertGroup label="Bugs">
              <AlertRow label="Game Breaking" value={data.bugGameBreaking} href="/admin/bugs" dot="red" bold />
              <AlertRow label="Exploits" value={data.exploitCount} href="/admin/bugs" dot="red" bold />
              <AlertRow label="Major" value={data.bugMajor} href="/admin/bugs" dot="orange" />
              <AlertRow label="Minor" value={data.bugMinor} href="/admin/bugs" dot="muted" dim />
            </AlertGroup>

            {/* Moderation */}
            <AlertGroup label="Moderation">
              <AlertRow label="Pending Reports" value={data.pendingReports} href="/admin/moderation" dot="yellow" />
              <AlertRow label="Active Bans" value={data.activeBans} href="/admin/moderation" dot="red" />
            </AlertGroup>
          </div>
        </Panel>

        {/* Recent admin actions */}
        <Panel
          title="Recent Actions"
          action={{ label: "Audit log", href: "/admin/audit" }}
        >
          {recentActions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No actions yet.</p>
          ) : (
            <div>
              {recentActions.map((log) => (
                <div key={log.id} className="border-t border-border first:border-t-0 px-4 py-2.5">
                  <p className="truncate font-mono text-xs text-foreground">{log.action}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{log.user.name ?? log.user.email}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                      {new Date(log.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Next breed campaign pre-launch tracker */}
      <NextCampaignTracker />

      {/* Last nightly update — compact footer bar */}
      {data.lastNightlyLog && (
        <div className={cn(
          "flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border px-4 py-3 text-xs",
          data.lastNightlyLog.success
            ? "border-chart-2/25 bg-chart-2/5 text-chart-2"
            : "border-destructive/25 bg-destructive/5 text-destructive"
        )}>
          <div className="flex items-center gap-1.5 font-semibold">
            {data.lastNightlyLog.success
              ? <CheckCircle2 className="size-3.5" />
              : <XCircle className="size-3.5" />}
            Last Nightly Update
            <span className="font-normal text-muted-foreground ml-1">
              {new Date(data.lastNightlyLog.startedAt).toLocaleString()}
            </span>
          </div>
          {data.lastNightlyLog.success && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <NightlyStat label="aged" value={data.lastNightlyLog.animalsAged} />
              <NightlyStat label="deaths" value={data.lastNightlyLog.animalDeaths} />
              <NightlyStat label="transitions" value={data.lastNightlyLog.lifeStageTransitions} />
              <NightlyStat label="rotations" value={data.lastNightlyLog.storeRotationsProcessed} />
              <NightlyStat label="raffles" value={data.lastNightlyLog.rafflesDrawn} />
              <NightlyStat label="prizes" value={data.lastNightlyLog.seasonRewardsDistributed} />
            </div>
          )}
          {data.lastNightlyLog.errorMessage && (
            <span className="text-destructive">{data.lastNightlyLog.errorMessage}</span>
          )}
          <Link to="/admin/system" className="ml-auto flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
            History <ChevronRight className="size-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

type StatColor = "blue" | "orange" | "yellow" | "red" | "green" | "purple"

const STAT_COLORS: Record<StatColor, { icon: string; bg: string }> = {
  blue:   { icon: "text-blue-500",    bg: "bg-blue-500/12" },
  orange: { icon: "text-orange-500",  bg: "bg-orange-500/12" },
  yellow: { icon: "text-yellow-500",  bg: "bg-yellow-500/12" },
  red:    { icon: "text-red-500",     bg: "bg-red-500/12" },
  green:  { icon: "text-emerald-500", bg: "bg-emerald-500/12" },
  purple: { icon: "text-purple-500",  bg: "bg-purple-500/12" },
}

function StatCard({ icon: Icon, label, value, href, color = "blue" }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  href: string
  color?: StatColor
}) {
  const c = STAT_COLORS[color]
  return (
    <Link
      to={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      </div>
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", c.bg)}>
        <Icon className={cn("size-5", c.icon)} />
      </div>
    </Link>
  )
}

function Panel({ title, count, action, children }: {
  title: string
  count?: number
  action?: { label: string; href: string }
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {count != null && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {action && (
          <Link to={action.href} className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            {action.label} <ChevronRight className="size-3" />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

function AlertGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

type DotColor = "blue" | "orange" | "yellow" | "red" | "muted"
const DOT_COLORS: Record<DotColor, string> = {
  blue:   "bg-blue-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  red:    "bg-red-500",
  muted:  "bg-muted-foreground/40",
}

function AlertRow({ label, value, href, dot, bold, dim }: {
  label: string
  value: number
  href: string
  dot: DotColor
  bold?: boolean
  dim?: boolean
}) {
  const isAlert = bold && value > 0
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/50",
        dim && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT_COLORS[dot])} />
        <span className={cn("text-foreground/80", isAlert && "font-semibold text-foreground")}>{label}</span>
      </div>
      <span className={cn(
        "tabular-nums font-medium",
        isAlert ? "text-destructive" : "text-muted-foreground"
      )}>
        {value}
      </span>
    </Link>
  )
}

function NightlyStat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      {" "}{label}
    </span>
  )
}

// ── Next Breed Campaign Tracker ───────────────────────────────────────────────

const NEXT_CAMPAIGN_KEY = "admin-next-campaign-tracker"

type NextCampaignState = {
  name: string
  checks: Record<string, boolean>
}

const CAMPAIGN_ITEMS: { key: string; label: string; description: string }[] = [
  { key: "breed",       label: "Breed configured",       description: "Breed record created with species, lore, and settings" },
  { key: "composition", label: "Composition configured",  description: "Stat profiles and conformation standards set" },
  { key: "studs",       label: "Studs configured",        description: "Foundation animals created with admin-picked genes" },
  { key: "prizes",      label: "Prizes configured",       description: "Campaign reward tiers and items defined" },
]

function loadNextCampaign(): NextCampaignState {
  try {
    const raw = localStorage.getItem(NEXT_CAMPAIGN_KEY)
    return raw ? JSON.parse(raw) : { name: "", checks: {} }
  } catch {
    return { name: "", checks: {} }
  }
}

function saveNextCampaign(state: NextCampaignState) {
  try {
    localStorage.setItem(NEXT_CAMPAIGN_KEY, JSON.stringify(state))
  } catch {}
}

function NextCampaignTracker() {
  const [state, setState] = useState<NextCampaignState>({ name: "", checks: {} })
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")

  useEffect(() => {
    const loaded = loadNextCampaign()
    setState(loaded)
    setNameInput(loaded.name)
  }, [])

  const update = (next: NextCampaignState) => {
    setState(next)
    saveNextCampaign(next)
  }

  const toggleCheck = (key: string) => {
    update({ ...state, checks: { ...state.checks, [key]: !state.checks[key] } })
  }

  const commitName = () => {
    update({ ...state, name: nameInput.trim() })
    setEditingName(false)
  }

  const doneCount = CAMPAIGN_ITEMS.filter(i => state.checks[i.key]).length
  const allDone = doneCount === CAMPAIGN_ITEMS.length && !!state.name

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Next Breed Campaign</h2>
          {state.name && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              allDone
                ? "bg-chart-2/10 text-chart-2"
                : "bg-muted text-muted-foreground"
            )}>
              {allDone ? "Ready to launch" : `${doneCount}/${CAMPAIGN_ITEMS.length}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4 sm:flex-nowrap">
        {/* Name */}
        <div className="shrink-0 min-w-[180px]">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Breed Name</p>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false) }}
                className="w-36 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                placeholder="e.g. Andalusian"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className={cn(
                "text-left text-sm font-medium",
                state.name ? "text-foreground" : "italic text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              {state.name || "Click to set name…"}
            </button>
          )}
        </div>

        <div className="hidden h-10 w-px shrink-0 bg-border sm:block" />

        {/* Checklist */}
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          {CAMPAIGN_ITEMS.map(({ key, label, description }) => (
            <button
              key={key}
              onClick={() => toggleCheck(key)}
              title={description}
              className="flex cursor-pointer items-center gap-2 text-left"
            >
              <div className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                state.checks[key]
                  ? "border-chart-2 bg-chart-2/15"
                  : "border-border bg-background hover:border-chart-2/40"
              )}>
                {state.checks[key] && <CheckCircle2 className="size-3 text-chart-2" />}
              </div>
              <span className={cn(
                "text-sm",
                state.checks[key] ? "text-foreground" : "text-muted-foreground"
              )}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
