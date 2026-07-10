import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter } from "@/components/game/ui"
import { Dumbbell, Ban } from "lucide-react"
import { getTrainingCap, getActiveRestrictions } from "../utils"

export function TrainingPanel({
  animal,
  config,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
}) {
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("TRAINING") || restrictions.has("ALL")

  return (
    <Panel
      title="Training"
      icon={<Dumbbell className="size-4 text-chart-2" />}
      action={config ? <Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge> : undefined}
    >
      {isRestricted && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <Ban className="size-3 shrink-0" />
          Training restricted due to active treatment
        </div>
      )}
      <div className="space-y-2">
        {animal.stats.map((stat: AnimalProfile["stats"][number]) => {
          const cap = getTrainingCap(stat.innateValue, config)
          return (
            <div key={stat.statDef.name} className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{stat.statDef.name}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{Math.round(stat.trainedValue)}</span> /{" "}
                  {Math.round(cap)}
                </span>
              </div>
              <Meter value={stat.trainedValue} max={cap} tone="condition" className="mb-1.5 h-1.5" />
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span>
                  Innate <span className="font-medium text-foreground">{Math.round(stat.innateValue)}</span>
                </span>
                <span>
                  Trained <span className="font-medium text-foreground">{Math.round(stat.trainedValue)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
