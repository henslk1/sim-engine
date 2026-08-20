import type { AnimalProfile } from "../types"
import { Panel } from "@/components/game/ui"
import { Brain, HelpCircle } from "lucide-react"

type Trait = AnimalProfile["personality"][number]

function resolveLabel(trait: Trait): string | null {
  const range = trait.traitDef.labelRanges.find(
    (r) => trait.value >= r.minValue && trait.value <= r.maxValue
  )
  return range?.label ?? trait.traitLabel ?? null
}

function TraitBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-rose-400 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function PersonalityPanel({ animal }: { animal: AnimalProfile }) {
  return (
    <Panel title="Personality" icon={<Brain className="size-4 text-chart-5" />}>
      {animal.personality.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No personality data</p>
      ) : (
        <div className="divide-y divide-border/50">
          {animal.personality.map((trait: Trait) => (
            <div key={trait.traitDef.name} className="flex items-center gap-3 py-2.5">
              <div className="flex w-32 shrink-0 items-center gap-1">
                <p className="text-xs font-semibold text-foreground">{trait.traitDef.name}</p>
                {trait.traitDef.description && (
                  <div className="group relative">
                    <HelpCircle className="size-3 shrink-0 cursor-help text-muted-foreground/60" />
                    <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden w-44 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-foreground shadow-md group-hover:block">
                      {trait.traitDef.description}
                    </div>
                  </div>
                )}
              </div>
              <p className="w-24 shrink-0 text-xs text-muted-foreground">{resolveLabel(trait) ?? "—"}</p>
              <div className="min-w-0 flex-1">
                <TraitBar value={trait.value} />
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(trait.value)} / 100
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
