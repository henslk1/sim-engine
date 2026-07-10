import type { AnimalProfile } from "../types"
import { getTrainingCap } from "../utils"

type Genotype = NonNullable<AnimalProfile["genotypes"]>[number]

export function GeneticsTab({
  animal,
  config,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
}) {
  const groups = animal.genotypes.reduce<Record<string, Genotype[]>>((acc, g) => {
    const key = g.locus.displayGroup ?? "Other"
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="overflow-hidden rounded-md border border-border/70">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Locus</th>
              <th className="px-2 py-1 font-medium">Group</th>
              <th className="px-2 py-1 text-center font-medium">Genotype</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(groups) as Array<[string, Genotype[]]>).flatMap(([group, genotypes]) =>
              genotypes.map((g, i) => (
                <tr key={g.locusId} className="border-t border-border/60">
                  <td className="px-2 py-1 font-medium text-foreground">{g.locus.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{i === 0 ? group : ""}</td>
                  <td className="px-2 py-1 text-center">
                    {g.isTestedByOwner ? (
                      <span className="inline-block rounded bg-chart-5/12 px-1.5 py-0.5 font-mono font-semibold text-chart-5">
                        {g.alleleOne.symbol}/{g.alleleTwo.symbol}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground/60">untested</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Innate Stats</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Sets the training cap for each stat.</p>
        <div className="space-y-1.5">
          {animal.stats.map((s: AnimalProfile["stats"][number]) => {
            const cap = getTrainingCap(s.innateValue, config)
            return (
              <div
                key={s.statDef.name}
                className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
              >
                <span className="text-xs font-medium text-foreground">{s.statDef.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{Math.round(s.innateValue)}</span>
                  {" "}→ cap {Math.round(cap)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
