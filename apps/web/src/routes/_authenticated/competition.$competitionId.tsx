import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { Badge } from "@/components/game/ui"
import { Trophy, MapPin, ChevronLeft, Users } from "lucide-react"
import { placementBadgeTone } from "./animal/-animal-profile/utils"

export const Route = createFileRoute("/_authenticated/competition/$competitionId")({
  component: CompetitionDetailPage,
})

function CompetitionDetailPage() {
  const { competitionId } = Route.useParams()
  const { data: competition, isLoading } = trpc.competition.get.useQuery({ competitionId })

  if (isLoading) return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  if (!competition) return <div className="p-8 text-sm">Competition not found</div>

  const ranDate = competition.entries[0] ? new Date(competition.entries[0].enteredAt).toLocaleDateString() : null

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => history.back()} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-5" />
        </button>
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
            <Trophy className="size-5 text-chart-1" />
            {competition.disciplineDef.name}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {competition.venue.name}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3" /> {competition._count.entries} {competition._count.entries === 1 ? "entry" : "entries"}
            </span>
            {ranDate && <span>Ran {ranDate}</span>}
            <Badge tone={competition.status === "COMPLETED" ? "muted" : competition.status === "OPEN" ? "success" : "default"}>
              {competition.status}
            </Badge>
          </div>
        </div>
      </div>

      {competition.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Place</th>
                <th className="px-3 py-2 font-medium">Animal</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {competition.entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border/60 hover:bg-secondary/20">
                  <td className="px-3 py-2">
                    {entry.result?.placement != null ? (
                      <Badge tone={placementBadgeTone(entry.result.placement)}>
                        #{entry.result.placement}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to="/animal/$animalId"
                      params={{ animalId: entry.animal.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {entry.animal.name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{entry.animal.breed.name} · {entry.animal.sex === "MALE" ? "M" : "F"}</p>
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{entry.playerAccount.username}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">{entry.tierDef.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {entry.result?.score != null ? entry.result.score.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
