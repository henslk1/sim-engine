import { Link } from "@tanstack/react-router"
import type { RouterOutputs } from "@/lib/trpc"
import { Badge } from "@/components/game/ui"

type Offspring = RouterOutputs["animalProfile"]["getOffspring"][number]

export function OffspringTab({
  data,
  isLoading,
  cycleToAge,
}: {
  data: RouterOutputs["animalProfile"]["getOffspring"] | undefined
  isLoading: boolean
  cycleToAge: (n: number) => string
}) {
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Loading…</p>
  if (!data || data.length === 0)
    return <p className="text-[11px] text-muted-foreground">No offspring on record.</p>

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Name</th>
            <th className="px-2 py-1 font-medium">Dam</th>
            <th className="px-2 py-1 font-medium">Breed</th>
            <th className="px-2 py-1 font-medium">Sex</th>
            <th className="px-2 py-1 font-medium">Status</th>
            <th className="px-2 py-1 text-right font-medium">Conf.</th>
            <th className="px-2 py-1 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {data.map((o: Offspring) => {
            const dam = o.pregnancyOffspring[0]?.pregnancy?.breedingRecord?.dam
            const isPurebred = o.breedComposition.length === 1
            const conformationScore = isPurebred ? o.conformationScores[0]?.score : undefined
            return (
              <tr key={o.id} className="border-t border-border/60">
                <td className="px-2 py-1 font-medium text-foreground">
                  <Link
                    to="/animal/$animalId"
                    params={{ animalId: o.id }}
                    className="hover:text-primary transition-colors"
                  >
                    {o.name}
                  </Link>
                </td>
                <td className="px-2 py-1 text-muted-foreground">
                  {dam ? (
                    <Link
                      to="/animal/$animalId"
                      params={{ animalId: dam.id }}
                      className="hover:text-primary transition-colors"
                    >
                      {dam.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{o.breed.name}</td>
                <td className="px-2 py-1 text-muted-foreground">{o.sex}</td>
                <td className="px-2 py-1">
                  <Badge tone={o.status === "ALIVE" ? "success" : "muted"}>{o.status}</Badge>
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                  {conformationScore !== undefined ? conformationScore.toFixed(1) : "—"}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                  {cycleToAge(o.ageInCycles)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
