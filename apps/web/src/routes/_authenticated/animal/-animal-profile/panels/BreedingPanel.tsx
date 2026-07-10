import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter } from "@/components/game/ui"
import { Baby, Sparkles, Heart, Ban } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCOIColor, getFertilityDisplay, getActiveRestrictions } from "../utils"

export function BreedingPanel({
  animal,
  breedingGrade,
}: {
  animal: AnimalProfile
  breedingGrade: string
}) {
  const preg = animal.pregnancies[0]
  const coiColor = getCOIColor(animal.inbreedingCoefficient)
  const fertility = getFertilityDisplay(animal.fertility)
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("BREEDING") || restrictions.has("ALL")

  return (
    <Panel title="Breeding" icon={<Baby className="size-4 text-accent-foreground" />}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          COI —{" "}
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quality — <span className="font-bold">{breedingGrade}</span>
        </span>
        <span className="flex items-center gap-0.5" title={`Fertility: ${fertility.label}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Heart
              key={i}
              className={cn("size-3", i < fertility.hearts ? "text-rose-400" : "text-muted-foreground/25")}
              fill="currentColor"
            />
          ))}
        </span>
        {animal.breedComposition.length > 1 && <Badge tone="muted">Cross</Badge>}
        {animal.isCastrated && <Badge tone="muted">Castrated</Badge>}
      </div>

      {isRestricted && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <Ban className="size-3 shrink-0" />
          Breeding restricted due to active treatment
        </div>
      )}
      {animal.isCastrated ? (
        <p className="text-[11px] text-muted-foreground">Not eligible for breeding</p>
      ) : animal.pregnancies.length > 0 ? (
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
