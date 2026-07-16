import { useState } from "react"
import { cn } from "@/lib/utils"
import type { AnimalProfile } from "../types"
import { getTrainingCap, formatCycleAge } from "../utils"
import { ActionButton, Badge } from "@/components/game/ui"
import { FlaskConical, Loader2 } from "lucide-react"
import { trpc } from "@/lib/trpc"

type Genotype = NonNullable<AnimalProfile["genotypes"]>[number]
type PanelDef = Genotype["locus"]["panelEntries"][number]["panelDef"]
type GeneticsSubTab = "color" | "health" | "conformation" | "stats"

const GENETICS_SUB_TABS: { id: GeneticsSubTab; label: string }[] = [
  { id: "color", label: "Color" },
  { id: "health", label: "Health" },
  { id: "conformation", label: "Conformation" },
  { id: "stats", label: "Stats" },
]

function groupByPanel(genotypes: Genotype[], panelType: "HEALTH" | "CONFORMATION") {
  const panelMap = new Map<string, { panelDef: PanelDef; genotypes: Genotype[] }>()
  for (const g of genotypes) {
    const entry = g.locus.panelEntries.find((e) => e.panelDef.panelType === panelType)
    if (!entry) continue
    if (!panelMap.has(entry.panelDef.id)) {
      panelMap.set(entry.panelDef.id, { panelDef: entry.panelDef, genotypes: [] })
    }
    panelMap.get(entry.panelDef.id)!.genotypes.push(g)
  }
  return Array.from(panelMap.values())
}

function groupByAnyPanel(genotypes: Genotype[]) {
  const panelMap = new Map<string, { panelDef: PanelDef; genotypes: Genotype[] }>()
  const ungrouped: Genotype[] = []
  for (const g of genotypes) {
    const entry = g.locus.panelEntries[0]
    if (!entry) { ungrouped.push(g); continue }
    if (!panelMap.has(entry.panelDef.id)) {
      panelMap.set(entry.panelDef.id, { panelDef: entry.panelDef, genotypes: [] })
    }
    panelMap.get(entry.panelDef.id)!.genotypes.push(g)
  }
  return { panels: Array.from(panelMap.values()), ungrouped }
}

function GenotypeCard({
  genotype,
  testsRemaining,
  isTestingThis,
  isAgeGated,
  cycleToAge,
  onTest,
}: {
  genotype: Genotype
  testsRemaining: number
  isTestingThis: boolean
  isAgeGated: boolean
  cycleToAge: (n: number) => string
  onTest: () => void
}) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{genotype.locus.name}</p>
      {genotype.isTestedByOwner ? (
        <span className="font-mono text-sm font-semibold text-chart-5">
          {genotype.alleleOne.symbol}/{genotype.alleleTwo.symbol}
        </span>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm italic text-muted-foreground/60">?/?</span>
          <ActionButton
            variant="soft"
            disabled={isAgeGated || testsRemaining === 0 || isTestingThis}
            className="h-5 px-1.5 text-[10px]"
            onClick={onTest}
          >
            {isTestingThis ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isAgeGated ? (
              `${cycleToAge(genotype.locus.minTestCycle!)}+`
            ) : (
              "Test"
            )}
          </ActionButton>
        </div>
      )}
    </div>
  )
}

function GenotypeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {children}
    </div>
  )
}

function PanelGroup({
  panelDef,
  genotypes,
  ageInCycles,
  cycleToAge,
  testsRemaining,
  testingLocusId,
  testingPanelId,
  onTestLocus,
  onTestPanel,
}: {
  panelDef: PanelDef
  genotypes: Genotype[]
  ageInCycles: number
  cycleToAge: (n: number) => string
  testsRemaining: number
  testingLocusId: string | null
  testingPanelId: string | null
  onTestLocus: (locusId: string) => void
  onTestPanel: (panelDefId: string) => void
}) {
  const eligibleUntested = genotypes.filter(
    (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
  )
  const totalCost = eligibleUntested.length * panelDef.testCost
  const isPending = testingPanelId === panelDef.id

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {panelDef.name}
        </span>
        {eligibleUntested.length > 0 && (
          <ActionButton
            variant="soft"
            className="h-6 px-2 text-[11px]"
            disabled={isPending}
            onClick={() => onTestPanel(panelDef.id)}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <FlaskConical className="size-3" />
            )}
            {totalCost === 0 ? "Test Panel · Free" : `Test Panel · ${totalCost}g`}
          </ActionButton>
        )}
      </div>
      <div className="p-2">
        <GenotypeGrid>
          {genotypes.map((g) => (
            <GenotypeCard
              key={g.locusId}
              genotype={g}
              testsRemaining={testsRemaining}
              isTestingThis={testingLocusId === g.locusId}
              isAgeGated={g.locus.minTestCycle != null && ageInCycles < g.locus.minTestCycle}
              cycleToAge={cycleToAge}
              onTest={() => onTestLocus(g.locusId)}
            />
          ))}
        </GenotypeGrid>
      </div>
    </div>
  )
}

function InnateStats({ animal, config }: { animal: AnimalProfile; config: AnimalProfile["game"]["gameConfig"] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Innate Stats</h4>
      <p className="mb-2 text-[11px] text-muted-foreground">Sets the training cap for each stat.</p>
      <div className="grid grid-cols-3 gap-2">
        {animal.stats.map((s: AnimalProfile["stats"][number]) => {
          const cap = getTrainingCap(s.innateValue, config)
          return (
            <div
              key={s.statDef.name}
              className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2"
            >
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.statDef.name}</p>
              <p className="text-sm font-semibold text-foreground">{Math.round(s.innateValue)}</p>
              <p className="text-[10px] text-muted-foreground">cap {Math.round(cap)}</p>
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
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const [subTab, setSubTab] = useState<GeneticsSubTab>("color")

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const { mutate: testLocus, isPending: testLocusPending, variables: testLocusVars } =
    trpc.genetics.testLocus.useMutation({ onSettled: invalidate })
  const { mutate: testPanel, isPending: testPanelPending, variables: testPanelVars } =
    trpc.genetics.testPanel.useMutation({ onSettled: invalidate })

  const testingLocusId = testLocusPending ? (testLocusVars?.locusId ?? null) : null
  const testingPanelId = testPanelPending ? (testPanelVars?.panelDefId ?? null) : null

  const testsPerCycle = config?.maxLocusTestsPerCycle ?? 2
  const testedThisCycle = animal.genotypes.filter((g) => g.testedCycle === animal.ageInCycles).length
  const testsRemaining = Math.max(0, testsPerCycle - testedThisCycle)

  const colorGenotypes = animal.genotypes.filter((g) => g.locus.displayGroup === "Color")
  const nonColorGenotypes = animal.genotypes.filter((g) => g.locus.displayGroup !== "Color")
  const { panels: colorPanels, ungrouped: colorUngrouped } = groupByAnyPanel(colorGenotypes)
  const healthPanels = groupByPanel(nonColorGenotypes, "HEALTH")
  const conformationPanels = groupByPanel(nonColorGenotypes, "CONFORMATION")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex gap-0.5">
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
        {subTab !== "stats" && (
          <Badge tone="muted">{testsRemaining} test{testsRemaining !== 1 ? "s" : ""} left</Badge>
        )}
      </div>

      {subTab === "color" && (
        colorGenotypes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">None</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {colorPanels.map(({ panelDef, genotypes }) => (
              <div key={panelDef.id} className="min-w-[200px] flex-1">
                <PanelGroup
                  panelDef={panelDef}
                  genotypes={genotypes}
                  ageInCycles={animal.ageInCycles}
                  cycleToAge={cycleToAge}
                  testsRemaining={testsRemaining}
                  testingLocusId={testingLocusId}
                  testingPanelId={testingPanelId}
                  onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
                  onTestPanel={(panelDefId) => testPanel({ animalId: animal.id, panelDefId })}
                />
              </div>
            ))}
            {colorUngrouped.length > 0 && (
              <div className="min-w-[200px] flex-1 rounded-md border border-border bg-card">
                <div className="border-b border-border/60 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Other</span>
                </div>
                <div className="p-2">
                  <GenotypeGrid>
                    {colorUngrouped.map((g) => (
                      <GenotypeCard
                        key={g.locusId}
                        genotype={g}
                        testsRemaining={testsRemaining}
                        isTestingThis={testingLocusId === g.locusId}
                        isAgeGated={g.locus.minTestCycle != null && animal.ageInCycles < g.locus.minTestCycle}
                        cycleToAge={cycleToAge}
                        onTest={() => testLocus({ animalId: animal.id, locusId: g.locusId })}
                      />
                    ))}
                  </GenotypeGrid>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {subTab === "health" && (
        healthPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No health panels</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {healthPanels.map(({ panelDef, genotypes }) => (
              <div key={panelDef.id} className="min-w-[200px] flex-1">
                <PanelGroup
                  panelDef={panelDef}
                  genotypes={genotypes}
                  ageInCycles={animal.ageInCycles}
                  cycleToAge={cycleToAge}
                  testsRemaining={testsRemaining}
                  testingLocusId={testingLocusId}
                  testingPanelId={testingPanelId}
                  onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
                  onTestPanel={(panelDefId) => testPanel({ animalId: animal.id, panelDefId })}
                />
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "conformation" && (
        conformationPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No conformation panels</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {conformationPanels.map(({ panelDef, genotypes }) => (
              <div key={panelDef.id} className="min-w-[200px] flex-1">
                <PanelGroup
                  panelDef={panelDef}
                  genotypes={genotypes}
                  ageInCycles={animal.ageInCycles}
                  cycleToAge={cycleToAge}
                  testsRemaining={testsRemaining}
                  testingLocusId={testingLocusId}
                  testingPanelId={testingPanelId}
                  onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
                  onTestPanel={(panelDefId) => testPanel({ animalId: animal.id, panelDefId })}
                />
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "stats" && <InnateStats animal={animal} config={config} />}
    </div>
  )
}
