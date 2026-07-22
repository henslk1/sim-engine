import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Search, CheckCircle2, Circle, ShieldAlert, ShieldBan, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: OpsUsers,
})

const STAFF_BADGE: Record<string, { label: string; className: string }> = {
  OWNER:     { label: "Owner",  className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  ADMIN:     { label: "Admin",  className: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  MODERATOR: { label: "Mod",    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
}

function relativeDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function OpsUsers() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [isBannedFilter, setIsBannedFilter] = useState<boolean | undefined>(undefined)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.admin.ops.players.list.useInfiniteQuery(
    { search: debouncedSearch || undefined, isBanned: isBannedFilter, limit: 50 },
    { getNextPageParam: (last) => last.nextCursor },
  )

  const players = data?.pages.flatMap(p => p.players) ?? []

  function handleSearchChange(val: string) {
    setSearch(val)
    clearTimeout((handleSearchChange as never as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSearchChange as never as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => setDebouncedSearch(val), 300)
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Users</h1>
        <span className="text-sm text-muted-foreground">{players.length} loaded</span>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by username or email…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={isBannedFilter === undefined ? "" : String(isBannedFilter)}
          onChange={e => setIsBannedFilter(e.target.value === "" ? undefined : e.target.value === "true")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All users</option>
          <option value="true">Banned</option>
          <option value="false">Not banned</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Username</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last IP</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Games</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last Active</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Animals</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Flags</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const ban = p.user.banRecords[0]
              const isBanned = ban && (!ban.expiresAt || new Date(ban.expiresAt) > new Date())
              const lastIp = p.user.userIpLogs[0]
              const staffRoles = p.user.staffRoles
              const games = p.user.playerAccounts.map(pa => pa.game)
              const warningCount = p._count.warnings
              const animalCount = p._count.animalsOwned

              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  {/* Username + staff badge */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{p.username}</span>
                      {staffRoles.map((r) => {
                        const badge = STAFF_BADGE[r.role]
                        if (!badge) return null
                        return (
                          <span key={r.role} className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", badge.className)}>
                            {badge.label}
                          </span>
                        )
                      })}
                    </div>
                  </td>

                  {/* Email + verified */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">{p.user.email}</span>
                      {p.user.emailVerified
                        ? <CheckCircle2 className="size-3.5 shrink-0 text-chart-2" title="Email verified" />
                        : <Circle className="size-3.5 shrink-0 text-muted-foreground/40" title="Email not verified" />
                      }
                    </div>
                  </td>

                  {/* Last IP */}
                  <td className="px-3 py-2">
                    {lastIp ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {lastIp.ipAddress}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Games */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {games.map((g) => (
                        <span
                          key={g.id}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                        >
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Last active */}
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {relativeDate(p.seniority?.lastActiveDateAt)}
                  </td>

                  {/* Animals */}
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {animalCount}
                  </td>

                  {/* Flags */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isBanned && (
                        <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive" title={ban?.reason ?? "Banned"}>
                          <ShieldBan className="size-3" />
                          {ban?.expiresAt ? "Temp" : "Banned"}
                        </span>
                      )}
                      {warningCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400" title={`${warningCount} warning${warningCount !== 1 ? "s" : ""}`}>
                          <AlertTriangle className="size-3" />
                          {warningCount}
                        </span>
                      )}
                      {!isBanned && warningCount === 0 && (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
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
            {players.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No users found.</td></tr>
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
