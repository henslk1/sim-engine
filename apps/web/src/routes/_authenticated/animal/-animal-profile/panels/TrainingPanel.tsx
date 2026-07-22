import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton } from "@/components/game/ui"
import { Dumbbell, Ban, Loader2, Zap, HeartHandshake } from "lucide-react"
import { getTrainingCap, getActiveRestrictions } from "../utils"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

type Stat = AnimalProfile["stats"][number]
type IntensityTier = AnimalProfile["game"]["intensityTierDefs"][number]
type StageActivity = AnimalProfile["lifeStage"]["stageActivityDefs"][number]
type Personality = AnimalProfile["personality"][number]
type LabelRange = Personality["traitDef"]["labelRanges"][number]

function labelForValue(value: number, ranges: LabelRange[]): string | null {
  return ranges.find((r) => value >= r.minValue && value <= r.maxValue)?.label ?? null
}

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

  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const { mutate: train } = trpc.training.perform.useMutation({
    onSettled: () => {
      setPendingStatId(null)
      invalidate()
    },
  })

  const { mutate: perform } = trpc.stageActivity.perform.useMutation({
    onSettled: () => {
      setPendingActivityId(null)
      invalidate()
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

  const moodBlocksAll = tiers.length > 0 && tiers.every(
    (t) => t.minMood != null && (animal.mood?.value ?? 0) < t.minMood
  )
  const conditionBlocksAll = tiers.length > 0 && tiers.every(
    (t) => t.minCondition != null && (animal.condition?.value ?? 0) < t.minCondition
  )

  const canTrainStage = animal.lifeStage.canTrain
  const hasUniqueActionSet = animal.lifeStage.hasUniqueActionSet
  const activities = animal.lifeStage.stageActivityDefs

  return (
    <Panel
      title={canTrainStage ? "Training" : "Bonding"}
      icon={canTrainStage ? <Dumbbell className="size-4 text-chart-2" /> : <HeartHandshake className="size-4 text-chart-5" />}
      action={canTrainStage && config ? <Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge> : undefined}
    >
      {!canTrainStage ? (
        <div className="space-y-1.5">
          {!hasUniqueActionSet && (
            <p className="text-[11px] text-muted-foreground">
              Training is not available at this life stage.
            </p>
          )}

          {hasUniqueActionSet && animal.personality.map((trait: Personality) => {
            const traitActivities = activities.filter((a: StageActivity) => a.traitDef.id === trait.traitDef.id)
            const effectiveValue = trait.value + trait.personalityModifier
            const innateLabel = labelForValue(trait.value, trait.traitDef.labelRanges)
            const currentLabel = labelForValue(effectiveValue, trait.traitDef.labelRanges)
            const hasShifted = innateLabel !== currentLabel
            return (
              <div key={trait.traitDef.id} className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1.5">
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{trait.traitDef.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {trait.traitLabel && (
                      <span className="mr-1.5 font-medium text-foreground">{trait.traitLabel}</span>
                    )}
                    <span className="tabular-nums">{Math.round(effectiveValue)}</span>
                  </span>
                </div>
                <Meter value={effectiveValue} max={100} tone="mood" className="mb-1.5 h-1" />

                {traitActivities.length > 0 && (
                  <div className={cn("mt-1.5 gap-1.5", traitActivities.length > 1 ? "grid grid-cols-2" : "flex flex-col")}>
                    {[...traitActivities].sort((a, b) => a.traitEffect - b.traitEffect).map((activity: StageActivity) => {
                      const isPending = pendingActivityId === activity.id
                      const hasEnergy = (animal.energy?.currentEnergy ?? 0) >= activity.energyCost
                      const canPerform = !hasShifted && hasEnergy && !isPending
                      return (
                        <div key={activity.id} className={cn("rounded border border-border/50 bg-background/50 px-2 py-1.5", hasShifted && "opacity-50")}>
                          <div className="mb-0.5 flex items-center justify-between gap-1">
                            <span className="truncate text-[11px] font-semibold text-foreground">{activity.name}</span>
                            <span className={cn(
                              "shrink-0 text-[11px] font-semibold tabular-nums",
                              activity.traitEffect > 0 ? "text-chart-2" : "text-destructive"
                            )}>
                              {activity.traitEffect > 0 ? "+" : ""}{activity.traitEffect}
                            </span>
                          </div>
                          {activity.description && (
                            <p className="mb-1 text-[10px] text-muted-foreground leading-tight">{activity.description}</p>
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <Badge tone="muted">{Math.round(activity.energyCost)} energy</Badge>
                            {!readonly && (
                              <ActionButton
                                variant="soft"
                                disabled={!canPerform}
                                className="h-5 px-1.5 text-[10px]"
                                onClick={() => {
                                  if (!canPerform) return
                                  setPendingActivityId(activity.id)
                                  perform({ animalId: animal.id, stageActivityDefId: activity.id })
                                }}
                              >
                                {isPending ? <Loader2 className="size-3 animate-spin" /> : <><Zap className="size-3" /> Perform</>}
                              </ActionButton>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {hasShifted && (
                  <p className="mt-1 text-[10px] text-muted-foreground">Label shifted — locked</p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          {isRestricted && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              <Ban className="size-3 shrink-0" />
              Training restricted due to active treatment
            </div>
          )}
          <div className="space-y-1.5">
            {animal.stats.map((stat: Stat) => {
              const cap = getTrainingCap(stat.innateValue, config)
              const trainingDef = animal.game.trainingActionDefs.find((d) => d.statDefId === stat.statDef.id)
              const tierId = selectedTier[stat.statDef.id] ?? tiers[0]?.id
              const tier = tiers.find((t) => t.id === tierId)
              const isPending = pendingStatId === stat.statDef.id
              const atCap = stat.trainedValue >= cap
              const hasEnergy = tier != null && (animal.energy?.currentEnergy ?? 0) >= tier.energyCost
              const tierLocked = tier != null && (
                (maxAllowedTierIndex != null && tier.tierIndex > maxAllowedTierIndex) ||
                (tier.minMood != null && (animal.mood?.value ?? 0) < tier.minMood) ||
                (tier.minCondition != null && (animal.condition?.value ?? 0) < tier.minCondition)
              )
              const canTrain = !isRestricted && !tierLocked && hasEnergy && !atCap && !!trainingDef && !!tier && !isPending
              const blockReason: string | null =
                atCap ? "At cap"
                : !hasEnergy ? "No energy"
                : !moodBlocksAll && tier?.minMood != null && (animal.mood?.value ?? 0) < tier.minMood ? "Mood too low"
                : !conditionBlocksAll && tier?.minCondition != null && (animal.condition?.value ?? 0) < tier.minCondition ? "Condition too low"
                : maxAllowedTierIndex != null && tier != null && tier.tierIndex > maxAllowedTierIndex ? "Vet restriction"
                : null

              return (
                <div key={stat.statDef.name} className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1.5">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{stat.statDef.name}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{Math.round(stat.trainedValue)}</span> / {Math.round(cap)}
                    </span>
                  </div>
                  <Meter value={stat.trainedValue} max={cap} tone="condition" className="mb-1 h-[3px]" />

                  {!readonly && tiers.length > 0 && (
                    <div className="mb-1 flex gap-1">
                      {tiers.map((t: IntensityTier) => {
                        const locked =
                          (maxAllowedTierIndex != null && t.tierIndex > maxAllowedTierIndex) ||
                          (t.minMood != null && (animal.mood?.value ?? 0) < t.minMood) ||
                          (t.minCondition != null && (animal.condition?.value ?? 0) < t.minCondition)
                        const tierBlockReason =
                          isRestricted ? "Vet restriction"
                          : maxAllowedTierIndex != null && t.tierIndex > maxAllowedTierIndex ? "Vet restriction"
                          : t.minMood != null && (animal.mood?.value ?? 0) < t.minMood ? "Mood too low"
                          : t.minCondition != null && (animal.condition?.value ?? 0) < t.minCondition ? "Condition too low"
                          : null
                        return (
                          <span key={t.id} title={tierBlockReason ?? undefined} className="flex-1">
                            <button
                              type="button"
                              disabled={locked || isRestricted}
                              onClick={() => setSelectedTier((prev) => ({ ...prev, [stat.statDef.id]: t.id }))}
                              className={cn(
                                "w-full rounded px-1 py-0.5 text-[10px] font-semibold transition-colors",
                                tierId === t.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                                (locked || isRestricted) && "cursor-not-allowed opacity-40"
                              )}
                            >
                              {t.name}
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {!readonly && (
                    <span title={!canTrain && blockReason ? blockReason : undefined} className="w-full">
                      <ActionButton
                        variant="soft"
                        disabled={!canTrain}
                        className="h-5 w-full justify-center"
                        onClick={() => {
                          if (!canTrain || !trainingDef || !tierId) return
                          setPendingStatId(stat.statDef.id)
                          train({ animalId: animal.id, trainingActionDefId: trainingDef.id, intensityTierDefId: tierId })
                        }}
                      >
                        {isPending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <>
                            <Zap className="size-3" />
                            Train{tier ? ` · ${Math.round(tier.energyCost)} energy` : ""}
                          </>
                        )}
                      </ActionButton>
                    </span>
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
