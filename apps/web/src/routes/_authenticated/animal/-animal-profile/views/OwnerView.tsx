import { useState } from "react"
import type { AnimalProfile } from "../types"
import { formatCycleAge, computeBreedingGrade, BREEDING_GRADE_COLOR } from "../utils"
import { Badge, Meter } from "@/components/game/ui"
import { ActionButton } from "@/components/game/ui"
import { Stethoscope, Clock, Pencil } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { InfoStrip } from "../InfoStrip"
import { AlertBanner } from "../AlertBanner"
import { OwnerActionList } from "../OwnerActions"
import { WorkspaceTabs } from "../WorkspaceTabs"
import { HealthPanel } from "../panels/HealthPanel"
import { BreedingPanel } from "../panels/BreedingPanel"
import { DailyLogPanel } from "../panels/DailyLogPanel"
import { TrainingPanel } from "../panels/TrainingPanel"
import { CompetitionPanel } from "../panels/CompetitionPanel"
import { DailyCarePanel } from "../panels/DailyCarePanel"
import { PersonalityPanel } from "../panels/PersonalityPanel"
import { NotesPanel } from "../panels/NotesPanel"
import { EquippedPanel } from "../panels/EquippedPanel"
import { ConformationPanel } from "../panels/ConformationPanel"


export function OwnerView({ animal, animalId }: { animal: AnimalProfile; animalId: string }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const breedingGrade = computeBreedingGrade(animal, config)
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(animal.name)
  const utils = trpc.useUtils()
  const { mutate: updateName } = trpc.animal.updateName.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId }),
  })

  function submitName() {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== animal.name) updateName({ animalId, name: trimmed })
    else setNameValue(animal.name)
    setEditingName(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">

      {/* Header */}
      <div className="flex shrink-0 flex-col items-center gap-3 border-b border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {editingName ? (
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={submitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName()
                if (e.key === "Escape") { setNameValue(animal.name); setEditingName(false) }
              }}
              autoFocus
              className="font-serif text-2xl font-semibold tracking-tight text-foreground bg-transparent border-b border-primary outline-none text-center"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group flex items-center gap-1.5"
            >
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{animal.name}</h1>
              <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
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
      <AlertBanner animal={animal} />

      <InfoStrip
        animal={animal}
        cycleToAge={cycleToAge}
        breedingGrade={breedingGrade}
      />

      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1400px]:h-full min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.6fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">

          {/* Col 1 — Breeding / Health */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            <BreedingPanel animal={animal} breedingGrade={breedingGrade} />
            <HealthPanel animal={animal} />
          </div>

          {/* Col 2 — Training / Competition / Equipped */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_auto_minmax(0,1fr)]">
            <TrainingPanel animal={animal} config={config} />
            <CompetitionPanel animal={animal} />
            <EquippedPanel animal={animal} />
          </div>

          {/* Col 3 — Animal image + WorkspaceTabs */}
          <div className="order-first flex min-h-0 flex-col gap-3 min-[1400px]:order-none min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            <div className="relative flex aspect-[9/5] w-full shrink-0 items-end overflow-hidden rounded-lg border border-border bg-gradient-to-br from-secondary to-muted shadow-sm">
              <div className="w-full bg-gradient-to-t from-card/90 to-transparent px-4 py-3">
                <p className="font-serif text-lg font-semibold text-foreground">{animal.name}</p>
                <p className="text-xs text-muted-foreground">
                  {animal.breed.name} · {animal.lifeStage.name}
                </p>
              </div>
            </div>
            <WorkspaceTabs animal={animal} animalId={animalId} cycleToAge={cycleToAge} config={config} />
          </div>

          {/* Col 4+5 — Care / Owner Actions / DailyLog / Conformation / Personality / Equipped */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:col-span-2 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[1400px]:grid-rows-[auto_auto_auto_minmax(0,1fr)]">
            <DailyCarePanel animal={animal} />

            {/* Owner Actions */}
            <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Owner Actions</h3>
              </header>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                <OwnerActionList />
              </div>
            </div>

            <ConformationPanel animal={animal} />
            <div className="min-[1400px]:row-span-3 min-[1400px]:min-h-0">
              <DailyLogPanel animal={animal} />
            </div>

            <PersonalityPanel animal={animal} />
            <NotesPanel animal={animal} animalId={animalId} />
          </div>

        </div>
      </main>
    </div>
  )
}
