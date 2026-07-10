import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Ruler } from "lucide-react"

export function ConformationPanel({ animal }: { animal: AnimalProfile }) {
  const isCross = animal.breedComposition.length > 1
  const score = animal.conformationScores[0]

  const title = (
    <>
      Conformation
      {!isCross && score && (
        <span className="text-xs font-normal text-muted-foreground">· {score.breed.name}</span>
      )}
    </>
  )

  const action = !isCross && score ? (
    <span className="text-xs tabular-nums text-muted-foreground">
      <span className="font-semibold text-foreground">{score.score.toFixed(1)}</span> / 100
    </span>
  ) : undefined

  return (
    <Panel title={title} icon={<Ruler className="size-4 text-chart-2" />} action={action}>
      {isCross || !score ? (
        <p className="text-[11px] text-muted-foreground">
          {isCross ? "Conformation scoring applies to purebreds only" : "Not yet scored"}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Section breakdown not yet configured</p>
      )}
    </Panel>
  )
}
