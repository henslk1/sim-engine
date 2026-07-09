import type { AnimalProfile } from "../types"
import { Panel, Badge } from "@/components/game/ui"
import { Sword } from "lucide-react"

export function EquippedPanel({ animal }: { animal: AnimalProfile }) {
  return (
    <Panel title="Equipped" icon={<Sword className="size-4 text-muted-foreground" />}>
      {animal.equipment.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No items equipped</p>
      ) : (
        <div className="space-y-1.5">
          {animal.equipment.map((eq: AnimalProfile["equipment"][number]) => (
            <div
              key={eq.id}
              className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
            >
              <span className="text-xs font-semibold text-foreground">{eq.itemDef.name}</span>
              <Badge tone="muted">{eq.slot}</Badge>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
