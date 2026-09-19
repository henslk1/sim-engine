import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { ScrollText } from "lucide-react"
import { cn } from "@/lib/utils"

type VitalChange = { label: string; value: number }

type DailyEvent = {
  id: string
  cycleNumber: number | null
  eventType: string
  context: unknown
  outcome: string | null
  partner: { name: string } | null
  createdAt: Date | string
}

type CareEvent = {
  id: string
  cycleNumber: number
  createdAt: Date | string
  careActionDef: { name: string; energyRestore: number; moodBoost: number }
}

type TrainingEvent = {
  id: string
  cycleNumber: number
  createdAt: Date | string
  statGained: number
  reachedCap: boolean
  energyUsed: number
  trainingActionDef: { name: string; statDef: { name: string } }
  intensityTierDef: { name: string }
}

type VetEvent = {
  id: string
  visitCycle: number
  visitedAt: Date | string
  notes: string | null
  vetServiceDef: { name: string; baseCost: number } | null
  conditionDef: { name: string } | null
}

type StageActivityEvent = {
  id: string
  cycleNumber: number
  createdAt: Date | string
  stageActivityDef: {
    name: string
    energyCost: number
    traitEffect: number
    traitDef: { name: string }
  }
}

type CompetitionEvent = {
  id: string
  cycleNumber: number | null
  enteredAt: Date | string
  tierDef: { name: string }
  competition: { disciplineDef: { name: string }; venue: { name: string } }
}

type LogEntry =
  | { key: string; cycleNumber: number; createdAt: Date; type: "care"; label: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "training"; label: string; subLabel: string; statGained: number; reachedCap: boolean; statName: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "vet"; label: string; notes: string | null; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "activity"; label: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "breeding"; label: string; subLabel?: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "competition"; label: string; subLabel?: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; createdAt: Date; type: "birth"; label: string; vitals: VitalChange[] }

const DOT: Record<string, string> = {
  care: "bg-violet-400",
  training: "bg-chart-2",
  vet: "bg-destructive",
  activity: "bg-chart-5",
  breeding: "bg-rose-400",
  competition: "bg-chart-1",
  birth: "bg-pink-400",
}

export function DailyLogPanel({ animal }: { animal: AnimalProfile }) {
  const cycle = animal.ageInCycles
  const dailyLogs = animal.dailyLogs as DailyEvent[]
  const careLogs = animal.careLogs as CareEvent[]
  const trainingLogs = animal.trainingLogs as TrainingEvent[]
  const vetVisitLogs = animal.vetVisitLogs as VetEvent[]
  const stageActivityLogs = animal.stageActivityLogs as StageActivityEvent[]
  const competitionEntries = animal.competitionEntries as CompetitionEvent[]

  const entries: LogEntry[] = [
    ...dailyLogs
      .filter((l) => l.cycleNumber === cycle && l.eventType === "LTC_PERFORMED")
      .map((l) => {
        const ctx = l.context as { name?: string; nextDueCycle?: number } | null
        return {
          key: `ltc-${l.id}`,
          cycleNumber: l.cycleNumber ?? cycle,
          createdAt: new Date(l.createdAt),
          type: "care" as const,
          label: ctx?.name ?? "Long-term care",
          vitals: [] as VitalChange[],
        }
      }),
    ...dailyLogs
      .filter((l) => l.cycleNumber === cycle && ["COVER_SENT", "COVER_ACCEPTED", "COVER_DECLINED"].includes(l.eventType))
      .map((l) => {
        const ctx = l.context as { price?: number } | null
        const label =
          l.eventType === "COVER_SENT" ? "Cover Sent"
          : l.eventType === "COVER_ACCEPTED" ? "Cover Accepted"
          : l.eventType === "COVER_DECLINED" ? "Cover Declined"
          : l.eventType
        const subLabel =
          l.eventType === "COVER_ACCEPTED" && l.outcome === "CONCEIVED" ? "Conceived"
          : l.eventType === "COVER_ACCEPTED" && l.outcome === "NOT_CONCEIVED" ? "No conception"
          : l.partner?.name
        return {
          key: `breeding-${l.id}`,
          cycleNumber: l.cycleNumber ?? cycle,
          createdAt: new Date(l.createdAt),
          type: "breeding" as const,
          label,
          subLabel: subLabel ?? l.partner?.name,
          vitals: (ctx?.price ?? 0) > 0 ? [{ label: "G", value: -(ctx!.price!) }] : [] as VitalChange[],
        }
      }),
    ...careLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l) => ({
        key: `care-${l.id}`,
        cycleNumber: l.cycleNumber,
        createdAt: new Date(l.createdAt),
        type: "care" as const,
        label: l.careActionDef.name,
        vitals: [
          ...(l.careActionDef.energyRestore > 0 ? [{ label: "energy", value: l.careActionDef.energyRestore }] : []),
          ...(l.careActionDef.moodBoost > 0 ? [{ label: "mood", value: l.careActionDef.moodBoost }] : []),
        ],
      })),
    ...trainingLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l) => ({
        key: `train-${l.id}`,
        cycleNumber: l.cycleNumber,
        createdAt: new Date(l.createdAt),
        type: "training" as const,
        label: l.trainingActionDef.name,
        subLabel: l.intensityTierDef.name,
        statGained: l.statGained,
        reachedCap: l.reachedCap,
        statName: l.trainingActionDef.statDef.name,
        vitals: l.energyUsed > 0 ? [{ label: "energy", value: -l.energyUsed }] : [],
      })),
    ...vetVisitLogs
      .filter((l) => l.visitCycle === cycle)
      .map((l) => ({
        key: `vet-${l.id}`,
        cycleNumber: l.visitCycle,
        createdAt: new Date(l.visitedAt),
        type: "vet" as const,
        label: l.vetServiceDef?.name ?? "Vet Visit",
        notes: l.notes ?? (l.conditionDef ? `Condition: ${l.conditionDef.name}` : null),
        vitals: (l.vetServiceDef?.baseCost ?? 0) > 0
          ? [{ label: "G", value: -(l.vetServiceDef!.baseCost) }]
          : [] as VitalChange[],
      })),
    ...stageActivityLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l) => ({
        key: `activity-${l.id}`,
        cycleNumber: l.cycleNumber,
        createdAt: new Date(l.createdAt),
        type: "activity" as const,
        label: l.stageActivityDef.name,
        vitals: [
          ...(l.stageActivityDef.energyCost > 0 ? [{ label: "energy", value: -l.stageActivityDef.energyCost }] : []),
          { label: l.stageActivityDef.traitDef.name, value: l.stageActivityDef.traitEffect },
        ],
      })),
    ...competitionEntries
      .filter((e) => e.cycleNumber === cycle)
      .map((e) => ({
        key: `comp-${e.id}`,
        cycleNumber: e.cycleNumber ?? cycle,
        createdAt: new Date(e.enteredAt),
        type: "competition" as const,
        label: `${e.competition.disciplineDef.name} — ${e.tierDef.name}`,
        subLabel: e.competition.venue.name,
        vitals: [] as VitalChange[],
      })),
    ...dailyLogs
      .filter((l) => l.cycleNumber === cycle && l.eventType === "TIER_ADVANCED")
      .map((l) => {
        const ctx = l.context as { newTierName?: string; disciplineName?: string } | null
        return {
          key: `tier-${l.id}`,
          cycleNumber: l.cycleNumber ?? cycle,
          createdAt: new Date(l.createdAt),
          type: "competition" as const,
          label: `Advanced to ${ctx?.newTierName ?? "next tier"}`,
          subLabel: ctx?.disciplineName,
          vitals: [] as VitalChange[],
        }
      }),
    ...dailyLogs
      .filter((l) => l.cycleNumber === cycle && l.eventType === "EMBRYO_IMPLANTED")
      .map((l) => {
        const ctx = l.context as { sireName?: string; biologicalDamName?: string } | null
        return {
          key: `implant-${l.id}`,
          cycleNumber: l.cycleNumber ?? cycle,
          createdAt: new Date(l.createdAt),
          type: "breeding" as const,
          label: "Embryo Implanted",
          subLabel: ctx?.sireName && ctx?.biologicalDamName
            ? `by ${ctx.sireName} × ${ctx.biologicalDamName}`
            : undefined,
          vitals: [] as VitalChange[],
        }
      }),
    ...dailyLogs
      .filter((l) => l.cycleNumber === cycle && l.eventType === "BIRTH")
      .map((l) => {
        const ctx = l.context as { offspringCount?: number } | null
        const count = ctx?.offspringCount ?? 1
        return {
          key: `birth-${l.id}`,
          cycleNumber: l.cycleNumber ?? cycle,
          createdAt: new Date(l.createdAt),
          type: "birth" as const,
          label: count === 1 ? "Gave birth" : `Gave birth to ${count} foals`,
          vitals: [] as VitalChange[],
        }
      }),
  ].sort((a, b) => b.cycleNumber - a.cycleNumber || b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <Panel title="Daily Log" icon={<ScrollText className="size-4 text-muted-foreground" />} data-tutorial="daily-log-panel">
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No recent activity</p>
      ) : (
        <ol className="relative space-y-2.5 border-l border-border pl-4">
          {(() => {
            const firstCareIdx = entries.findIndex(e => e.type === "care")
            const firstTrainingIdx = entries.findIndex(e => e.type === "training")
            return entries.map((e, i) => {
            const details: { text: string; color: string }[] = []
            if (e.type === "training") {
              details.push(e.reachedCap
                ? { text: `${e.statName} training complete`, color: "text-chart-2" }
                : { text: `+${e.statGained.toFixed(1)} ${e.statName}`, color: "text-chart-2" }
              )
            }
            e.vitals.forEach((v) =>
              details.push({
                text: `${v.value >= 0 ? "+" : ""}${Math.round(v.value)} ${v.label}`,
                color: v.value >= 0 ? "text-chart-2" : "text-muted-foreground",
              })
            )
            if (e.type === "vet" && e.notes) {
              details.push({ text: String(e.notes), color: "text-muted-foreground" })
            }

            return (
              <li key={e.key} className="relative">
                <div
                  data-tutorial={
                    i === firstCareIdx && firstCareIdx !== -1 ? "daily-log-care"
                    : i === firstTrainingIdx && firstTrainingIdx !== -1 ? "daily-log-training"
                    : undefined
                  }
                  className="relative -ml-5 pl-5"
                >
                <span className={cn("absolute left-0 top-1 size-2.5 rounded-full ring-2 ring-card", DOT[e.type])} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {e.type}
                    {(e.type === "training" || e.type === "breeding" || e.type === "competition") && "subLabel" in e && e.subLabel && (
                      <span className="font-normal normal-case tracking-normal"> · {e.subLabel}</span>
                    )}
                  </p>
                  <p className="text-xs">
                    <span className="font-medium text-foreground">{e.label}</span>
                    {details.map((d, i) => (
                      <span key={i} className={d.color}>
                        {i === 0 ? " " : ", "}
                        {d.text}
                      </span>
                    ))}
                  </p>
                </div>
                </div>
              </li>
            )
          })
          })()}
        </ol>
      )}
    </Panel>
  )
}
