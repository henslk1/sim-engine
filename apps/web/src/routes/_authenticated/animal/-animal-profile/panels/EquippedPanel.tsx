import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Package } from "lucide-react"

export function EquippedPanel({ animal }: { animal: AnimalProfile }) {
  return (
    <Panel title="Equipped" icon={<Package className="size-4 text-muted-foreground" />}>
      {animal.equipment.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No items equipped</p>
      ) : (
        <div className="space-y-1.5">
          {animal.equipment.map((eq: AnimalProfile["equipment"][number]) => (
            <div
              key={eq.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1.5"
            >
              <Package className="size-3 shrink-0 text-muted-foreground/50" />
              <span className="text-xs text-foreground">{eq.itemDef.name}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
