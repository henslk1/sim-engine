import { useState, useRef } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton } from "@/components/game/ui"
import { Dumbbell, Ban, Loader2, Zap, HeartHandshake } from "lucide-react"
import { getTrainingCap } from "../utils"
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

  // isRestricted = blanket block only (null maxIntensityTier). Tier-capped restrictions use maxAllowedTierIndex instead.
  const isRestricted = animal.healthRecords.some(record =>
    record.isActive && record.treatmentRecords.some(t =>
      t.isActive && t.activityRestriction.some(r =>
        r.isActive &&
        (r.restrictionType === "TRAINING" || r.restrictionType === "ALL") &&
        r.maxIntensityTier == null
      )
    )
  )

  // Take the most restrictive (lowest) maxIntensityTier across all active tier-capped restrictions.
  const maxAllowedTierIndex = (() => {
    let min: number | null = null
    for (const record of animal.healthRecords) {
      if (!record.isActive) continue
      for (const t of record.treatmentRecords) {
        if (!t.isActive) continue
        for (const r of t.activityRestriction) {
          if (!r.isActive) continue
          if ((r.restrictionType === "TRAINING" || r.restrictionType === "ALL") && r.maxIntensityTier != null) {
            min = min === null ? r.maxIntensityTier : Math.min(min, r.maxIntensityTier)
          }
        }
      }
    }
    return min
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
  const performedThisCycle = animal.stageActivityLogs.some((l) => l.cycleNumber === animal.ageInCycles)

  const lockedTargetStatIdRef = useRef<string | null>(null)

  const targetStat = config && animal.stats.length > 0
    ? animal.stats.reduce((best, s) => {
        const cap = getTrainingCap(s.innateValue, config, animal.personality)
        const bestCap = getTrainingCap(best.innateValue, config, animal.personality)
        return (cap - s.trainedValue) > (bestCap - best.trainedValue) ? s : best
      })
    : null

  const maxTierIndex = tiers.length > 0 ? Math.max(...tiers.map(t => t.tierIndex)) : -1
  const minTierIndex = tiers.length > 0 ? Math.min(...tiers.map(t => t.tierIndex)) : -1

  // Lock in the tutorial target stat on first render so it doesn't shift
  // as trainedValue increases and changes the headroom ranking.
  if (targetStat && lockedTargetStatIdRef.current === null) {
    lockedTargetStatIdRef.current = targetStat.statDef.id
  }
  const tutorialTargetStatId = lockedTargetStatIdRef.current

  return (
    <Panel
      data-tutorial={canTrainStage ? "training-panel" : undefined}
      title={canTrainStage ? "Training" : "Bonding"}
      icon={canTrainStage ? <Dumbbell className="size-4 text-chart-2" /> : <HeartHandshake className="size-4 text-chart-5" />}
      action={canTrainStage && config
        ? <span data-tutorial="training-cap"><Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge></span>
        : undefined}
    >
      {!canTrainStage ? (
        <div className="space-y-1.5">
          {!hasUniqueActionSet && (
            <p className="text-[11px] text-muted-foreground">
              Training is not available at this life stage.
            </p>
          )}

          {hasUniqueActionSet && performedThisCycle && (
            <p className="mb-1.5 text-[11px] text-muted-foreground">Bonding activity done for today.</p>
          )}

          {hasUniqueActionSet && animal.personality.map((trait: Personality) => {
            const traitActivities = activities.filter((a: StageActivity) => a.traitDef.id === trait.traitDef.id)
            const effectiveValue = trait.value + trait.personalityModifier
            const innateLabel = labelForValue(Math.round(trait.value), trait.traitDef.labelRanges)
            const currentLabel = labelForValue(Math.round(effectiveValue), trait.traitDef.labelRanges)
            const hasShifted = innateLabel !== currentLabel
            return (
              <div key={trait.traitDef.id} className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1.5">
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{trait.traitDef.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {(trait.traitLabel ?? labelForValue(Math.round(effectiveValue), trait.traitDef.labelRanges)) && (
                      <span className="mr-1.5 font-medium text-foreground">
                        {trait.traitLabel ?? labelForValue(Math.round(effectiveValue), trait.traitDef.labelRanges)}
                      </span>
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
                      const canPerform = !hasShifted && hasEnergy && !isPending && !performedThisCycle
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
          <div className="space-y-1.5" data-tutorial="training-innate" data-energy-current={animal.energy?.currentEnergy ?? 0}>
            {(() => {
              const cards = animal.stats.map((stat: Stat) => {
              const cap = getTrainingCap(stat.innateValue, config, animal.personality)
              const trainingDef = animal.game.trainingActionDefs.find((d) => d.statDefId === stat.statDef.id)
              const tierId = selectedTier[stat.statDef.id] ?? tiers[0]?.id
              const tier = tiers.find((t) => t.id === tierId)
              const isPending = pendingStatId === stat.statDef.id
              const atCap = stat.trainedValue >= cap
              const isNearCap = !atCap && (cap - stat.trainedValue) / cap < 0.15
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

              const isTargetStat = targetStat?.statDef.id === stat.statDef.id
              const isFirstStat = animal.stats[0]?.statDef.id === stat.statDef.id

              return (
                <div
                  key={stat.statDef.name}
                  className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1.5"
                  data-tutorial={stat.statDef.id === tutorialTargetStatId ? "training-target-stat" : undefined}
                  data-tutorial-training-sessions={animal.trainingLogs.filter(log =>
                    log.cycleNumber === animal.ageInCycles &&
                    log.trainingActionDef.statDef.name === stat.statDef.name &&
                    log.intensityTierDef.name === tiers.find(t => t.tierIndex === maxTierIndex)?.name
                  ).length}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{stat.statDef.name}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{Math.round(stat.trainedValue)}</span> / {Math.round(cap)}
                    </span>
                  </div>
                  <Meter value={stat.trainedValue} max={cap} tone="condition" className="mb-1 h-0.75" />

                  {!readonly && tiers.length > 0 && (
                    <div
                      className="mb-1 flex gap-1"
                      data-tutorial={isFirstStat ? "training-intensities" : undefined}
                    >
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
                              data-tutorial={
                                isFirstStat && tierBlockReason === "Mood too low" ? "training-intense-blocked"
                                : stat.statDef.id === tutorialTargetStatId && t.tierIndex === maxTierIndex && !locked && !isRestricted ? "training-target-intense"
                                : isNearCap && t.tierIndex === minTierIndex && !locked && !isRestricted ? "training-light-tier"
                                : undefined
                              }
                              data-tutorial-selected={
                                stat.statDef.id === tutorialTargetStatId && t.tierIndex === maxTierIndex
                                  ? (selectedTier[stat.statDef.id] === t.id ? "true" : "false")
                                  : undefined
                              }
                              data-energy-cost={t.energyCost}
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
                    <span title={!canTrain && blockReason ? blockReason : undefined} className="w-full" data-tutorial-train="true">
                      <ActionButton
                        variant="soft"
                        disabled={!canTrain}
                        className="h-5 w-full justify-center"
                        data-tutorial={
                          stat.statDef.id === tutorialTargetStatId ? "training-target-train"
                          : isNearCap ? "training-near-cap-train"
                          : undefined
                        }
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
                            {trainingDef?.name ?? "Train"}{tier ? ` · ${Math.round(tier.energyCost)} energy` : ""}
                          </>
                        )}
                      </ActionButton>
                    </span>
                  )}
                </div>
              )
              })
              return (
                <>
                  <div data-tutorial="training-near-cap-group" className="space-y-1.5">
                    {cards.slice(0, 2)}
                  </div>
                  {cards.slice(2)}
                </>
              )
            })()}
          </div>
        </>
      )}
    </Panel>
  )
}
