import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Badge } from "@/components/game/ui"
import { Award, ChevronLeft, ChevronRight } from "lucide-react"
import { placementBadgeTone } from "../utils"
import { Link } from "@tanstack/react-router"

const PAGE_SIZE = 10

export function CompHistoryTab({
  animal,
  cycleToAge,
}: {
  animal: AnimalProfile
  cycleToAge: (n: number) => string
}) {
  const [page, setPage] = useState(0)
  const entries = animal.competitionEntries
  const pageCount = Math.ceil(entries.length / PAGE_SIZE)
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      {animal.titles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {animal.titles.map((t: AnimalProfile["titles"][number]) => (
            <Badge key={t.id} tone="default">
              <Award className="size-3" /> {t.titleDef.name} · {cycleToAge(t.cycleNumber)}
            </Badge>
          ))}
        </div>
      )}

      {entries.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-md border border-border/70">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Competition</th>
                  <th className="px-2 py-1 font-medium">Discipline</th>
                  <th className="px-2 py-1 font-medium">Tier</th>
                  <th className="px-2 py-1 text-right font-medium">Entries</th>
                  <th className="px-2 py-1 text-right font-medium">Score</th>
                  <th className="px-2 py-1 text-right font-medium">Place</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry: AnimalProfile["competitionEntries"][number]) => (
                  <tr key={entry.id} className="border-t border-border/60">
                    <td className="px-2 py-1 font-medium text-foreground">
                      <Link
                        to="/competition/$competitionId"
                        params={{ competitionId: entry.competition.id }}
                        className="hover:underline"
                      >
                        {entry.competition.venue.name}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{entry.competition.disciplineDef.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{entry.tierDef.name}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{entry.competition._count.entries}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">
                      {entry.result?.score.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {entry.result?.placement != null ? (
                        <Badge tone={placementBadgeTone(entry.result.placement)}>
                          #{entry.result.placement}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{entries.length} entries · page {page + 1} of {pageCount}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded p-0.5 hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded p-0.5 hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">No competition entries yet</p>
      )}
    </div>
  )
}
