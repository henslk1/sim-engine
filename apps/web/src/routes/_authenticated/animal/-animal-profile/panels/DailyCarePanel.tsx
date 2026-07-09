import type { AnimalProfile } from "../types"
import { Panel, Badge } from "@/components/game/ui"
import { Heart } from "lucide-react"

export function DailyCarePanel({
  animal,
  cycleToAge,
}: {
  animal: AnimalProfile
  cycleToAge: (n: number) => string
}) {
  return (
    <Panel title="Daily Care" icon={<Heart className="size-4 text-chart-4" />}>
      {animal.longTermCareRecords.length > 0 && (
        <>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Long-Term Schedule
          </h4>
          <div className="mb-3 space-y-1.5">
            {animal.longTermCareRecords.map((record: AnimalProfile["longTermCareRecords"][number]) => (
              <div
                key={record.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
              >
                <p className="text-xs font-semibold text-foreground">{record.longTermCareActionDef.name}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {record.lastPerformedCycle !== null && (
                    <span className="text-[11px] text-muted-foreground">
                      last {cycleToAge(record.lastPerformedCycle)}
                    </span>
                  )}
                  <Badge tone="muted">due {cycleToAge(record.nextDueCycle)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {animal.game.careActionDefs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No care actions configured</p>
      ) : (
        <div className="space-y-1.5">
          {animal.game.careActionDefs.map((action: AnimalProfile["game"]["careActionDefs"][number]) => (
            <button
              key={action.id}
              type="button"
              disabled
              className="flex w-full items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5 text-left transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-xs font-semibold text-foreground">{action.name}</span>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {action.energyRestore > 0 && <span>+{action.energyRestore} energy</span>}
                {action.moodBoost > 0 && <span>+{action.moodBoost} mood</span>}
                <Badge tone="muted">{action.costType}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
