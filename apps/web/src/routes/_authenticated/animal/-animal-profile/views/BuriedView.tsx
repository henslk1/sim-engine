import type { AnimalProfile } from "../types"
import { formatCycleAge, formatBreedLabel } from "../utils"
import { Badge } from "@/components/game/ui"
import { Skull } from "lucide-react"

export function BuriedView({ animal }: { animal: AnimalProfile }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const breedLabel = formatBreedLabel(animal)

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-muted/20 p-6">
      <div className="w-full max-w-lg rounded-xl border border-border/50 bg-card/80 shadow-sm">

        {/* Header */}
        <div className="border-b border-border/40 px-6 py-5 text-center">
          {animal.image ? (
            <img
              src={animal.image}
              alt={animal.name}
              className="mx-auto mb-3 size-24 rounded-full object-cover grayscale opacity-60"
            />
          ) : (
            <Skull className="mx-auto mb-3 size-8 text-muted-foreground/40" />
          )}
          <div className="flex items-center justify-center gap-2">
            <h1 className="font-serif text-2xl font-semibold text-foreground/70">{animal.name}</h1>
            <Badge tone="muted">Buried</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {breedLabel} · {animal.sex}
            {animal.breedGeneration !== null && ` · Gen ${animal.breedGeneration}`}
          </p>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-px border-b border-border/40 bg-border/30">
          <MetaCell label="Born" value={new Date(animal.bornAt).toLocaleDateString()} />
          <MetaCell label="Died" value={animal.diedAt ? new Date(animal.diedAt).toLocaleDateString() : "-"} />
          <MetaCell label="Age at Death" value={cycleToAge(animal.ageInCycles)} />
          <MetaCell label="Cause of Death" value={animal.causeOfDeath ?? "Unknown"} />
          <MetaCell label="Bred by" value={animal.breder?.username ?? "Unknown"} />
          <MetaCell label="Owned by" value={animal.playerAccount.username} />
          <MetaCell label="COI" value={`${(animal.inbreedingCoefficient * 100).toFixed(2)}%`} />
          <MetaCell label="Breed" value={breedLabel} />
        </div>

        {/* Pedigree reference */}
        {animal.ancestors.length > 0 && (
          <div className="px-6 py-4">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pedigree
            </h4>
            <div className="space-y-1">
              {animal.ancestors
                .filter((a: AnimalProfile["ancestors"][number]) => a.depth <= 2)
                .map((a: AnimalProfile["ancestors"][number]) => (
                  <div key={a.ancestor.id} className="flex items-center justify-between text-[11px]">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {a.depth === 1 ? "Parent" : "Grandparent"}
                    </span>
                    <span className="flex-1 font-medium text-foreground">{a.ancestor.name}</span>
                    <span className="text-muted-foreground">{a.ancestor.breed.name}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function MetaCell({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-card/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground/80">{value}</p>
    </div>
  )
}