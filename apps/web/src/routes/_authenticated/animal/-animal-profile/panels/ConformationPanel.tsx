import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"

function letterGrade(score: number) {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

export function ConformationPanel({ animal }: { animal: AnimalProfile }) {
  const utils = trpc.useUtils()
  const inspect = trpc.animal.conformationInspect.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })

  const isCross = animal.breedComposition.length > 1
  const overallScore = animal.conformationScores[0]
  const minCycle = animal.game.gameConfig?.conformationInspectionMinCycle ?? 0
  const awaitingAge = !isCross && !overallScore && animal.ageInCycles < minCycle
  const eligibleForInspection = !isCross && !overallScore && animal.ageInCycles >= minCycle

  const sectionScores = (animal.conformationSectionScores ?? [])
    .filter((s) => s.breedId === overallScore?.breedId)
    .sort((a, b) => a.section.displayOrder - b.section.displayOrder)

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

  return (
    <Panel title={title} icon={<Ruler className="size-4 text-chart-2" />} action={action}>
      {isCross ? (
        <p className="text-[11px] text-muted-foreground">Conformation scoring applies to purebreds only</p>
      ) : awaitingAge ? (
        <p className="text-[11px] text-muted-foreground">Eligible for inspection at cycle {minCycle}</p>
      ) : eligibleForInspection ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground">This animal has not yet been inspected.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inspect.mutate({ animalId: animal.id })}
            disabled={inspect.isPending}
          >
            {inspect.isPending ? "Inspecting…" : "Request Inspection"}
          </Button>
          {inspect.error && <p className="text-xs text-destructive">{inspect.error.message}</p>}
        </div>
      ) : !overallScore ? (
        <p className="text-[11px] text-muted-foreground">No section scores recorded</p>
      ) : sectionScores.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No section scores recorded</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {sectionScores.map((ss) => {
            const grade = letterGrade(ss.score)
            return (
              <div key={ss.id} className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ss.section.name}</p>
                <p className="text-sm font-semibold text-foreground">{grade}</p>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
