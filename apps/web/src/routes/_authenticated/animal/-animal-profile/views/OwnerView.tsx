import type { AnimalProfile } from "../types"
import { formatCycleAge, computeBreedingGrade } from "../utils"
import { Badge, Meter } from "@/components/game/ui"
import { ActionButton } from "@/components/game/ui"
import { Stethoscope, Clock } from "lucide-react"
import { InfoStrip } from "../InfoStrip"
import { OwnerActionList } from "../OwnerActions"
import { WorkspaceTabs } from "../WorkspaceTabs"
import { HealthPanel } from "../panels/HealthPanel"
import { BreedingPanel } from "../panels/BreedingPanel"
import { DailyLogPanel } from "../panels/DailyLogPanel"
import { TrainingPanel } from "../panels/TrainingPanel"
import { CompetitionPanel } from "../panels/CompetitionPanel"
import { DailyCarePanel } from "../panels/DailyCarePanel"
import { PersonalityPanel } from "../panels/PersonalityPanel"
import { EquippedPanel } from "../panels/EquippedPanel"
import { ConformationPanel } from "../panels/ConformationPanel"

const BREEDING_GRADE_COLOR: Record<string, string> = {
  A: "text-chart-2",
  B: "text-sky-500",
  C: "text-amber-400",
  D: "text-orange-500",
  F: "text-destructive",
}

export function OwnerView({ animal, animalId }: { animal: AnimalProfile; animalId: string }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const breedingGrade = computeBreedingGrade(animal, config)
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-transparent text-foreground">

      {/* Header */}
      <div className="flex shrink-0 flex-col items-center gap-3 border-b border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{animal.name}</h1>
          <Badge tone="success">{animal.status}</Badge>
          {activeConditions.length > 0 && (
            <Badge tone="danger">
              <Stethoscope className="size-3" />
              {activeConditions.length} condition{activeConditions.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <ActionButton variant="soft" disabled>
          <Clock className="size-3.5" />
          Advance Age
        </ActionButton>

        {/* Vitals */}
        <div className="grid w-full max-w-lg grid-cols-5 gap-x-4 gap-y-2">
          {(
            [
              { label: "Energy", value: animal.energy?.currentEnergy ?? 0, max: animal.energy?.maxEnergy ?? 100, tone: "energy" as const },
              { label: "Mood", value: animal.mood?.value ?? 0, max: 100, tone: "mood" as const },
              { label: "Condition", value: animal.condition?.value ?? 0, max: 100, tone: "condition" as const },
              { label: "Care", value: animal.careScore?.score ?? 0, max: 100, tone: "care" as const },
              { label: "Immunity", value: animal.immunity?.value ?? 0, max: animal.immunity?.innateMax ?? 100, tone: "immunity" as const },
            ] as const
          ).map((v) => (
            <div key={v.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{v.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-foreground">{Math.round(v.value)}</span>
              </div>
              <Meter value={v.value} max={v.max} tone={v.tone} />
            </div>
          ))}
        </div>
      </div>

      {/* Info strip */}
      <InfoStrip
        animal={animal}
        cycleToAge={cycleToAge}
        breedingGrade={breedingGrade}
        breedingGradeColor={BREEDING_GRADE_COLOR}
      />

      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1400px]:h-full min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.6fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">

          {/* Col 1 — Health / Breeding / Daily Log */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_auto_minmax(0,1fr)]">
            <HealthPanel animal={animal} />
            <BreedingPanel animal={animal} breedingGrade={breedingGrade} />
            <DailyLogPanel animal={animal} />
          </div>

          {/* Col 2 — Training / Competition */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            <TrainingPanel animal={animal} config={config} />
            <CompetitionPanel animal={animal} />
          </div>

          {/* Col 3 — Animal image + WorkspaceTabs */}
          <div className="order-first flex min-h-0 flex-col gap-3 min-[1400px]:order-none min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            <div className="relative flex aspect-[3/2] w-full shrink-0 items-end overflow-hidden rounded-lg border border-border bg-gradient-to-br from-secondary to-muted shadow-sm">
              <div className="w-full bg-gradient-to-t from-card/90 to-transparent px-4 py-3">
                <p className="font-serif text-lg font-semibold text-foreground">{animal.name}</p>
                <p className="text-xs text-muted-foreground">
                  {animal.breed.name} · {animal.lifeStage.name}
                </p>
              </div>
            </div>
            <WorkspaceTabs animal={animal} animalId={animalId} cycleToAge={cycleToAge} config={config} />
          </div>

          {/* Col 4+5 — Care / Owner Actions / Personality / Equipped / Conformation */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:col-span-2 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[1400px]:grid-rows-[auto_auto_minmax(0,1fr)]">
            <DailyCarePanel animal={animal} cycleToAge={cycleToAge} />

            {/* Owner Actions */}
            <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Owner Actions</h3>
              </header>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                <OwnerActionList />
              </div>
            </div>

            <PersonalityPanel animal={animal} />
            <EquippedPanel animal={animal} />

            <div className="flex min-h-0 flex-col min-[1400px]:col-span-2">
              <ConformationPanel animal={animal} />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
