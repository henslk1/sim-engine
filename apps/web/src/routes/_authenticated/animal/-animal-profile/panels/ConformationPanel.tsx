import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Ruler, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCycleAge } from "../utils"

function letterGrade(score: number) {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

function structuralRiskLabel(value: number): { label: string; className: string } {
  if (value <= 0) return { label: "None", className: "text-muted-foreground" }
  if (value <= 0.1) return { label: "Low", className: "text-chart-3" }
  if (value <= 0.25) return { label: "Medium", className: "text-amber-500" }
  return { label: "High", className: "text-destructive" }
}

function fmtEnumList(values: string[]): string {
  if (values.length === 0) return "—"
  return values.map(v => v.charAt(0) + v.slice(1).toLowerCase()).join(" / ")
}

export function ConformationPanel({ animal }: { animal: AnimalProfile }) {
  const isCross = animal.breedComposition.length > 1
  const overallScore = animal.conformationScores[0]
  const minCycle = animal.game.gameConfig?.conformationInspectionMinCycle ?? 0
  const firstCompetingStage = animal.game.lifeStageDefs?.[0]
  const awaitingAge = !isCross && !overallScore && animal.ageInCycles < minCycle
  const eligibleForInspection = !isCross && !overallScore && animal.ageInCycles >= minCycle

  const sectionScores = (animal.conformationSectionScores ?? [])
    .filter((s) => s.breedId === overallScore?.breedId)
    .sort((a, b) => a.section.displayOrder - b.section.displayOrder)

  // Build locus → phenotypeCode map for DQ checks
  const genotypeCodeByLocus = new Map<string, string>()
  for (const g of animal.genotypes ?? []) {
    if (g.phenotypeCode) genotypeCodeByLocus.set(g.locusId, g.phenotypeCode)
  }
  // Which loci have a matching DQ trait for this breed
  const dqLocusNames = new Map<string, string>() // locusId → locus name (for tooltip)
  for (const dq of animal.breed?.dqTraits ?? []) {
    const code = genotypeCodeByLocus.get(dq.locusId)
    if (code && code === dq.expression) {
      const locusDef = animal.genotypes?.find(g => g.locusId === dq.locusId)
      if (locusDef) dqLocusNames.set(dq.locusId, locusDef.locus.name)
    }
  }
  const hasCoatDq = !!(overallScore as { isCoatDq?: boolean } | undefined)?.isCoatDq

  const title = (
    <>
      Conformation
      {!isCross && overallScore && (
        <span className="text-xs font-normal text-muted-foreground">· {overallScore.breed.name}</span>
      )}
    </>
  )

  const action = !isCross && overallScore ? (
    <span className="text-xs tabular-nums text-muted-foreground">
      <span className="font-semibold text-foreground">{overallScore.score.toFixed(1)}</span> / 100
    </span>
  ) : undefined

  const risk = structuralRiskLabel(animal.structuralRisk ?? 0)

  return (
    <Panel title={title} icon={<Ruler className="size-4 text-chart-2" />} action={action}>
      <div className="space-y-3">
        {isCross ? (
          <p className="text-[11px] text-muted-foreground">Conformation scoring applies to purebreds only</p>
        ) : awaitingAge ? (
          <p className="text-[11px] text-muted-foreground">
            {firstCompetingStage
              ? `Eligible for inspection at the ${firstCompetingStage.name} stage`
              : `Eligible for inspection from ${formatCycleAge(minCycle, animal.game.gameConfig)}`
            }
          </p>
        ) : eligibleForInspection ? (
          <p className="text-[11px] text-muted-foreground">
            Visit a venue to enter the inspection show and reveal this animal's conformation score.
          </p>
        ) : !overallScore ? (
          <p className="text-[11px] text-muted-foreground">No section scores recorded</p>
        ) : sectionScores.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No section scores recorded</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sectionScores.map((ss) => {
              const grade = letterGrade(ss.score)
              const dqInSection = ss.section.entries
                .filter(e => dqLocusNames.has(e.locus.id))
                .map(e => dqLocusNames.get(e.locus.id)!)
              return (
                <div key={ss.id} className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                  <div className="mb-0.5 flex items-center gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ss.section.name}</p>
                    {dqInSection.length > 0 && (
                      <span title={dqInSection.map(n => `${n} has a disqualifying trait`).join("\n")}>
                        <TriangleAlert className="size-3 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{grade}</p>
                </div>
              )
            })}
            {hasCoatDq && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
                <div className="mb-0.5 flex items-center gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Coat Color</p>
                  <span title="This animal has a disqualifying coat color — it will score 0 in conformation shows">
                    <TriangleAlert className="size-3 text-amber-500 shrink-0" />
                  </span>
                </div>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">DQ</p>
              </div>
            )}
          </div>
        )}

        {overallScore && (
          <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Structural Risk</p>
              <p className={cn("text-sm font-semibold", risk.className)}>{risk.label}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Terrain</p>
              <p className="text-sm font-semibold text-foreground">{fmtEnumList(animal.preferredTerrain)}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Climate</p>
              <p className="text-sm font-semibold text-foreground">{fmtEnumList(animal.preferredClimate)}</p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
