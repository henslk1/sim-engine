import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter } from "@/components/game/ui"
import { Baby, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCOIColor } from "../utils"

export function BreedingPanel({
  animal,
  breedingGrade,
}: {
  animal: AnimalProfile
  breedingGrade: string
}) {
  const preg = animal.pregnancies[0]
  const coiColor = getCOIColor(animal.inbreedingCoefficient)

  return (
    <Panel title="Breeding" icon={<Baby className="size-4 text-accent-foreground" />}>
      <div className="mb-3 flex items-center gap-4 border-b border-border pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          COI —{" "}
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quality — <span className="font-bold">{breedingGrade}</span>
        </span>
        {animal.breedComposition.length > 1 && <Badge tone="muted">Cross</Badge>}
      </div>

      {animal.pregnancies.length > 0 ? (
        <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Active Pregnancy</span>
            <Badge tone="accent">
              <Sparkles className="size-3" /> Expecting
            </Badge>
          </div>
          {preg.breedingRecord.sire && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sire: <span className="font-medium text-foreground">{preg.breedingRecord.sire.name}</span>
            </p>
          )}
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Gestation</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {preg.currentCycles} / {preg.requiredCycles} months
              </span>
            </div>
            <Meter value={preg.currentCycles} max={preg.requiredCycles} tone="mood" className="h-1.5" />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Not pregnant</p>
      )}
    </Panel>
  )
}
