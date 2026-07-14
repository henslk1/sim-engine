import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { ScrollText } from "lucide-react"
import { cn } from "@/lib/utils"

type VitalChange = { label: string; value: number }

type LogEntry =
  | { key: string; cycleNumber: number; type: "care"; label: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; type: "training"; label: string; subLabel: string; statGained: number; statName: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; type: "vet"; label: string; notes: string | null; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; type: "activity"; label: string; vitals: VitalChange[] }
  | { key: string; cycleNumber: number; type: "breeding"; label: string; subLabel?: string; vitals: VitalChange[] }

const DOT: Record<string, string> = {
  care: "bg-violet-400",
  training: "bg-chart-2",
  vet: "bg-destructive",
  activity: "bg-chart-5",
  breeding: "bg-rose-400",
}

export function DailyLogPanel({ animal }: { animal: AnimalProfile }) {
  const cycle = animal.ageInCycles

  const entries: LogEntry[] = [
    ...animal.careLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l: AnimalProfile["careLogs"][number]) => ({
        key: `care-${l.id}`,
        cycleNumber: l.cycleNumber,
        type: "care" as const,
        label: l.careActionDef.name,
        vitals: [
          ...(l.careActionDef.energyRestore > 0 ? [{ label: "energy", value: l.careActionDef.energyRestore }] : []),
          ...(l.careActionDef.moodBoost > 0 ? [{ label: "mood", value: l.careActionDef.moodBoost }] : []),
        ],
      })),
    ...animal.trainingLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l: AnimalProfile["trainingLogs"][number]) => ({
        key: `train-${l.id}`,
        cycleNumber: l.cycleNumber,
        type: "training" as const,
        label: l.trainingActionDef.name,
        subLabel: l.intensityTierDef.name,
        statGained: l.statGained,
        statName: l.trainingActionDef.statDef.name,
        vitals: l.energyUsed > 0 ? [{ label: "energy", value: -l.energyUsed }] : [],
      })),
    ...animal.vetVisitLogs
      .filter((l) => l.visitCycle === cycle)
      .map((l: AnimalProfile["vetVisitLogs"][number]) => ({
        key: `vet-${l.id}`,
        cycleNumber: l.visitCycle,
        type: "vet" as const,
        label: l.vetServiceDef?.name ?? "Vet Visit",
        notes: l.notes,
        vitals: (l.vetServiceDef?.baseCost ?? 0) > 0
          ? [{ label: "G", value: -(l.vetServiceDef!.baseCost) }]
          : [] as VitalChange[],
      })),
    ...animal.stageActivityLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l: AnimalProfile["stageActivityLogs"][number]) => ({
        key: `activity-${l.id}`,
        cycleNumber: l.cycleNumber,
        type: "activity" as const,
        label: l.stageActivityDef.name,
        vitals: [
          ...(l.stageActivityDef.energyCost > 0 ? [{ label: "energy", value: -l.stageActivityDef.energyCost }] : []),
          { label: l.stageActivityDef.traitDef.name, value: l.stageActivityDef.traitEffect },
        ],
      })),
    ...animal.dailyLogs
      .filter((l) => l.cycleNumber === cycle)
      .map((l: AnimalProfile["dailyLogs"][number]) => {
        const ctx = l.context as { price?: number } | null
        const label =
          l.eventType === "COVER_SENT" ? "Cover Sent"
          : l.eventType === "COVER_ACCEPTED" ? "Cover Accepted"
          : l.eventType
        const subLabel =
          l.eventType === "COVER_ACCEPTED" && l.outcome === "CONCEIVED" ? "Conceived"
          : l.eventType === "COVER_ACCEPTED" && l.outcome === "NOT_CONCEIVED" ? "No conception"
          : l.partner?.name
        return {
          key: `breeding-${l.id}`,
          cycleNumber: l.cycleNumber,
          type: "breeding" as const,
          label,
          subLabel: subLabel ?? l.partner?.name,
          vitals: (ctx?.price ?? 0) > 0 ? [{ label: "G", value: -(ctx!.price!) }] : [] as VitalChange[],
        }
      }),
  ].sort((a, b) => b.cycleNumber - a.cycleNumber)

  return (
    <Panel title="Daily Log" icon={<ScrollText className="size-4 text-muted-foreground" />}>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No recent activity</p>
      ) : (
        <ol className="relative space-y-2.5 border-l border-border pl-4">
          {entries.map((e) => {
            const details: { text: string; color: string }[] = []
            if (e.type === "training") {
              details.push({ text: `+${e.statGained.toFixed(1)} ${e.statName}`, color: "text-chart-2" })
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
                <span className={cn("absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-card", DOT[e.type])} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {e.type}
                    {(e.type === "training" || e.type === "breeding") && e.subLabel && (
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
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
