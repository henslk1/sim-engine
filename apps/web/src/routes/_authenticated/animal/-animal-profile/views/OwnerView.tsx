import { useState, useEffect } from "react"
import type { AnimalProfile } from "../types"
import { formatCycleAge, computeBreedingGrade } from "../utils"
import { Badge, Meter } from "@/components/game/ui"
import { ActionButton } from "@/components/game/ui"
import { Stethoscope, Clock, Loader2 } from "lucide-react"
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
import { EquipModal } from "../panels/EquipModal"
import { ConformationPanel } from "../panels/ConformationPanel"
import { BirthDialog } from "../BirthDialog"


export function OwnerView({ animal, animalId, playerAccountId }: { animal: AnimalProfile; animalId: string; playerAccountId: string }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const breedingGrade = computeBreedingGrade(animal, config)
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)

  const [birthPregnancyId, setBirthPregnancyId] = useState<string | null>(null)
  const [equipOpen, setEquipOpen] = useState(false)

  // Auto-open if there's already a completed pregnancy with unborn offspring (e.g. navigated away mid-flow)
  useEffect(() => {
    const pending = animal.pregnancies.find(
      (p) => p.isCompleted && p.offspring.some((o) => o.animal.status === "EMBRYO_STORED")
    )
    if (pending) setBirthPregnancyId(pending.id)
  }, [animal.id])

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId })

  const { mutate: advanceAge, isPending: advancePending } = trpc.animal.advanceAge.useMutation({
    onSuccess: (data) => {
      if (data?.pregnancyCompleted) setBirthPregnancyId(data.pregnancyCompleted)
      if (data?.tutorialConditionResolved) window.dispatchEvent(new Event("tutorial:conditionResolved"))
      window.dispatchEvent(new Event("tutorial:ageAdvanced"))
      invalidate()
    },
  })

  const statTutorialKeys: Record<string, string> = {
    Energy: "stat-energy",
    Mood: "stat-mood",
    Condition: "stat-condition",
    Care: "stat-care-score",
    Immunity: "stat-immunity",
  }

  return (
    <div data-tutorial="animal-profile" className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">

      {birthPregnancyId && (
        <BirthDialog
          pregnancyId={birthPregnancyId}
          onClose={() => setBirthPregnancyId(null)}
          onBorn={invalidate}
        />
      )}

      {/* Header + info strip */}
      <div className="flex shrink-0 flex-col items-center border-b border-border bg-card px-4 pt-4">
        <div data-tutorial="animal-header" className="flex w-full max-w-5xl flex-col items-center gap-3">
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

          <ActionButton
            data-tutorial="advance-age"
            variant="soft"
            disabled={advancePending || animal.status !== "ALIVE"}
            onClick={() => advanceAge({ animalId: animal.id })}
          >
            {advancePending ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
            Advance Age
          </ActionButton>

          {/* Vitals */}
          <div className="grid w-full max-w-lg grid-cols-5 gap-x-4 gap-y-2">
          {(
            [
              { label: "Energy", value: animal.energy?.currentEnergy ?? 0, max: animal.energy?.maxEnergy ?? 100, tone: "energy" as const, threshold: (config?.overworkInjuryThreshold ?? 0) > 0 ? config?.overworkInjuryThreshold ?? undefined : undefined },
              { label: "Mood", value: animal.mood?.value ?? 0, max: 100, tone: "mood" as const },
              { label: "Condition", value: animal.condition?.value ?? 0, max: 100, tone: "condition" as const },
              { label: "Care", value: animal.careScore?.score ?? 0, max: 100, tone: "care" as const },
              { label: "Immunity", value: animal.immunity?.value ?? 0, max: animal.immunity?.innateMax ?? 100, tone: "immunity" as const },
            ] as const
          ).map((v) => (
            <div key={v.label} data-tutorial={statTutorialKeys[v.label]}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{v.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-foreground">{Math.round(v.value)}</span>
              </div>
              <Meter value={v.value} max={v.max} tone={v.tone} threshold={"threshold" in v ? v.threshold : undefined} />
            </div>
          ))}
          </div>

          <div className="w-full">
            <AlertBanner animal={animal} />
            <InfoStrip
              animal={animal}
              cycleToAge={cycleToAge}
              breedingGrade={breedingGrade}
            />
          </div>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1400px]:h-full min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.6fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">

          {/* Col 1 — Breeding / Health / Notes */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            {animal.lifeStage.canBreed && <BreedingPanel animal={animal} breedingGrade={breedingGrade} />}
            <HealthPanel animal={animal} playerAccountId={playerAccountId} />
            <NotesPanel animal={animal} animalId={animalId} />
          </div>

          {/* Col 2 — Training / Competition */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            {(animal.lifeStage.canTrain || animal.lifeStage.hasUniqueActionSet) && <TrainingPanel animal={animal} config={config} />}
            {animal.lifeStage.canCompete && <CompetitionPanel animal={animal} />}
          </div>

          {/* Col 3 — Animal image + WorkspaceTabs */}
          <div className="order-first flex min-h-0 flex-col gap-3 min-[1400px]:order-0 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">
            <div className="relative flex aspect-9/5 w-full shrink-0 items-end overflow-hidden rounded-lg border border-border bg-linear-to-br from-secondary to-muted shadow-sm">
              <div className="w-full bg-linear-to-t from-card/90 to-transparent px-4 py-3">
                <p className="font-serif text-lg font-semibold text-foreground">{animal.name}</p>
                <p className="text-xs text-muted-foreground">
                  {animal.breed?.name ?? animal.breedName ?? "Unknown"} · {animal.lifeStage.name}
                </p>
              </div>
            </div>
            <WorkspaceTabs animal={animal} animalId={animalId} cycleToAge={cycleToAge} config={config} />
          </div>

          {/* Col 4+5 — Care / Owner Actions / Equipped / Conformation / DailyLog / Personality / Notes */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:col-span-2 min-[1400px]:grid min-[1400px]:grid-flow-row-dense min-[1400px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[1400px]:grid-rows-[auto_auto_auto_minmax(0,1fr)]">
            {animal.lifeStage.canReceiveCare && <DailyCarePanel animal={animal} playerAccountId={playerAccountId} />}

            {/* Owner Actions */}
            <div data-tutorial="owner-actions" className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Owner Actions</h3>
              </header>
              <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
                <OwnerActionList animal={animal} playerAccountId={playerAccountId} onEquipOpen={() => setEquipOpen(true)} />
              </div>
            </div>

            {/* Equipped — pinned to col 2, directly under Owner Actions */}
            <div id="equipped-section" className="min-[1400px]:col-start-2">
              <EquippedPanel animal={animal} />
            </div>

            <ConformationPanel animal={animal} />
            <div className="min-[1400px]:col-start-2 min-[1400px]:row-span-2 min-[1400px]:min-h-0">
              <DailyLogPanel animal={animal} />
            </div>

            {(animal.lifeStage.canTrain || !animal.lifeStage.hasUniqueActionSet) && (
              <PersonalityPanel animal={animal} />
            )}
          </div>

        </div>
      </main>

      {equipOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEquipOpen(false)}
        >
          <div className="w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <EquipModal animal={animal} playerAccountId={playerAccountId} onClose={() => setEquipOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
