import type { AnimalProfile } from "../types"
import { Badge } from "@/components/game/ui"
import { cn } from "@/lib/utils"

export function PedigreeTab({ animal }: { animal: AnimalProfile }) {
  const coiColor =
    animal.inbreedingCoefficient < 0.0625
      ? "text-chart-2"
      : animal.inbreedingCoefficient < 0.125
        ? "text-amber-500"
        : "text-destructive"

  return (
    <div>
      {animal.breedComposition.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {animal.breedComposition.map((bc: AnimalProfile["breedComposition"][number]) => (
            <Badge key={bc.breedId} tone="outline">
              {bc.breed.name} · {Math.round(bc.percentage)}%
            </Badge>
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center gap-4 border-b border-border pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          COI —{" "}
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Born —{" "}
          <span className="font-bold text-foreground">{new Date(animal.bornAt).toLocaleDateString()}</span>
        </span>
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Bred by{" "}
        <span className="font-medium text-foreground">{animal.breeder?.username ?? "Unknown"}</span>
      </p>

      {animal.ancestors.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No pedigree on record.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/70">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Relationship</th>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Breed</th>
                <th className="px-2 py-1 font-medium">Sex</th>
                <th className="px-2 py-1 font-medium">Status</th>
                <th className="px-2 py-1 text-right font-medium">COI</th>
              </tr>
            </thead>
            <tbody>
              {animal.ancestors.map((a: AnimalProfile["ancestors"][number]) => {
                const rel =
                  a.depth === 1
                    ? "Parent"
                    : a.depth === 2
                      ? "Grandparent"
                      : a.depth === 3
                        ? "Great-grandparent"
                        : `Gen-${a.depth} ancestor`
                return (
                  <tr key={a.ancestor.id} className="border-t border-border/60">
                    <td className="px-2 py-1 text-muted-foreground">{rel}</td>
                    <td className="px-2 py-1 font-medium text-foreground">{a.ancestor.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{a.ancestor.breed.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{a.ancestor.sex}</td>
                    <td className="px-2 py-1">
                      <Badge tone={a.ancestor.status === "ALIVE" ? "success" : "muted"}>{a.ancestor.status}</Badge>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {(a.ancestor.inbreedingCoefficient * 100).toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
