import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/config")({
  component: GameConfigPage,
})

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card shadow-sm ${className ?? ""}`}>
      <div className="border-b border-border bg-secondary/40 px-3 py-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function GameConfigPage() {
  const { gameId } = Route.useParams()
  const { data, isLoading } = trpc.admin.game.get.useQuery()
  const utils = trpc.useUtils()

  const [gameForm, setGameForm] = useState({ name: "", slug: "", isActive: false })
  const [cf, setCf] = useState({
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
    breedingCooldownCycles: 0,
    geneticCollectionCooldownCycles: 0,
    conformationInspectionMinCycle: 0,
  })

  function n(key: keyof typeof cf, float = false) {
    return {
      value: cf[key] as number,
      className: "h-8 text-sm",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setCf(prev => ({ ...prev, [key]: float ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0 })),
    }
  }
  function s(key: keyof typeof cf) {
    return {
      value: cf[key] as string,
      className: "h-8 text-sm",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCf(prev => ({ ...prev, [key]: e.target.value })),
    }
  }

  useEffect(() => {
    if (data) {
      setGameForm({ name: data.name, slug: data.slug, isActive: data.isActive })
      if (data.gameConfig) {
        const g = data.gameConfig
        setCf({
          defaultInnateRatio: g.defaultInnateRatio,
          trainingCeilingMultiplier: g.trainingCeilingMultiplier,
          pedigreeDisplayDepth: g.pedigreeDisplayDepth,
          predictorDailyLimitFree: g.predictorDailyLimitFree,
          breedingEnergyCost: g.breedingEnergyCost,
          maxBreedingSlots: g.maxBreedingSlots?.toString() ?? "",
          containerLabel: g.containerLabel ?? "",
          subContainerLabel: g.subContainerLabel ?? "",
          gestationCycles: g.gestationCycles,
          cyclesPerYear: g.cyclesPerYear,
          moodDecayRate: g.moodDecayRate,
          conditionDecayRate: g.conditionDecayRate,
          conditionWorkGain: g.conditionWorkGain,
          careScoreDecayRate: g.careScoreDecayRate,
          careScoreFloor: g.careScoreFloor,
          careScoreCeiling: g.careScoreCeiling,
          careScoreRecoveryRate: g.careScoreRecoveryRate,
          immunityDecayRate: g.immunityDecayRate,
          immunityRecoveryRate: g.immunityRecoveryRate,
          immunityMin: g.immunityMin,
          immunityMax: g.immunityMax,
          energyLowCareThreshold: g.energyLowCareThreshold,
          energyLowCarePenalty: g.energyLowCarePenalty,
          lifeExpectancyBaseline: g.lifeExpectancyBaseline?.toString() ?? "",
          breedingBaseGain: g.breedingBaseGain,
          breedingMinGain: g.breedingMinGain,
          breedingVarianceFactor: g.breedingVarianceFactor,
          gestationCareFloor: g.gestationCareFloor,
          predictorCost: g.predictorCost,
          predictorDailyLimitSubscriber: g.predictorDailyLimitSubscriber,
          multiplesBirthCap: g.multiplesBirthCap,
          multiplesChance: g.multiplesChance,
          identicalMultiplesChance: g.identicalMultiplesChance,
          ultrasoundOpenCycle: g.ultrasoundOpenCycle,
          breedingCooldownCycles: g.breedingCooldownCycles,
          geneticCollectionCooldownCycles: g.geneticCollectionCooldownCycles,
          conformationInspectionMinCycle: g.conformationInspectionMinCycle,
        })
      }
    }
  }, [data])

  const saveGame = trpc.admin.game.saveGame.useMutation({ onSuccess: () => utils.admin.game.get.invalidate() })
  const saveConfig = trpc.admin.game.saveConfig.useMutation({ onSuccess: () => utils.admin.game.get.invalidate() })

  function handleSaveConfig() {
    saveConfig.mutate({
      gameId: gameId!,
      ...cf,
      containerLabel: cf.containerLabel || undefined,
      subContainerLabel: cf.subContainerLabel || undefined,
      lifeExpectancyBaseline: cf.lifeExpectancyBaseline !== "" ? parseInt(cf.lifeExpectancyBaseline) : null,
      maxBreedingSlots: cf.maxBreedingSlots !== "" ? parseInt(cf.maxBreedingSlots) : null,
    })
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="font-serif text-xl font-semibold text-foreground">Game Config</h1>

      {/* Identity — inline row, no panel */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-1 w-52">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
          <Input className="h-8 text-sm" value={gameForm.name} onChange={e => setGameForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1 w-44">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Slug</label>
          <Input className="h-8 text-sm" value={gameForm.slug} onChange={e => setGameForm(f => ({ ...f, slug: e.target.value }))} placeholder="horse-game" />
        </div>
        <label className="flex items-center gap-1.5 pb-1 cursor-pointer text-sm text-foreground">
          <input type="checkbox" checked={gameForm.isActive} onChange={e => setGameForm(f => ({ ...f, isActive: e.target.checked }))} />
          Active
        </label>
        {saveGame.error && <p className="text-sm text-destructive pb-1">{saveGame.error.message}</p>}
        <Button className="h-8 text-sm" onClick={() => saveGame.mutate({ id: gameId, ...gameForm })} disabled={saveGame.isPending}>
          {saveGame.isPending ? "Saving…" : "Save Game"}
        </Button>
      </div>

      {data && (
        <>
          {/* 3-column panel grid */}
          <div className="grid grid-cols-3 gap-3">

            {/* Col 1 Row 1: General */}
            <Panel title="General">
              <div className="grid grid-cols-2 gap-2">
                <F label="Innate Ratio"><Input type="number" step="0.01" min="0" max="1" {...n("defaultInnateRatio", true)} /></F>
                <F label="Training Ceiling"><Input type="number" step="0.1" min="0" {...n("trainingCeilingMultiplier", true)} /></F>
                <F label="Pedigree Depth"><Input type="number" step="1" min="1" {...n("pedigreeDisplayDepth")} /></F>
                <F label="Container Label"><Input {...s("containerLabel")} placeholder="Stable" /></F>
                <F label="Sub-Container Label" ><Input {...s("subContainerLabel")} placeholder="Stall" /></F>
              </div>
            </Panel>

            {/* Col 2 Row 1: Time */}
            <Panel title="Time">
              <div className="space-y-2">
                <F label="Cycles Per Year"><Input type="number" step="1" min="1" {...n("cyclesPerYear")} /></F>
                <F label="Gestation Cycles"><Input type="number" step="1" min="1" {...n("gestationCycles")} /></F>
                <F label="Life Expectancy Baseline"><Input type="number" step="1" min="1" {...s("lifeExpectancyBaseline")} placeholder="e.g. 144" /></F>
              </div>
            </Panel>

            {/* Col 3 Row 1: Predictor */}
            <Panel title="Breeding Predictor">
              <div className="space-y-2">
                <F label="Cost per Use"><Input type="number" step="1" min="0" {...n("predictorCost")} /></F>
                <F label="Daily Limit — Free"><Input type="number" step="1" min="0" {...n("predictorDailyLimitFree")} /></F>
                <F label="Daily Limit — Subscribers"><Input type="number" step="1" min="0" {...n("predictorDailyLimitSubscriber")} /></F>
              </div>
            </Panel>

            {/* Col 1 Row 2: Breeding */}
            <Panel title="Breeding">
              <div className="grid grid-cols-2 gap-2">
                <F label="Energy Cost"><Input type="number" step="0.1" min="0" {...n("breedingEnergyCost", true)} /></F>
                <F label="Max Slots"><Input type="number" step="1" min="1" {...s("maxBreedingSlots")} placeholder="—" /></F>
                <F label="Breeding Cooldown"><Input type="number" step="1" min="0" {...n("breedingCooldownCycles")} /></F>
                <F label="Collection Cooldown"><Input type="number" step="1" min="0" {...n("geneticCollectionCooldownCycles")} /></F>
                <F label="Ultrasound Open Cycle"><Input type="number" step="1" min="0" {...n("ultrasoundOpenCycle")} /></F>
                <F label="Inspection Min Cycle"><Input type="number" step="1" min="0" {...n("conformationInspectionMinCycle")} /></F>
              </div>
            </Panel>

            {/* Col 2 Row 2: Breeding Engine */}
            <Panel title="Breeding Engine">
              <div className="grid grid-cols-2 gap-2">
                <F label="Base Gain"><Input type="number" step="0.1" min="0" {...n("breedingBaseGain", true)} /></F>
                <F label="Min Gain"><Input type="number" step="0.1" min="0" {...n("breedingMinGain", true)} /></F>
                <F label="Variance Factor"><Input type="number" step="0.01" min="0" max="1" {...n("breedingVarianceFactor", true)} /></F>
                <F label="Gestation Care Floor"><Input type="number" step="0.01" min="0" max="1" {...n("gestationCareFloor", true)} /></F>
              </div>
            </Panel>

            {/* Col 3 Row 2: Multiples */}
            <Panel title="Multiples">
              <div className="space-y-2">
                <F label="Birth Cap"><Input type="number" step="1" min="1" {...n("multiplesBirthCap")} /></F>
                <F label="Multiples Chance (0–1)"><Input type="number" step="0.01" min="0" max="1" {...n("multiplesChance", true)} /></F>
                <F label="Identical Chance (0–1)"><Input type="number" step="0.01" min="0" max="1" {...n("identicalMultiplesChance", true)} /></F>
              </div>
            </Panel>

            {/* Row 3: Care & Condition (span 2) + Immunity */}
            <Panel title="Care & Condition" className="col-span-2">
              <div className="grid grid-cols-4 gap-2">
                <F label="Mood Decay"><Input type="number" step="0.001" {...n("moodDecayRate", true)} /></F>
                <F label="Condition Decay"><Input type="number" step="0.001" {...n("conditionDecayRate", true)} /></F>
                <F label="Condition Work Gain"><Input type="number" step="0.001" {...n("conditionWorkGain", true)} /></F>
                <F label="Care Decay"><Input type="number" step="0.001" {...n("careScoreDecayRate", true)} /></F>
                <F label="Care Recovery"><Input type="number" step="0.001" {...n("careScoreRecoveryRate", true)} /></F>
                <F label="Care Floor"><Input type="number" step="0.1" {...n("careScoreFloor", true)} /></F>
                <F label="Care Ceiling"><Input type="number" step="0.1" {...n("careScoreCeiling", true)} /></F>
                <div />
                <F label="Energy Low Threshold"><Input type="number" step="0.01" {...n("energyLowCareThreshold", true)} /></F>
                <F label="Energy Low Penalty"><Input type="number" step="0.01" {...n("energyLowCarePenalty", true)} /></F>
              </div>
            </Panel>

            <Panel title="Immunity">
              <div className="grid grid-cols-2 gap-2">
                <F label="Decay Rate"><Input type="number" step="0.001" {...n("immunityDecayRate", true)} /></F>
                <F label="Recovery Rate"><Input type="number" step="0.001" {...n("immunityRecoveryRate", true)} /></F>
                <F label="Min"><Input type="number" step="0.1" {...n("immunityMin", true)} /></F>
                <F label="Max"><Input type="number" step="0.1" {...n("immunityMax", true)} /></F>
              </div>
            </Panel>
          </div>

          {saveConfig.error && <p className="text-sm text-destructive">{saveConfig.error.message}</p>}
          <Button onClick={handleSaveConfig} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </>
      )}
    </div>
  )
}
