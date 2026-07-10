import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Ruler } from "lucide-react"

function letterGrade(score: number) {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}


export function ConformationPanel({ animal }: { animal: AnimalProfile }) {
  const isCross = animal.breedComposition.length > 1
  const overallScore = animal.conformationScores[0]
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
      {isCross || !overallScore ? (
        <p className="text-[11px] text-muted-foreground">
          {isCross ? "Conformation scoring applies to purebreds only" : "Not yet scored"}
        </p>
      ) : sectionScores.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No section scores recorded</p>
      ) : (
        <div className="divide-y divide-border">
          {sectionScores.map((ss) => {
            const grade = letterGrade(ss.score)
            return (
              <div key={ss.id} className="flex items-center justify-between py-2">
                <p className="text-xs font-semibold text-foreground">{ss.section.name}</p>
                <span className="w-5 text-center text-sm font-bold text-foreground">{grade}</span>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
