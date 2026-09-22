import { createContext, useContext, useState } from "react"
import { cn } from "@/lib/utils"
import type { AnimalProfile } from "../types"
import { getTrainingCap, formatCycleAge } from "../utils"
import { ActionButton, Badge } from "@/components/game/ui"
import { FlaskConical, Loader2, ChevronDown, Dna } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { getTutorialAccess } from "@/lib/tutorial/access"

type Genotype = NonNullable<AnimalProfile["genotypes"]>[number]
type PanelDef = Genotype["locus"]["panelEntries"][number]["panelDef"]
type GeneticsSubTab = "color" | "health" | "conformation" | "stats"

// Testing is an owner action. Visitors see the same tested/untested loci but
// none of the affordances to change them, so every button checks this rather
// than the prop being threaded through GenotypeCard/PanelCard/ColorPanelMerged.
const GeneticsReadonly = createContext(false)
const useGeneticsReadonly = () => useContext(GeneticsReadonly)

const GENETICS_SUB_TABS: { id: GeneticsSubTab; label: string }[] = [
  { id: "color", label: "Color" },
  { id: "health", label: "Health" },
  { id: "conformation", label: "Conformation" },
  { id: "stats", label: "Stats" },
]

function groupByPanel(genotypes: Genotype[], panelType: "COLOR" | "HEALTH" | "CONFORMATION") {
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
  const readonly = useGeneticsReadonly()
  const alleleColor = compact ? healthColor(genotype) : "text-chart-5"
  return (
    <div className={cn("rounded-md border border-border/70 bg-secondary/30", compact ? "px-2 py-1" : "px-2.5 py-2")}>
      <p className={cn("text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", compact ? "mb-0" : "mb-0.5")}>{genotype.locus.name}</p>
      {genotype.isTestedByOwner ? (
        <span data-tutorial="genetics-revealed-locus" className={cn("font-mono font-semibold", compact ? "text-xs" : "text-sm", alleleColor)}>
          {genotype.alleleOne.symbol}/{genotype.alleleTwo.symbol}
        </span>
      ) : (
        <div className="flex items-center justify-between">
          <span className={cn("italic text-muted-foreground/60", compact ? "text-xs" : "text-sm")}>?/?</span>
          {!readonly && (
          <ActionButton
            variant="soft"
            disabled={isAgeGated || testsRemaining === 0 || isTestingThis}
            className="h-5 px-1.5 text-[10px]"
            data-tutorial="genetics-test-locus-btn"
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
          )}
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
  dataTutorial,
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
  dataTutorial?: string
}) {
  const eligibleUntested = genotypes.filter(
    (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
  )
  const totalCost = eligibleUntested.length * panelDef.testCost
  const isPending = testingPanelId === panelDef.id
  const readonly = useGeneticsReadonly()

  return (
    <div className="rounded-md border border-border bg-card" data-tutorial={dataTutorial}>
      <div className={cn("flex items-center justify-between border-b border-border/60 px-3", compact ? "py-1.5" : "py-2")}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {panelDef.name}
        </span>
        {!readonly && eligibleUntested.length > 0 && (
          <ActionButton
            variant="soft"
            className="h-6 px-2 text-[11px]"
            data-tutorial="genetics-test-panel-btn"
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

function ColorPanelMerged({
  panels,
  ageInCycles,
  cycleToAge,
  testsRemaining,
  testingLocusId,
  isPending,
  onTestLocus,
  onTestPanels,
}: {
  panels: { panelDef: PanelDef; genotypes: Genotype[] }[]
  ageInCycles: number
  cycleToAge: (n: number) => string
  testsRemaining: number
  testingLocusId: string | null
  isPending: boolean
  onTestLocus: (locusId: string) => void
  onTestPanels: () => void
}) {
  const allGenotypes = panels.flatMap((p) => p.genotypes)
  const totalCost = panels.reduce((sum, p) => {
    const eligible = p.genotypes.filter(
      (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
    )
    return sum + eligible.length * p.panelDef.testCost
  }, 0)
  const readonly = useGeneticsReadonly()
  const hasEligible = panels.some((p) =>
    p.genotypes.some((g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle))
  )

  return (
    <div className="rounded-md border border-border bg-card" data-tutorial="genetics-color-content">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Color Panel</span>
        {!readonly && hasEligible && (
          <ActionButton data-tutorial="genetics-test-panel-btn" variant="soft" className="h-6 px-2 text-[11px]" disabled={isPending} onClick={onTestPanels}>
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
            {totalCost === 0 ? "Test Panel · Free" : `Test Panel · ${totalCost}g`}
          </ActionButton>
        )}
      </div>
      <div className="p-2">
        <GenotypeGrid>
          {allGenotypes.map((g) => (
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
  const hasTerrainMod = genotype.locus.expressionRules.some(r => r.terrainModifiers.length > 0)
  const hasClimateMod = genotype.locus.expressionRules.some(r => r.climateModifiers.length > 0)
  return (
    <div
      data-tutorial-terrain={hasTerrainMod}
      data-tutorial-climate={hasClimateMod}
      className={cn(
        "rounded-md border bg-secondary/30 px-2.5 py-2",
        // Amber = terrain, sky = climate, purple = a locus that feeds both.
        hasTerrainMod && hasClimateMod
          ? "border-purple-500/60"
          : hasTerrainMod
            ? "border-amber-500/60"
            : hasClimateMod
              ? "border-sky-500/60"
              : "border-border/70"
      )}
    >
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
  // Empty by default (all collapsed) — a locus's terrain/climate relevance can fall in
  // any section, so more than one may need to be open at once (see ConformationGenotypeCard).
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  return (
    <div className="overflow-hidden rounded-md border border-border divide-y divide-border" data-tutorial="conformation-accordion">
      {panels.map(({ panelDef, genotypes }) => {
        const isOpen = openIds.has(panelDef.id)
        const testedCount = genotypes.filter((g) => g.isTestedByOwner).length
        const eligibleUntested = genotypes.filter(
          (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
        )
        const totalCost = eligibleUntested.length * panelDef.testCost
        const isPending = testingPanelId === panelDef.id
        const hasTerrainLocus = genotypes.some(g => g.locus.expressionRules.some(r => r.terrainModifiers.length > 0))
        const hasClimateLocus = genotypes.some(g => g.locus.expressionRules.some(r => r.climateModifiers.length > 0))

        return (
          <div key={panelDef.id}>
            <button
              type="button"
              data-tutorial="conformation-section-btn"
              data-section-open={isOpen}
              data-terrain-section={hasTerrainLocus}
              data-climate-section={hasClimateLocus}
              onClick={() => setOpenIds(prev => {
                const next = new Set(prev)
                if (isOpen) next.delete(panelDef.id); else next.add(panelDef.id)
                return next
              })}
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
                      onClick={() => onTestPanel(panelDef.id)}
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

function computeProfileCost(panels: { panelDef: PanelDef; genotypes: Genotype[] }[], ageInCycles: number) {
  let cost = 0
  let hasEligible = false
  for (const { panelDef, genotypes } of panels) {
    const eligible = genotypes.filter(
      (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || ageInCycles >= g.locus.minTestCycle)
    )
    if (eligible.length > 0) hasEligible = true
    cost += eligible.length * panelDef.testCost
  }
  return { cost, hasEligible }
}

function CompleteProfileButton({
  cost,
  currencyLabel,
  hasEligible,
  isPending,
  onClick,
  tutorialKey,
}: {
  cost: number
  currencyLabel: string
  hasEligible: boolean
  isPending: boolean
  onClick: () => void
  tutorialKey?: string
}) {
  const readonly = useGeneticsReadonly()
  if (readonly) return null
  if (!hasEligible) return null
  return (
    <div className="border-t border-border/60 pt-3">
      <ActionButton variant="soft" className="w-full justify-center" disabled={isPending} onClick={onClick} data-tutorial={tutorialKey}>
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Dna className="size-3.5" />}
        Complete Genetic Profile{cost > 0 ? ` · ${cost}${currencyLabel}` : " · Free"}
      </ActionButton>
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
          const cap = getTrainingCap(s.innateValue, config, animal.personality)
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
  readonly = false,
  config,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
  readonly?: boolean
}) {
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const [subTab, setSubTab] = useState<GeneticsSubTab>(() => {
    const tutorial = getTutorialAccess()
    return tutorial.restricted && tutorial.step >= 123 && tutorial.step <= 126 ? "health" : "color"
  })

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const { mutate: testLocus, isPending: testLocusPending, variables: testLocusVars } =
    trpc.genetics.testLocus.useMutation({ onSuccess: () => { invalidate(); window.dispatchEvent(new CustomEvent("tutorial:geneticTestComplete", { detail: "locus" })) } })
  const { mutate: testPanel, isPending: testPanelPending, variables: testPanelVars } =
    trpc.genetics.testPanel.useMutation({ onSuccess: () => { invalidate(); window.dispatchEvent(new CustomEvent("tutorial:geneticTestComplete", { detail: "panel" })) } })
  const { mutate: testCompleteProfile, isPending: completeProfilePending } =
    trpc.genetics.testCompleteProfile.useMutation({ onSuccess: () => invalidate() })

  const testingLocusId = testLocusPending ? (testLocusVars?.locusId ?? null) : null
  const testingPanelId = testPanelPending ? (testPanelVars?.panelDefId ?? null) : null

  const testsPerCycle = config?.maxLocusTestsPerCycle ?? 2
  const testedThisCycle = animal.genotypes.filter((g) => g.testedCycle === animal.ageInCycles).length
  const testsRemaining = Math.max(0, testsPerCycle - testedThisCycle)

  const colorPanels = groupByPanel(animal.genotypes, "COLOR")
  const handleTestColorPanels = () => {
    for (const { panelDef, genotypes } of colorPanels) {
      const hasEligible = genotypes.some(
        (g) => !g.isTestedByOwner && (g.locus.minTestCycle == null || animal.ageInCycles >= g.locus.minTestCycle)
      )
      if (hasEligible) testPanel({ animalId: animal.id, panelDefId: panelDef.id })
    }
  }
  const healthPanels = groupByPanel(animal.genotypes, "HEALTH")
  const sectionOrder = new Map((animal.game?.conformationSections ?? []).map((s, i) => [s.name, s.displayOrder ?? i]))
  const conformationPanels = groupByPanel(animal.genotypes, "CONFORMATION")
    .sort((a, b) => (sectionOrder.get(a.panelDef.name) ?? 999) - (sectionOrder.get(b.panelDef.name) ?? 999))

  const flatCost = config?.completeProfileTestCost ?? 0
  const profileCurrency = config?.completeProfileTestCurrency?.symbol || config?.completeProfileTestCurrency?.name || ""
  const colorProfileEligible = computeProfileCost(colorPanels, animal.ageInCycles).hasEligible
  const healthProfileEligible = computeProfileCost(healthPanels, animal.ageInCycles).hasEligible
  const conformationProfileEligible = computeProfileCost(conformationPanels, animal.ageInCycles).hasEligible

  return (
    <GeneticsReadonly.Provider value={readonly}>
    <div className="space-y-3" data-tutorial="genetics-panel">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex gap-0.5">
          {GENETICS_SUB_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              data-tutorial={`genetics-tab-${id}`}
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
        {!readonly && subTab !== "stats" && (
          <Badge tone="muted" tutorialKey="genetics-tests-remaining">{testsRemaining} test{testsRemaining !== 1 ? "s" : ""} left</Badge>
        )}
      </div>

      {subTab === "color" && (
        colorPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No color panels</p>
        ) : (
          <ColorPanelMerged
            panels={colorPanels}
            ageInCycles={animal.ageInCycles}
            cycleToAge={cycleToAge}
            testsRemaining={testsRemaining}
            testingLocusId={testingLocusId}
            isPending={testPanelPending}
            onTestLocus={(locusId) => testLocus({ animalId: animal.id, locusId })}
            onTestPanels={handleTestColorPanels}
          />
        )
      )}
      {subTab === "color" && (
        <CompleteProfileButton cost={flatCost} currencyLabel={profileCurrency} hasEligible={colorProfileEligible} isPending={completeProfilePending} onClick={() => testCompleteProfile({ animalId: animal.id, panelType: "COLOR" })} />
      )}

      {subTab === "health" && (
        healthPanels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No health panels</p>
        ) : (
          <div className="grid grid-cols-2 gap-2" data-tutorial="genetics-health-content">
            {healthPanels.map(({ panelDef, genotypes }) => {
              const eligibleUntested = genotypes.filter(
                g => !g.isTestedByOwner && (g.locus.minTestCycle == null || animal.ageInCycles >= g.locus.minTestCycle)
              )
              const panelTutorial = eligibleUntested.length > 0 && eligibleUntested.length === genotypes.length
                ? "genetics-health-panel-untested"
                : eligibleUntested.length === 1 && genotypes.length > 1
                  ? "genetics-health-panel-near-complete"
                  : undefined
              return (
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
                  dataTutorial={panelTutorial}
                  compact
                />
              )
            })}
          </div>
        )
      )}
      {subTab === "health" && (
        <CompleteProfileButton cost={flatCost} currencyLabel={profileCurrency} hasEligible={healthProfileEligible} isPending={completeProfilePending} onClick={() => testCompleteProfile({ animalId: animal.id, panelType: "HEALTH" })} />
      )}

      {subTab === "conformation" && <div data-tutorial="conformation-genetics-results">
        {conformationPanels.length === 0 ? (
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
        )}
      </div>}
      {subTab === "conformation" && (
        <CompleteProfileButton cost={flatCost} currencyLabel={profileCurrency} hasEligible={conformationProfileEligible} isPending={completeProfilePending} onClick={() => testCompleteProfile({ animalId: animal.id, panelType: "CONFORMATION" })} tutorialKey="genetics-complete-profile-btn" />
      )}

      {subTab === "stats" && <InnateStats animal={animal} config={config} />}
    </div>
    </GeneticsReadonly.Provider>
  )
}
