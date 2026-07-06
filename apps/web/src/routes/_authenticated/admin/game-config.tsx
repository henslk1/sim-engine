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
    containerLabel: "",
    subContainerLabel: "",
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
          containerLabel: data.gameConfig.containerLabel ?? "",
          subContainerLabel: data.gameConfig.subContainerLabel ?? "",
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
                <p className="text-[11px] text-muted-foreground">Energy deducted from each animal when breeding</p>
                <Input type="number" step="0.1" min="0"
                  value={configForm.breedingEnergyCost}
                  onChange={(e) => setConfigForm(f => ({ ...f, breedingEnergyCost: parseFloat(e.target.value) }))} />
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
            {saveConfig.error && <p className="text-sm text-destructive">{saveConfig.error.message}</p>}
            <Button
              onClick={() => saveConfig.mutate({
                gameId: data.id,
                ...configForm,
                containerLabel: configForm.containerLabel || undefined,
                subContainerLabel: configForm.subContainerLabel || undefined,
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