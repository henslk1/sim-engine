import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Package } from "lucide-react"

function EquipItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1.5">
      <Package className="size-3 shrink-0 text-muted-foreground/50" />
      <span className="text-xs text-foreground">{name}</span>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
  )
}

export function EquippedPanel({ animal }: { animal: AnimalProfile }) {
  if (animal.equipment.length === 0) {
    return (
      <Panel title="Equipped" icon={<Package className="size-4 text-muted-foreground" />}>
        <p className="text-[11px] text-muted-foreground">No items equipped</p>
      </Panel>
    )
  }

  const disc1 = animal.disciplineDef
  const disc2 = animal.secondaryDisciplineDef

  const d1Ids = new Set((disc1?.equipmentRequirements ?? []).map(r => r.itemDefId))
  const d2Ids = new Set((disc2?.equipmentRequirements ?? []).map(r => r.itemDefId))

  // No disciplines — flat list
  if (!disc1) {
    return (
      <Panel title="Equipped" icon={<Package className="size-4 text-muted-foreground" />}>
        <div className="space-y-1.5">
          {animal.equipment.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
        </div>
      </Panel>
    )
  }

  if (!disc2) {
    // Single discipline — one section + "Other"
    const discItems = animal.equipment.filter(eq => d1Ids.has(eq.itemDefId))
    const otherItems = animal.equipment.filter(eq => !d1Ids.has(eq.itemDefId))
    return (
      <Panel title="Equipped" icon={<Package className="size-4 text-muted-foreground" />}>
        <div className="space-y-2.5">
          {discItems.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel label={disc1.name} />
              {discItems.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
            </div>
          )}
          {otherItems.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel label="Other" />
              {otherItems.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
            </div>
          )}
        </div>
      </Panel>
    )
  }

  // Two disciplines — disc1-only / shared / disc2-only / other
  const disc1Only = animal.equipment.filter(eq => d1Ids.has(eq.itemDefId) && !d2Ids.has(eq.itemDefId))
  const disc2Only = animal.equipment.filter(eq => d2Ids.has(eq.itemDefId) && !d1Ids.has(eq.itemDefId))
  const shared = animal.equipment.filter(eq => d1Ids.has(eq.itemDefId) && d2Ids.has(eq.itemDefId))
  const other = animal.equipment.filter(eq => !d1Ids.has(eq.itemDefId) && !d2Ids.has(eq.itemDefId))

  return (
    <Panel title="Equipped" icon={<Package className="size-4 text-muted-foreground" />}>
      <div className="space-y-2.5">
        {disc1Only.length > 0 && (
          <div className="space-y-1.5">
            <SectionLabel label={disc1.name} />
            {disc1Only.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
          </div>
        )}
        {disc2Only.length > 0 && (
          <div className="space-y-1.5">
            <SectionLabel label={disc2.name} />
            {disc2Only.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
          </div>
        )}
        {shared.length > 0 && (
          <div className="space-y-1.5">
            <SectionLabel label="Shared" />
            {shared.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
          </div>
        )}
        {other.length > 0 && (
          <div className="space-y-1.5">
            <SectionLabel label="Other" />
            {other.map((eq) => <EquipItem key={eq.id} name={eq.itemDef.name} />)}
          </div>
        )}
      </div>
    </Panel>
  )
}
