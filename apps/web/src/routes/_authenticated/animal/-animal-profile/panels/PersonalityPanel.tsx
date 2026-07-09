import type { AnimalProfile } from "../types"
import { Panel, Meter } from "@/components/game/ui"
import { Brain } from "lucide-react"

export function PersonalityPanel({ animal }: { animal: AnimalProfile }) {
  return (
    <Panel title="Personality" icon={<Brain className="size-4 text-chart-5" />}>
      {animal.personality.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No personality data</p>
      ) : (
        <div className="space-y-2">
          {animal.personality.map((trait: AnimalProfile["personality"][number]) => (
            <div key={trait.traitDef.name}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{trait.traitDef.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {trait.traitLabel && (
                    <span className="mr-1.5 font-medium text-foreground">{trait.traitLabel}</span>
                  )}
                  <span className="tabular-nums">{Math.round(trait.value)}</span>
                </span>
              </div>
              <Meter value={trait.value} max={100} tone="mood" className="h-1" />
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
