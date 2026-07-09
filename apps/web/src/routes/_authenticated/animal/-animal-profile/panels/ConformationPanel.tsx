import type { AnimalProfile } from "../types"
import { Panel, Meter } from "@/components/game/ui"
import { Ruler } from "lucide-react"

export function ConformationPanel({ animal }: { animal: AnimalProfile }) {
  return (
    <Panel title="Conformation" icon={<Ruler className="size-4 text-chart-2" />}>
      {animal.conformationScores.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {animal.conformationScores.map((score: AnimalProfile["conformationScores"][number]) => (
            <div key={score.breedId} className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{score.breed.name}</span>
                <span className="text-sm font-bold tabular-nums text-primary">{score.score.toFixed(1)}</span>
              </div>
              <Meter value={score.score} max={100} tone="condition" className="h-1.5" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No conformation scores</p>
      )}
    </Panel>
  )
}
