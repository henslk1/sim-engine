import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton } from "@/components/game/ui"
import { Dumbbell, Ban, Loader2, Zap, TrendingUp, TrendingDown, HeartHandshake } from "lucide-react"
import { getTrainingCap, getActiveRestrictions } from "../utils"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

type Stat = AnimalProfile["stats"][number]
type IntensityTier = AnimalProfile["game"]["intensityTierDefs"][number]
type StageActivity = AnimalProfile["lifeStage"]["stageActivityDefs"][number]
type Personality = AnimalProfile["personality"][number]

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

  const canTrainStage = animal.lifeStage.canTrain
  const activities = animal.lifeStage.stageActivityDefs

  return (
    <Panel
      title={canTrainStage ? "Training" : "Bonding"}
      icon={canTrainStage ? <Dumbbell className="size-4 text-chart-2" /> : <HeartHandshake className="size-4 text-chart-5" />}
      action={canTrainStage && config ? <Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge> : undefined}
    >
      {!canTrainStage ? (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Training is not available at this life stage.
          </p>

          {activities.length > 0 && (
            <>
              {/* Personality */}
              {animal.personality.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Personality
                  </h4>
                  <div className="space-y-1.5">
                    {animal.personality.map((trait: Personality) => (
                      <div key={trait.traitDef.name}>
                        <div className="mb-0.5 flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{trait.traitDef.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {trait.traitLabel && (
                              <span className="mr-1.5 font-medium text-foreground">{trait.traitLabel}</span>
                            )}
                            <span className="tabular-nums">{Math.round(trait.value)}</span>
                          </span>
                        </div>
                        <Meter value={trait.value} max={100} tone="mood" className="h-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stage activities */}
              <div>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Stage Activities
                </h4>
                <div className="space-y-1.5">
                  {activities.map((activity: StageActivity) => (
                    <div
                      key={activity.id}
                      className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{activity.name}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={cn(
                            "flex items-center gap-0.5 text-[11px] font-medium",
                            activity.traitEffect > 0 ? "text-chart-2" : "text-destructive"
                          )}>
                            {activity.traitEffect > 0
                              ? <TrendingUp className="size-3" />
                              : <TrendingDown className="size-3" />
                            }
                            {activity.traitDef.name}
                          </span>
                          <Badge tone="muted">{Math.round(activity.energyCost)} energy</Badge>
                        </div>
                      </div>
                      {activity.description && (
                        <p className="mb-1.5 text-[11px] text-muted-foreground">{activity.description}</p>
                      )}
                      {!readonly && (
                        <ActionButton variant="soft" disabled className="w-full justify-center">
                          <Zap className="size-3.5" /> Perform
                        </ActionButton>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}
    </Panel>
  )
}
