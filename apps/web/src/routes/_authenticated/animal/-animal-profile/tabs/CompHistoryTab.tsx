import type { AnimalProfile } from "../types"
import { Badge } from "@/components/game/ui"
import { Award } from "lucide-react"
import { placementBadgeTone } from "../utils"

export function CompHistoryTab({
  animal,
  cycleToAge,
}: {
  animal: AnimalProfile
  cycleToAge: (n: number) => string
}) {
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

      {animal.competitionEntries.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/70">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Venue</th>
                <th className="px-2 py-1 font-medium">Tier</th>
                <th className="px-2 py-1 text-right font-medium">Score</th>
                <th className="px-2 py-1 text-right font-medium">Place</th>
              </tr>
            </thead>
            <tbody>
              {animal.competitionEntries.map((entry: AnimalProfile["competitionEntries"][number]) => (
                <tr key={entry.id} className="border-t border-border/60">
                  <td className="px-2 py-1 font-medium text-foreground">{entry.competition.venue.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{entry.tierDef.name}</td>
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
      ) : (
        <p className="text-[11px] text-muted-foreground">No competition entries yet</p>
      )}
    </div>
  )
}
