import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/seasons")({
  component: OpsSeasons,
})

function OpsSeasons() {
  const { gameId } = Route.useParams()

  const { data: seasons } = trpc.admin.ops.seasons.list.useQuery(
    { gameId: gameId! },
    {},
  )

  const { data: competitions } = trpc.admin.ops.seasons.getCompetitions.useQuery(
    { gameId: gameId!, status: "OPEN" },
    {},
  )

  const now = new Date()

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">Seasons & Competition</h1>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seasons</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Starts</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Ends</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Players</th>
              </tr>
            </thead>
            <tbody>
              {seasons?.map(s => {
                const isActive = s.startsAt && s.endsAt && new Date(s.startsAt) <= now && new Date(s.endsAt) >= now
                const isUpcoming = s.startsAt && new Date(s.startsAt) > now
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isActive ? "bg-chart-2/10 text-chart-2" :
                        isUpcoming ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {isActive ? "Active" : isUpcoming ? "Upcoming" : "Ended"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.startsAt ? new Date(s.startsAt).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.endsAt ? new Date(s.endsAt).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{s._count.seasonRankings}</td>
                  </tr>
                )
              })}
              {!seasons?.length && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No seasons yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Competitions</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Venue</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Entries</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {competitions?.map(c => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.venue.name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{c.status}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{c._count.competitionEntries}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {!competitions?.length && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No open competitions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
