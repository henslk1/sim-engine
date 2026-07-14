import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/admin/game-config")({
  component: GameConfigPage,
})

function GameConfigPage() {
  const { data, isLoading } = trpc.admin.game.get.useQuery()
  const utils = trpc.useUtils()

  const [gameForm, setGameForm] = useState({ name: "", slug: "", isActive: false })
  const [configForm, setConfigForm] = useState({
    defaultInnateRatio: 0,
    trainingCeilingMultiplier: 0,
    pedigreeDisplayDepth: 0,
    predictorDailyLimitFree: 0,
    breedingEnergyCost: 0,
    maxBreedingSlots: "",
    containerLabel: "",
    subContainerLabel: "",
    gestationCycles: 12,
    cyclesPerYear: 12,
    moodDecayRate: 0,
    conditionDecayRate: 0,
    conditionWorkGain: 0,
    careScoreDecayRate: 0,
    careScoreFloor: 0,
    careScoreCeiling: 100,
    careScoreRecoveryRate: 0,
    immunityDecayRate: 0,
    immunityRecoveryRate: 0,
    immunityMin: 0,
    immunityMax: 100,
    energyLowCareThreshold: 0,
    energyLowCarePenalty: 0,
    lifeExpectancyBaseline: "",
    breedingBaseGain: 30,
    breedingMinGain: 4,
    breedingVarianceFactor: 0,
    gestationCareFloor: 0.7,
    predictorCost: 0,
    predictorDailyLimitSubscriber: 0,
    multiplesBirthCap: 1,
    multiplesChance: 0,
    identicalMultiplesChance: 0,
    ultrasoundOpenCycle: 0,
  })

  useEffect(() => {
    if (data) {
      setGameForm({ name: data.name, slug: data.slug, isActive: data.isActive })
      if (data.gameConfig) {
        setConfigForm({
          defaultInnateRatio: data.gameConfig.defaultInnateRatio,
          trainingCeilingMultiplier: data.gameConfig.trainingCeilingMultiplier,
          pedigreeDisplayDepth: data.gameConfig.pedigreeDisplayDepth,
          predictorDailyLimitFree: data.gameConfig.predictorDailyLimitFree,
          breedingEnergyCost: data.gameConfig.breedingEnergyCost,
          maxBreedingSlots: data.gameConfig.maxBreedingSlots?.toString() ?? "",
          containerLabel: data.gameConfig.containerLabel ?? "",
          subContainerLabel: data.gameConfig.subContainerLabel ?? "",
          gestationCycles: data.gameConfig.gestationCycles,
          cyclesPerYear: data.gameConfig.cyclesPerYear,
          moodDecayRate: data.gameConfig.moodDecayRate,
          conditionDecayRate: data.gameConfig.conditionDecayRate,
          conditionWorkGain: data.gameConfig.conditionWorkGain,
          careScoreDecayRate: data.gameConfig.careScoreDecayRate,
          careScoreFloor: data.gameConfig.careScoreFloor,
          careScoreCeiling: data.gameConfig.careScoreCeiling,
          careScoreRecoveryRate: data.gameConfig.careScoreRecoveryRate,
          immunityDecayRate: data.gameConfig.immunityDecayRate,
          immunityRecoveryRate: data.gameConfig.immunityRecoveryRate,
          immunityMin: data.gameConfig.immunityMin,
          immunityMax: data.gameConfig.immunityMax,
          energyLowCareThreshold: data.gameConfig.energyLowCareThreshold,
          energyLowCarePenalty: data.gameConfig.energyLowCarePenalty,
          lifeExpectancyBaseline: data.gameConfig.lifeExpectancyBaseline?.toString() ?? "",
          breedingBaseGain: data.gameConfig.breedingBaseGain,
          breedingMinGain: data.gameConfig.breedingMinGain,
          breedingVarianceFactor: data.gameConfig.breedingVarianceFactor,
          gestationCareFloor: data.gameConfig.gestationCareFloor,
          predictorCost: data.gameConfig.predictorCost,
          predictorDailyLimitSubscriber: data.gameConfig.predictorDailyLimitSubscriber,
          multiplesBirthCap: data.gameConfig.multiplesBirthCap,
          multiplesChance: data.gameConfig.multiplesChance,
          identicalMultiplesChance: data.gameConfig.identicalMultiplesChance,
          ultrasoundOpenCycle: data.gameConfig.ultrasoundOpenCycle,
        })
      }
    }
  }, [data])

  const saveGame = trpc.admin.game.saveGame.useMutation({
    onSuccess: () => utils.admin.game.get.invalidate(),
  })

  const saveConfig = trpc.admin.game.saveConfig.useMutation({
    onSuccess: () => utils.admin.game.get.invalidate(),
  })

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Game Config</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Game Identity</h2>
        </header>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
            <Input value={gameForm.name} onChange={(e) => setGameForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</label>
            <Input value={gameForm.slug} onChange={(e) => setGameForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. horse-game" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={gameForm.isActive}
              onChange={(e) => setGameForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="isActive" className="text-sm text-foreground">Active</label>
          </div>
          {saveGame.error && <p className="text-sm text-destructive">{saveGame.error.message}</p>}
          <Button onClick={() => saveGame.mutate({ id: data?.id, ...gameForm })} disabled={saveGame.isPending}>
            {saveGame.isPending ? "Saving…" : "Save Game"}
          </Button>
        </div>
      </section>

      {data && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Game Settings</h2>
          </header>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default Innate Ratio</label>
                <p className="text-[11px] text-muted-foreground">Innate share of total stats for first-gen crosses (0–1)</p>
                <Input type="number" step="0.01" min="0" max="1"
                  value={configForm.defaultInnateRatio}
                  onChange={(e) => setConfigForm(f => ({ ...f, defaultInnateRatio: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Training Ceiling Multiplier</label>
                <p className="text-[11px] text-muted-foreground">Max trained value as a multiple of innate</p>
                <Input type="number" step="0.1" min="0"
                  value={configForm.trainingCeilingMultiplier}
                  onChange={(e) => setConfigForm(f => ({ ...f, trainingCeilingMultiplier: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pedigree Display Depth</label>
                <p className="text-[11px] text-muted-foreground">Generations shown in pedigree view</p>
                <Input type="number" step="1" min="1"
                  value={configForm.pedigreeDisplayDepth}
                  onChange={(e) => setConfigForm(f => ({ ...f, pedigreeDisplayDepth: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Predictor Daily Limit (Free)</label>
                <p className="text-[11px] text-muted-foreground">Daily breeding predictor uses for free players</p>
                <Input type="number" step="1" min="0"
                  value={configForm.predictorDailyLimitFree}
                  onChange={(e) => setConfigForm(f => ({ ...f, predictorDailyLimitFree: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Breeding Energy Cost</label>
                <p className="text-[11px] text-muted-foreground">Energy deducted when stud owner adds a slot</p>
                <Input type="number" step="0.1" min="0"
                  value={configForm.breedingEnergyCost}
                  onChange={(e) => setConfigForm(f => ({ ...f, breedingEnergyCost: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max Breeding Slots <span className="font-normal">(optional)</span></label>
                <p className="text-[11px] text-muted-foreground">Cap on AVAILABLE slots per stud listing (items can raise this)</p>
                <Input type="number" step="1" min="1"
                  value={configForm.maxBreedingSlots}
                  onChange={(e) => setConfigForm(f => ({ ...f, maxBreedingSlots: e.target.value }))}
                  placeholder="e.g. 5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Container Label</label>
                <p className="text-[11px] text-muted-foreground">Custom name for player containers</p>
                <Input value={configForm.containerLabel}
                  onChange={(e) => setConfigForm(f => ({ ...f, containerLabel: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sub-Container Label</label>
                <p className="text-[11px] text-muted-foreground">Custom name for sub-containers</p>
                <Input value={configForm.subContainerLabel}
                  onChange={(e) => setConfigForm(f => ({ ...f, subContainerLabel: e.target.value }))} />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Time</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cycles Per Year</label>
                <p className="text-[11px] text-muted-foreground">Used to display ages in years/months</p>
                <Input type="number" step="1" min="1" value={configForm.cyclesPerYear}
                  onChange={(e) => setConfigForm(f => ({ ...f, cyclesPerYear: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gestation Cycles</label>
                <p className="text-[11px] text-muted-foreground">Pregnancy duration in cycles</p>
                <Input type="number" step="1" min="1" value={configForm.gestationCycles}
                  onChange={(e) => setConfigForm(f => ({ ...f, gestationCycles: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Life Expectancy Baseline <span className="font-normal">(optional)</span></label>
                <p className="text-[11px] text-muted-foreground">Default life expectancy in cycles (overridable per breed)</p>
                <Input type="number" step="1" min="1" value={configForm.lifeExpectancyBaseline}
                  onChange={(e) => setConfigForm(f => ({ ...f, lifeExpectancyBaseline: e.target.value }))}
                  placeholder="e.g. 144" />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Care & Condition</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mood Decay Rate</label>
                <Input type="number" step="0.001" value={configForm.moodDecayRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, moodDecayRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Condition Decay Rate</label>
                <Input type="number" step="0.001" value={configForm.conditionDecayRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, conditionDecayRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Condition Work Gain</label>
                <Input type="number" step="0.001" value={configForm.conditionWorkGain}
                  onChange={(e) => setConfigForm(f => ({ ...f, conditionWorkGain: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Care Score Decay Rate</label>
                <Input type="number" step="0.001" value={configForm.careScoreDecayRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, careScoreDecayRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Care Score Recovery Rate</label>
                <Input type="number" step="0.001" value={configForm.careScoreRecoveryRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, careScoreRecoveryRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Care Score Floor / Ceiling</label>
                <div className="flex gap-2">
                  <Input type="number" step="0.1" placeholder="Floor" value={configForm.careScoreFloor}
                    onChange={(e) => setConfigForm(f => ({ ...f, careScoreFloor: parseFloat(e.target.value) }))} />
                  <Input type="number" step="0.1" placeholder="Ceiling" value={configForm.careScoreCeiling}
                    onChange={(e) => setConfigForm(f => ({ ...f, careScoreCeiling: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Energy Low Care Threshold</label>
                <Input type="number" step="0.01" value={configForm.energyLowCareThreshold}
                  onChange={(e) => setConfigForm(f => ({ ...f, energyLowCareThreshold: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Energy Low Care Penalty</label>
                <Input type="number" step="0.01" value={configForm.energyLowCarePenalty}
                  onChange={(e) => setConfigForm(f => ({ ...f, energyLowCarePenalty: parseFloat(e.target.value) }))} />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Immunity</p>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decay Rate</label>
                <Input type="number" step="0.001" value={configForm.immunityDecayRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, immunityDecayRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recovery Rate</label>
                <Input type="number" step="0.001" value={configForm.immunityRecoveryRate}
                  onChange={(e) => setConfigForm(f => ({ ...f, immunityRecoveryRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Min</label>
                <Input type="number" step="0.1" value={configForm.immunityMin}
                  onChange={(e) => setConfigForm(f => ({ ...f, immunityMin: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max</label>
                <Input type="number" step="0.1" value={configForm.immunityMax}
                  onChange={(e) => setConfigForm(f => ({ ...f, immunityMax: parseFloat(e.target.value) }))} />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Breeding Engine</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base Gain</label>
                <p className="text-[11px] text-muted-foreground">Stat gain multiplier per generation (headroom curve)</p>
                <Input type="number" step="0.1" min="0" value={configForm.breedingBaseGain}
                  onChange={(e) => setConfigForm(f => ({ ...f, breedingBaseGain: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Min Gain</label>
                <p className="text-[11px] text-muted-foreground">Floor gain when at the top of the server; bootstraps early game</p>
                <Input type="number" step="0.1" min="0" value={configForm.breedingMinGain}
                  onChange={(e) => setConfigForm(f => ({ ...f, breedingMinGain: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variance Factor</label>
                <p className="text-[11px] text-muted-foreground">±fraction of computed gain applied as random variance (0–1)</p>
                <Input type="number" step="0.01" min="0" max="1" value={configForm.breedingVarianceFactor}
                  onChange={(e) => setConfigForm(f => ({ ...f, breedingVarianceFactor: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gestation Care Floor</label>
                <p className="text-[11px] text-muted-foreground">Minimum care multiplier applied to offspring stats at birth (0–1)</p>
                <Input type="number" step="0.01" min="0" max="1" value={configForm.gestationCareFloor}
                  onChange={(e) => setConfigForm(f => ({ ...f, gestationCareFloor: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Predictor Cost</label>
                <p className="text-[11px] text-muted-foreground">Currency cost per predictor use (charged regardless of subscription)</p>
                <Input type="number" step="1" min="0" value={configForm.predictorCost}
                  onChange={(e) => setConfigForm(f => ({ ...f, predictorCost: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Predictor Daily Limit (Subscriber)</label>
                <p className="text-[11px] text-muted-foreground">0 = unlimited for subscribers</p>
                <Input type="number" step="1" min="0" value={configForm.predictorDailyLimitSubscriber}
                  onChange={(e) => setConfigForm(f => ({ ...f, predictorDailyLimitSubscriber: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Multiples Birth Cap</label>
                <p className="text-[11px] text-muted-foreground">Max offspring per birth (1 = singles only)</p>
                <Input type="number" step="1" min="1" value={configForm.multiplesBirthCap}
                  onChange={(e) => setConfigForm(f => ({ ...f, multiplesBirthCap: parseInt(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Multiples Chance</label>
                <p className="text-[11px] text-muted-foreground">Probability of producing more than 1 offspring (0–1)</p>
                <Input type="number" step="0.01" min="0" max="1" value={configForm.multiplesChance}
                  onChange={(e) => setConfigForm(f => ({ ...f, multiplesChance: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identical Multiples Chance</label>
                <p className="text-[11px] text-muted-foreground">Of all multiples, fraction that share genetics (0–1)</p>
                <Input type="number" step="0.01" min="0" max="1" value={configForm.identicalMultiplesChance}
                  onChange={(e) => setConfigForm(f => ({ ...f, identicalMultiplesChance: parseFloat(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ultrasound Open Cycle</label>
                <p className="text-[11px] text-muted-foreground">Gestation cycle at which ultrasound becomes available (0 = immediate)</p>
                <Input type="number" step="1" min="0" value={configForm.ultrasoundOpenCycle}
                  onChange={(e) => setConfigForm(f => ({ ...f, ultrasoundOpenCycle: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            {saveConfig.error && <p className="text-sm text-destructive">{saveConfig.error.message}</p>}
            <Button
              onClick={() => saveConfig.mutate({
                gameId: data.id,
                ...configForm,
                containerLabel: configForm.containerLabel || undefined,
                subContainerLabel: configForm.subContainerLabel || undefined,
                lifeExpectancyBaseline: configForm.lifeExpectancyBaseline !== "" ? parseInt(configForm.lifeExpectancyBaseline) : null,
              maxBreedingSlots: configForm.maxBreedingSlots !== "" ? parseInt(configForm.maxBreedingSlots) : null,
              })}
              disabled={saveConfig.isPending}
            >
              {saveConfig.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}