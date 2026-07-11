import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton } from "@/components/game/ui"
import { Dumbbell, Ban, Loader2, Zap } from "lucide-react"
import { getTrainingCap, getActiveRestrictions } from "../utils"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

type Stat = AnimalProfile["stats"][number]
type IntensityTier = AnimalProfile["game"]["intensityTierDefs"][number]

export function TrainingPanel({
  animal,
  config,
  readonly = false,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
  readonly?: boolean
}) {
  const tiers = animal.game.intensityTierDefs
  const [selectedTier, setSelectedTier] = useState<Record<string, string>>({})
  const [pendingStatId, setPendingStatId] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { mutate: train } = trpc.training.perform.useMutation({
    onSettled: () => {
      setPendingStatId(null)
      utils.animalProfile.get.invalidate({ animalId: animal.id })
    },
  })

  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("TRAINING") || restrictions.has("ALL")

  const maxAllowedTierIndex = (() => {
    for (const record of animal.healthRecords) {
      if (!record.isActive) continue
      for (const t of record.treatmentRecords) {
        if (!t.isActive) continue
        for (const rd of t.treatmentDef.restrictionDefs) {
          if ((rd.restrictionType === "TRAINING" || rd.restrictionType === "ALL") && rd.maxIntensityTier != null) {
            return rd.maxIntensityTier
          }
        }
      }
    }
    return null
  })()

  return (
    <Panel
      title="Training"
      icon={<Dumbbell className="size-4 text-chart-2" />}
      action={config ? <Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge> : undefined}
    >
      {isRestricted && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <Ban className="size-3 shrink-0" />
          Training restricted due to active treatment
        </div>
      )}
      <div className="space-y-2">
        {animal.stats.map((stat: Stat) => {
          const cap = getTrainingCap(stat.innateValue, config)
          const trainingDef = animal.game.trainingActionDefs.find((d) => d.statDefId === stat.statDef.id)
          const tierId = selectedTier[stat.statDef.id] ?? tiers[0]?.id
          const tier = tiers.find((t) => t.id === tierId)
          const isPending = pendingStatId === stat.statDef.id
          const tierLocked = maxAllowedTierIndex != null && tier != null && tier.tierIndex > maxAllowedTierIndex
          const canTrain = !isRestricted && !tierLocked && !!trainingDef && !!tier && !isPending

          return (
            <div key={stat.statDef.name} className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{stat.statDef.name}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{Math.round(stat.trainedValue)}</span> / {Math.round(cap)}
                </span>
              </div>
              <Meter value={stat.trainedValue} max={cap} tone="condition" className="mb-2 h-1.5" />

              {!readonly && tiers.length > 0 && (
                <div className="mb-1.5 flex gap-1">
                  {tiers.map((t: IntensityTier) => {
                    const locked = maxAllowedTierIndex != null && t.tierIndex > maxAllowedTierIndex
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={locked || isRestricted}
                        onClick={() => setSelectedTier((prev) => ({ ...prev, [stat.statDef.id]: t.id }))}
                        className={cn(
                          "flex-1 rounded px-1.5 py-1 text-[11px] font-semibold transition-colors",
                          tierId === t.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                          (locked || isRestricted) && "cursor-not-allowed opacity-40"
                        )}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {!readonly && (
                <ActionButton
                  variant="soft"
                  disabled={!canTrain}
                  className="w-full justify-center"
                  onClick={() => {
                    if (!canTrain || !trainingDef || !tierId) return
                    setPendingStatId(stat.statDef.id)
                    train({ animalId: animal.id, trainingActionDefId: trainingDef.id, intensityTierDefId: tierId })
                  }}
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="size-3.5" />
                      Train{tier ? ` · ${Math.round(tier.energyCost)} energy` : ""}
                    </>
                  )}
                </ActionButton>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
