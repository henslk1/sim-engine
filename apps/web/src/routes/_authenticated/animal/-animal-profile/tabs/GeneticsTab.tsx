import { useState } from "react"
import { cn } from "@/lib/utils"
import type { AnimalProfile } from "../types"
import { getTrainingCap } from "../utils"
import { ActionButton, Badge } from "@/components/game/ui"
import { FlaskConical } from "lucide-react"

type Genotype = NonNullable<AnimalProfile["genotypes"]>[number]
type GeneticsSubTab = "color" | "health" | "conformation" | "stats"

const GENETICS_SUB_TABS: { id: GeneticsSubTab; label: string }[] = [
  { id: "color", label: "Color" },
  { id: "health", label: "Health" },
  { id: "conformation", label: "Conformation" },
  { id: "stats", label: "Stats" },
]

function GenotypeTable({
  genotypes,
  testsPerCycle,
  testedThisCycle,
  onTest,
}: {
  genotypes: Genotype[]
  testsPerCycle: number
  testedThisCycle: number
  onTest?: (locusId: string) => void
}) {
  if (genotypes.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">None</p>
  }

  const untestedCount = genotypes.filter((g) => !g.isTestedByOwner).length
  const testsRemaining = Math.max(0, testsPerCycle - testedThisCycle)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {untestedCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {untestedCount} untested · scored by inferred probability
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {testsRemaining < testsPerCycle && (
            <Badge tone="muted">{testsRemaining} test{testsRemaining !== 1 ? "s" : ""} remaining today</Badge>
          )}
          <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">
            <FlaskConical className="size-3" /> Test Full Panel
          </ActionButton>
        </div>
      </div>

      <div className={cn(
        "grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/60",
        genotypes.length >= 8 ? "grid-cols-2" : "grid-cols-1"
      )}>
        {genotypes.map((g) => (
          <div key={g.locusId} className="flex items-center justify-between bg-card px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-foreground">{g.locus.name}</span>
            {g.isTestedByOwner ? (
              <span className="inline-block rounded bg-chart-5/12 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-chart-5">
                {g.alleleOne.symbol}/{g.alleleTwo.symbol}
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] italic text-muted-foreground/60">?/?</span>
                <ActionButton
                  variant="soft"
                  disabled={testsRemaining === 0 || !onTest}
                  className="h-5 px-1.5 text-[10px]"
                  onClick={() => onTest?.(g.locusId)}
                >
                  Test
                </ActionButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function InnateStats({ animal, config }: { animal: AnimalProfile; config: AnimalProfile["game"]["gameConfig"] }) {
  return (
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
  )
}

export function GeneticsTab({
  animal,
  config,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
}) {
  const [subTab, setSubTab] = useState<GeneticsSubTab>("color")

  const colorGenotypes = animal.genotypes.filter((g) => g.locus.displayGroup === "Color")
  const healthGenotypes = animal.genotypes.filter((g) =>
    g.locus.panelEntries.some((e) => e.panelDef.panelType === "HEALTH")
  )
  const conformationGenotypes = animal.genotypes.filter(
    (g) =>
      g.locus.displayGroup !== "Color" &&
      g.locus.panelEntries.some((e) => e.panelDef.panelType === "CONFORMATION")
  )

  const testsPerCycle = config?.maxLocusTestsPerCycle ?? 2

  // Count tests done in the most recent test cycle seen across all genotypes
  const allTestedCycles = animal.genotypes
    .filter((g) => g.testedCycle !== null)
    .map((g) => g.testedCycle as number)
  const latestTestedCycle = allTestedCycles.length > 0 ? Math.max(...allTestedCycles) : null
  const testedThisCycle =
    latestTestedCycle !== null
      ? animal.genotypes.filter((g) => g.testedCycle === latestTestedCycle).length
      : 0

  return (
    <div className="space-y-3">
      <div className="flex gap-0.5 border-b border-border/60 pb-2">
        {GENETICS_SUB_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
              subTab === id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "color" && (
        <GenotypeTable genotypes={colorGenotypes} testsPerCycle={testsPerCycle} testedThisCycle={testedThisCycle} />
      )}
      {subTab === "health" && (
        <GenotypeTable genotypes={healthGenotypes} testsPerCycle={testsPerCycle} testedThisCycle={testedThisCycle} />
      )}
      {subTab === "conformation" && (
        <GenotypeTable genotypes={conformationGenotypes} testsPerCycle={testsPerCycle} testedThisCycle={testedThisCycle} />
      )}
      {subTab === "stats" && <InnateStats animal={animal} config={config} />}
    </div>
  )
}
