import type { AnimalProfile } from "../types"
import { Panel, Badge } from "@/components/game/ui"
import { Trophy, CheckCircle, XCircle, Ban } from "lucide-react"
import { placementBadgeTone, getActiveRestrictions } from "../utils"

export function CompetitionPanel({ animal }: { animal: AnimalProfile }) {
  const currentTier = animal.compTiers[0]
  const latestWeeklyPoints = animal.weeklyPoints[0]?.points
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  return (
    <Panel title="Competition" icon={<Trophy className="size-4 text-chart-1" />}>
      {isRestricted && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <Ban className="size-3 shrink-0" />
          Competition restricted due to active treatment
        </div>
      )}
      {animal.disciplineDef ? (
        <>
          <div className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Discipline</span>
              <span className="text-xs font-semibold text-foreground">{animal.disciplineDef.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tier</span>
              <span className="text-xs font-semibold text-foreground">{currentTier?.tierDef.name ?? "—"}</span>
            </div>
            {latestWeeklyPoints !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Points</span>
                <span className="text-xs font-semibold text-foreground">{Math.round(latestWeeklyPoints)}</span>
              </div>
            )}
          </div>

          {currentTier && currentTier.disciplineDef.equipmentRequirements.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipment</h4>
              <div className="space-y-1">
                {currentTier.disciplineDef.equipmentRequirements.map(
                  (req: AnimalProfile["compTiers"][number]["disciplineDef"]["equipmentRequirements"][number]) => {
                    const equipped = animal.equipment.filter(
                      (eq: AnimalProfile["equipment"][number]) => eq.itemDef.id === req.itemDef.id
                    ).length
                    const met = equipped >= req.quantity
                    return (
                      <div key={req.id} className="flex items-center gap-2 text-[11px]">
                        {met ? (
                          <CheckCircle className="size-3.5 shrink-0 text-chart-2" />
                        ) : (
                          <XCircle className="size-3.5 shrink-0 text-destructive" />
                        )}
                        <span className={met ? "text-foreground" : "text-destructive"}>{req.itemDef.name}</span>
                        {req.quantity > 1 && (
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {equipped}/{req.quantity}
                          </span>
                        )}
                      </div>
                    )
                  }
                )}
              </div>
            </div>
          )}

          {animal.competitionEntries.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Entries</h4>
              <div className="overflow-hidden rounded-md border border-border/70">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 font-medium">Venue</th>
                      <th className="px-2 py-1 font-medium">Tier</th>
                      <th className="px-2 py-1 text-right font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animal.competitionEntries.map((entry: AnimalProfile["competitionEntries"][number]) => (
                      <tr key={entry.id} className="border-t border-border/60">
                        <td className="px-2 py-1 font-medium text-foreground">{entry.competition.venue.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">{entry.tierDef.name}</td>
                        <td className="px-2 py-1 text-right">
                          {entry.result ? (
                            entry.result.placement !== null ? (
                              <Badge tone={placementBadgeTone(entry.result.placement)}>
                                #{entry.result.placement}
                              </Badge>
                            ) : (
                              <span className="tabular-nums text-foreground">{entry.result.score.toFixed(1)}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">No discipline assigned</p>
      )}
    </Panel>
  )
}
