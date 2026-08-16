import { useState } from "react"
import { cn } from "@/lib/utils"
import type { AnimalProfile } from "../types"
import { getTrainingCap, formatCycleAge } from "../utils"
import { ActionButton, Badge } from "@/components/game/ui"
import { FlaskConical, Loader2, ChevronDown } from "lucide-react"
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


function getPhenotype(genotype: Genotype): string | null {
  const rule = genotype.locus.expressionRules.find(
    (r) => r.alleleOneId === genotype.alleleOneId && r.alleleTwoId === genotype.alleleTwoId
  )
  return rule?.phenotype ?? null
}

function healthColor(genotype: Genotype): string {
  const rule = genotype.locus.expressionRules.find(
    r => r.alleleOneId === genotype.alleleOneId && r.alleleTwoId === genotype.alleleTwoId
  )
  if (!rule) return "text-chart-2"
  const hasRisk = rule.ruleConditions.some(rc => rc.penetrance === null || rc.penetrance > 0)
  if (!hasRisk) return "text-chart-1"
  return "text-destructive"
}

function GenotypeCard({
  genotype,
  testsRemaining,
  isTestingThis,
  isAgeGated,
  cycleToAge,
  onTest,
  compact = false,
}: {
  genotype: Genotype
  testsRemaining: number
  isTestingThis: boolean
  isAgeGated: boolean
  cycleToAge: (n: number) => string
  onTest: () => void
  compact?: boolean
}) {
  const alleleColor = compact ? healthColor(genotype) : "text-chart-5"
  return (
    <div className={cn("rounded-md border border-border/70 bg-secondary/30", compact ? "px-2 py-1" : "px-2.5 py-2")}>
      <p className={cn("text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", compact ? "mb-0" : "mb-0.5")}>{genotype.locus.name}</p>
      {genotype.isTestedByOwner ? (
        <span className={cn("font-mono font-semibold", compact ? "text-xs" : "text-sm", alleleColor)}>
          {genotype.alleleOne.symbol}/{genotype.alleleTwo.symbol}
        </span>
      ) : (
        <div className="flex items-center justify-between">
          <span className={cn("italic text-muted-foreground/60", compact ? "text-xs" : "text-sm")}>?/?</span>
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

function GenotypeGrid({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("grid", compact ? "gap-1.5 grid-cols-3" : "gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]")}>
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
  compact = false,
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
  compact?: boolean
}) {
  const eligibleUntested = genotypes.filter(
    (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
  )
  const totalCost = eligibleUntested.length * panelDef.testCost
  const isPending = testingPanelId === panelDef.id

  return (
    <div className="rounded-md border border-border bg-card">
      <div className={cn("flex items-center justify-between border-b border-border/60 px-3", compact ? "py-1.5" : "py-2")}>
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
      <div className={compact ? "p-1.5" : "p-2"}>
        <GenotypeGrid compact={compact}>
          {genotypes.map((g) => (
            <GenotypeCard
              key={g.locusId}
              genotype={g}
              testsRemaining={testsRemaining}
              isTestingThis={testingLocusId === g.locusId}
              isAgeGated={g.locus.minTestCycle != null && ageInCycles < g.locus.minTestCycle}
              cycleToAge={cycleToAge}
              onTest={() => onTestLocus(g.locusId)}
              compact={compact}
            />
          ))}
        </GenotypeGrid>
      </div>
    </div>
  )
}

function ConformationGenotypeCard({
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
  const phenotype = genotype.isTestedByOwner ? getPhenotype(genotype) : null
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {genotype.locus.name}
      </p>
      {genotype.isTestedByOwner ? (
        <p className="text-sm font-semibold text-foreground">{phenotype ?? "—"}</p>
      ) : (
        <div className="flex items-center justify-between">
          <span className="italic text-sm text-muted-foreground/60">?/?</span>
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

function ConformationAccordion({
  panels,
  ageInCycles,
  cycleToAge,
  testsRemaining,
  testingLocusId,
  testingPanelId,
  onTestLocus,
  onTestPanel,
}: {
  panels: { panelDef: PanelDef; genotypes: Genotype[] }[]
  ageInCycles: number
  cycleToAge: (n: number) => string
  testsRemaining: number
  testingLocusId: string | null
  testingPanelId: string | null
  onTestLocus: (locusId: string) => void
  onTestPanel: (panelDefId: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(panels[0]?.panelDef.id ?? null)

  return (
    <div className="overflow-hidden rounded-md border border-border divide-y divide-border">
      {panels.map(({ panelDef, genotypes }) => {
        const isOpen = openId === panelDef.id
        const testedCount = genotypes.filter((g) => g.isTestedByOwner).length
        const eligibleUntested = genotypes.filter(
          (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
        )
        const totalCost = eligibleUntested.length * panelDef.testCost
        const isPending = testingPanelId === panelDef.id

        return (
          <div key={panelDef.id}>
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : panelDef.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
            >
              <ChevronDown
                className={cn("size-3.5 shrink-0 text-muted-foreground/60 transition-transform", isOpen && "rotate-180")}
              />
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {panelDef.name}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {testedCount}/{genotypes.length} tested
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/60 bg-secondary/10">
                {eligibleUntested.length > 0 && (
                  <div className="flex justify-end px-2 pt-2">
                    <ActionButton
                      variant="soft"
                      className="h-6 px-2 text-[11px]"
                      disabled={isPending}
                      onClick={(e) => { e.stopPropagation(); onTestPanel(panelDef.id) }}
                    >
                      {isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <FlaskConical className="size-3" />
                      )}
                      {totalCost === 0 ? "Test Panel · Free" : `Test Panel · ${totalCost}g`}
                    </ActionButton>
                  </div>
                )}
                <div className="p-2">
                  <GenotypeGrid>
                    {genotypes.map((g) => (
                      <ConformationGenotypeCard
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
            )}
          </div>
        )
      })}
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

  const colorPanels = groupByPanel(animal.genotypes, "COLOR")
  const healthPanels = groupByPanel(animal.genotypes, "HEALTH")
  const sectionOrder = new Map((animal.game?.conformationSections ?? []).map((s, i) => [s.name, s.displayOrder ?? i]))
  const conformationPanels = groupByPanel(animal.genotypes, "CONFORMATION")
    .sort((a, b) => (sectionOrder.get(a.panelDef.name) ?? 999) - (sectionOrder.get(b.panelDef.name) ?? 999))

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
        colorPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No color panels</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {colorPanels.map(({ panelDef, genotypes }) => (
              <div key={panelDef.id} className="min-w-50 flex-1">
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

      {subTab === "health" && (
        healthPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No health panels</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {healthPanels.map(({ panelDef, genotypes }) => (
              <PanelGroup
                key={panelDef.id}
                panelDef={panelDef}
                genotypes={genotypes}
                ageInCycles={animal.ageInCycles}
                cycleToAge={cycleToAge}
                testsRemaining={testsRemaining}
                testingLocusId={testingLocusId}
                testingPanelId={testingPanelId}
                onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
                onTestPanel={(panelDefId) => testPanel({ animalId: animal.id, panelDefId })}
                compact
              />
            ))}
          </div>
        )
      )}

      {subTab === "conformation" && (
        conformationPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No conformation panels</p>
        ) : (
          <ConformationAccordion
            panels={conformationPanels}
            ageInCycles={animal.ageInCycles}
            cycleToAge={cycleToAge}
            testsRemaining={testsRemaining}
            testingLocusId={testingLocusId}
            testingPanelId={testingPanelId}
            onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
            onTestPanel={(panelDefId) => testPanel({ animalId: animal.id, panelDefId })}
          />
        )
      )}

      {subTab === "stats" && <InnateStats animal={animal} config={config} />}
    </div>
  )
}
