import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { Badge, Panel } from "@/components/game/ui"
import { cn } from "@/lib/utils"
import { computePossiblePhenotypes, formatCoatPhenotype, type PossibleLocusPhenotypes } from "@/lib/breedUtils"

export const Route = createFileRoute("/_authenticated/breeds/$breedId")({
  component: BreedDetailPage,
})

type BreedDetail = RouterOutputs["breed"]["get"]
type Breed = BreedDetail["breed"]
type ConformStandard = Breed["conformationStandards"][number]
type DqTrait = Breed["dqTraits"][number]
type AlleleFrequency = Breed["alleleFrequencies"][number]
type WorkspaceTab = "history" | "characteristics" | "health" | "standard" | "foundation" | "traits"

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "characteristics", label: "Characteristics" },
  { id: "health", label: "Health" },
  { id: "standard", label: "Breed Standard" },
  { id: "traits", label: "Possible Traits" },
  { id: "foundation", label: "Foundation Animals" },
]

const BADGE_LABELS: Record<string, string> = {
  BASE: "Base",
  SECONDARY: "Secondary",
  CUSTOM: "Custom",
}

const CLIMATE_LABELS: Record<string, string> = {
  TROPICAL: "Tropical", ARID: "Arid", TEMPERATE: "Temperate", COLD: "Cold", ALPINE: "Alpine",
}

const TERRAIN_LABELS: Record<string, string> = {
  FLAT: "Flat", HILLY: "Hilly", MOUNTAINOUS: "Mountainous", COASTAL: "Coastal", FOREST: "Forest", DESERT: "Desert",
}

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-1 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

function MiniCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function AutoGrid({ minWidth = 110, children }: { minWidth?: number; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}>
      {children}
    </div>
  )
}


function SectionGroup({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function groupBySection<T extends { locus: { sectionEntries: { section: { id: string; name: string; displayOrder: number } }[] } }>(items: T[]) {
  const map = new Map<string, { section: { id: string; name: string; displayOrder: number }; items: T[] }>()
  for (const item of items) {
    const se = item.locus.sectionEntries[0]
    const key = se ? se.section.id : "__other"
    const section = se ? se.section : { id: "__other", name: "Other", displayOrder: 999 }
    if (!map.has(key)) map.set(key, { section, items: [] })
    map.get(key)!.items.push(item)
  }
  return [...map.values()].sort((a, b) => a.section.displayOrder - b.section.displayOrder)
}

function HistoryTab({ breed, lifeExpectancyYears }: { breed: Breed; lifeExpectancyYears: number | null }) {
  const hasVitals = lifeExpectancyYears != null || breed.immunityMin != null || breed.preferredClimate || breed.preferredTerrain

  return (
    <div className="space-y-4">
      {breed.lore ? (
        <div className="space-y-2">
          {breed.lore.split(/\n+/).filter(s => s.trim()).map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">{para}</p>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60">No history written for this breed.</p>
      )}

      {hasVitals && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
          <AutoGrid minWidth={120}>
            {lifeExpectancyYears != null && <MiniCard label="Life Expectancy" value={`${lifeExpectancyYears} yrs`} />}
            {breed.immunityMin != null && breed.immunityMax != null && (
              <MiniCard label="Immunity" value={`${breed.immunityMin.toFixed(0)}–${breed.immunityMax.toFixed(0)}`} />
            )}
            {breed.preferredClimate && <MiniCard label="Climate" value={CLIMATE_LABELS[breed.preferredClimate] ?? breed.preferredClimate} />}
            {breed.preferredTerrain && <MiniCard label="Terrain" value={TERRAIN_LABELS[breed.preferredTerrain] ?? breed.preferredTerrain} />}
          </AutoGrid>
        </div>
      )}
    </div>
  )
}

function PersonalityRangeBar({
  min,
  max,
  baseline,
  labelRanges,
}: {
  min: number
  max: number
  baseline: number
  labelRanges: { minValue: number; maxValue: number }[]
}) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v))
  const rangeLeft = clamp(min)
  const rangeRight = clamp(max)
  const markerX = clamp(baseline)
  return (
    <div className="relative flex-1" style={{ height: 22 }}>
      {/* Track + range fill (clipped to bar bounds) */}
      <div className="absolute inset-x-0 overflow-hidden rounded-full bg-muted" style={{ top: 7, height: 8 }}>
        <div
          className="absolute h-full bg-rose-400/40"
          style={{ left: `${rangeLeft}%`, width: `${rangeRight - rangeLeft}%` }}
        />
      </div>
      {/* Baseline marker */}
      <div
        className="absolute rounded-full bg-rose-500 ring-2 ring-background"
        style={{ left: `${markerX}%`, top: "50%", transform: "translate(-50%, -50%)", width: 12, height: 12 }}
      />
    </div>
  )
}

function CharacteristicsTab({ breed, defaultInnateRatio, averageTotalInnate }: {
  breed: Breed
  defaultInnateRatio: number
  averageTotalInnate: number | null
}) {
  if (breed.statProfile.length === 0 && breed.personalityProfiles.length === 0) {
    return <p className="text-xs text-muted-foreground/60">No characteristics defined for this breed.</p>
  }

  const totalPool = averageTotalInnate != null ? Math.round(defaultInnateRatio * averageTotalInnate) : null
  const totalWeight = breed.statProfile.reduce((s, sp) => s + sp.weight, 0) || 1

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      {breed.statProfile.length > 0 && (() => {
        const sorted = [...breed.statProfile].sort((a, b) => a.statDef.name.localeCompare(b.statDef.name))
        const statValues = sorted.map(s => ({
          ...s,
          value: totalPool != null ? Math.round(totalPool * (s.weight / totalWeight)) : null,
        }))
        const maxValue = Math.max(...statValues.map(s => s.value ?? s.weight), 1)

        return (
          <div>
            <div className="mb-2.5 flex items-baseline gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stat Distribution</p>
              {totalPool != null && (
                <p className="text-[11px] text-muted-foreground">
                  — total <span className="font-semibold text-foreground">{totalPool.toLocaleString()}</span>
                </p>
              )}
            </div>
            <div className="space-y-2.5">
              {statValues.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{s.statDef.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary/70 transition-all"
                      style={{ width: `${((s.value ?? s.weight) / maxValue) * 100}%` }}
                    />
                  </div>
                  {s.value != null && (
                    <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{s.value.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}
      {breed.personalityProfiles.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Personality</p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-6 rounded-full bg-rose-400/40" />
                natural range
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
                baseline
              </span>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {breed.personalityProfiles.map(p => {
              const lowLabel = p.traitDef.labelRanges[0]?.label ?? ""
              const highLabel = p.traitDef.labelRanges[p.traitDef.labelRanges.length - 1]?.label ?? ""
              return (
                <div key={p.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs font-semibold text-foreground">{p.traitDef.name}</span>
                    <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">0</span>
                    <PersonalityRangeBar min={p.naturalMin} max={p.naturalMax} baseline={p.baseline} labelRanges={p.traitDef.labelRanges} />
                    <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted-foreground">100</span>
                  </div>
                  {(lowLabel || highLabel) && (
                    <div className="mt-0.5 flex gap-2">
                      <span className="w-24 shrink-0" />
                      <span className="w-4 shrink-0" />
                      <div className="flex flex-1 justify-between text-[11px] text-muted-foreground/70">
                        <span>{lowLabel}</span>
                        <span>{highLabel}</span>
                      </div>
                      <span className="w-8 shrink-0" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function HealthTab({ healthConditions }: { healthConditions: string[] }) {
  if (healthConditions.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No known health conditions for this breed.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {healthConditions.map(h => (
          <span key={h} className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">{h}</span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Individual animals may or may not be carriers.</p>
    </div>
  )
}

const COAT_ROLE_LABELS: Record<string, string> = {
  BASE: "Base Color", DILUTION: "Dilution", MODIFIER: "Modifier", WHITE_PATTERN: "White Pattern",
}

type CoatStandardDisplay = { role: string; names: string[] }[]

function StandardTab({ breed, coatStandardDisplay }: { breed: Breed; coatStandardDisplay: CoatStandardDisplay }) {
  const dqSections = groupBySection(breed.dqTraits)

  type LocusEntry = {
    locusId: string
    locusName: string
    section: { id: string; name: string; displayOrder: number } | null
    standards: ConformStandard[]
  }
  const locusMap = new Map<string, LocusEntry>()
  for (const s of breed.conformationStandards) {
    if (!locusMap.has(s.locusId)) {
      const se = s.locus.sectionEntries[0]
      locusMap.set(s.locusId, { locusId: s.locusId, locusName: s.locus.name, section: se?.section ?? null, standards: [] })
    }
    locusMap.get(s.locusId)!.standards.push(s)
  }

  type SecEntry = { section: { id: string; name: string; displayOrder: number }; loci: LocusEntry[] }
  const secMap = new Map<string, SecEntry>()
  for (const entry of locusMap.values()) {
    const key = entry.section?.id ?? "__other"
    if (!secMap.has(key)) secMap.set(key, { section: entry.section ?? { id: "__other", name: "Other", displayOrder: 999 }, loci: [] })
    secMap.get(key)!.loci.push(entry)
  }
  const idealSections = [...secMap.values()]
    .sort((a, b) => a.section.displayOrder - b.section.displayOrder)
    .map(s => ({ ...s, loci: s.loci.sort((a, b) => a.locusName.localeCompare(b.locusName)) }))

  const hasHairSection = idealSections.some(s => s.section.name.toLowerCase().includes("hair"))

  return (
    <div className="space-y-4">
      {breed.conformationStandards.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ideal Traits</p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-700/70 dark:bg-green-400/70" />
                Ideal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full border border-border bg-secondary" />
                Acceptable
              </span>
            </div>
          </div>
          {idealSections.map(({ section, loci }) => (
            <SectionGroup key={section.id} name={section.name}>
              {section.name.toLowerCase().includes("hair") && coatStandardDisplay.map(({ role, names }) => (
                <div key={role} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{COAT_ROLE_LABELS[role] ?? role}</p>
                  <p className="text-sm text-foreground">{names.join(", ")}</p>
                </div>
              ))}
              {loci.map(({ locusId, locusName, standards }) => {
                const maxWeight = Math.max(...standards.map(s => s.weight))
                return (
                  <div key={locusId} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{locusName}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {standards.map(s => (
                        <span
                          key={s.id}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-sm border",
                            s.weight === maxWeight
                              ? "border-green-700/30 bg-green-700/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
                              : "border-border/50 bg-secondary/60 text-muted-foreground"
                          )}
                        >
                          {s.idealExpressionLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </SectionGroup>
          ))}
          {!hasHairSection && coatStandardDisplay.length > 0 && (
            <SectionGroup name="Hair & Coat">
              {coatStandardDisplay.map(({ role, names }) => (
                <div key={role} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{COAT_ROLE_LABELS[role] ?? role}</p>
                  <p className="text-sm text-foreground">{names.join(", ")}</p>
                </div>
              ))}
            </SectionGroup>
          )}
        </div>
      ) : coatStandardDisplay.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ideal Traits</p>
          <SectionGroup name="Hair & Coat">
            {coatStandardDisplay.map(({ role, names }) => (
              <div key={role} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{COAT_ROLE_LABELS[role] ?? role}</p>
                <p className="text-sm text-foreground">{names.join(", ")}</p>
              </div>
            ))}
          </SectionGroup>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60">No breed standard defined.</p>
      )}

      {(breed.dqTraits.length > 0 || breed.coatDqSelections.length > 0) && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disqualifying Traits</p>
          <div className="flex flex-wrap gap-1.5">
            {(breed.dqTraits as DqTrait[]).map(d => {
              const isColor = d.locus.panelEntries.some(e => e.panelDef.panelType === "COLOR" || e.panelDef.panelType === "VARIANCE")
              const label = isColor ? formatCoatPhenotype(d.expression) : d.expression
              return (
                <div key={d.id} className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-destructive/70">{d.locus.name}</p>
                  <p className="text-xs text-destructive">{label}</p>
                </div>
              )
            })}
            {breed.coatDqSelections.map(s => (
              <div key={s.id} className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-destructive/70">{COAT_ROLE_LABELS[s.colorRole] ?? s.colorRole}</p>
                <p className="text-xs text-destructive">{formatCoatPhenotype(s.expression)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FoundationTab({ breed }: { breed: Breed }) {
  const navigate = useNavigate()

  if (breed.foundationAnimals.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No foundation animals registered.</p>
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
      {breed.foundationAnimals.map(fa => (
        <div
          key={fa.id}
          onClick={() => navigate({ to: "/animal/$animalId", params: { animalId: fa.animal.id } })}
          className="flex cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/40"
        >
          <div className="aspect-square w-full overflow-hidden bg-linear-to-b from-secondary/40 to-card">
            {fa.animal.image ? (
              <img src={fa.animal.image} alt={fa.animal.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xl text-muted-foreground/15 select-none">🐎</div>
            )}
          </div>
          <div className="p-1.5">
            <p className="truncate text-xs font-semibold text-foreground">{fa.animal.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{fa.animal.playerAccount.username}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function PossibleTraitsTab({ alleleFrequencies }: { alleleFrequencies: AlleleFrequency[] }) {
  const loci = computePossiblePhenotypes(alleleFrequencies, { excludeColorLoci: true, excludeHealthLoci: true })

  if (alleleFrequencies.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No allele frequencies configured for this breed.</p>
  }
  if (loci.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No phenotypes could be resolved for this breed.</p>
  }

  const secMap = new Map<string, { section: PossibleLocusPhenotypes["section"]; loci: typeof loci }>()
  for (const l of loci) {
    const key = l.section?.id ?? "__other"
    if (!secMap.has(key)) secMap.set(key, { section: l.section, loci: [] })
    secMap.get(key)!.loci.push(l)
  }
  const sections = [...secMap.values()]

  return (
    <div className="space-y-4">
      {sections.map(({ section, loci: sLoci }) => (
        <SectionGroup key={section?.id ?? "__other"} name={section?.name ?? "Other"}>
          {sLoci.map(l => (
            <div key={l.locusId} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.locusName}</p>
              <p className="text-sm text-foreground">{l.phenotypes.map(formatCoatPhenotype).join(", ")}</p>
            </div>
          ))}
        </SectionGroup>
      ))}
    </div>
  )
}

function BreedDetailPage() {
  const { breedId } = Route.useParams()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data, isLoading, error } = trpc.breed.get.useQuery(
    { gameId, breedId },
    { enabled: !!gameId }
  )

  const [tab, setTab] = useState<WorkspaceTab>("history")

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>
  if (error || !data) return <div className="flex h-full items-center justify-center text-sm text-destructive">Breed not found.</div>

  const { breed, coatColors, coatColorOverflow, coatStandardDisplay, healthConditions, compatibleDisciplines, lifeExpectancyYears, defaultInnateRatio, averageTotalInnate } = data
  const dateAdded = new Date(breed.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">

      {/* Header */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{breed.name}</h1>
          <Badge tone="muted">{BADGE_LABELS[breed.categoryBadge] ?? breed.categoryBadge}</Badge>
        </div>
        {breed.foundingPlayer && (
          <p className="text-xs text-muted-foreground">Founded by {breed.foundingPlayer.username}</p>
        )}
      </div>

      {/* InfoStrip */}
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5 border-b border-border bg-card/50 px-4 py-2">
        {breed.preferredClimate && <InfoChip>{CLIMATE_LABELS[breed.preferredClimate] ?? breed.preferredClimate}</InfoChip>}
        {breed.preferredTerrain && <InfoChip>{TERRAIN_LABELS[breed.preferredTerrain] ?? breed.preferredTerrain}</InfoChip>}
        <InfoChip>Added {dateAdded}</InfoChip>
        <Link to="/breeds/" className="ml-2 text-xs text-muted-foreground transition-colors hover:text-foreground">← Directory</Link>
      </div>

      {/* Body */}
      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,820px)_minmax(0,1fr)]">

          {/* Left column — leaderboards + disciplines */}
          <div className="flex flex-col gap-3 items-end">
            <div className="flex flex-col gap-3">
            <Panel title="Quick Links" fit>
              <div className="divide-y divide-border/50">
                <Link
                  to="/stud-market"
                  className="flex items-center justify-between px-1 py-2 hover:text-primary transition-colors"
                >
                  <span className="text-xs text-foreground">Stud Listings</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                </Link>
                {(["Marketplace Listings", "Top Stats", "Competition Rankings", "Season Rankings"] as const).map(label => (
                  <div key={label} className="flex cursor-not-allowed items-center justify-between px-1 py-2 opacity-40">
                    <span className="text-xs text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                  </div>
                ))}
              </div>
            </Panel>

            {compatibleDisciplines.length > 0 && (
              <Panel title="Disciplines" fit>
                <div className="space-y-1.5">
                  {compatibleDisciplines.map((d, i) => (
                    <div key={d.id} className="flex items-center gap-2 text-xs">
                      <span className="w-3 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 truncate text-foreground">{d.name}</span>
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${Math.min((d.score / (compatibleDisciplines[0]!.score || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            </div>
          </div>

          {/* Center column — image + workspace */}
          <div className="order-first flex flex-col gap-3 min-[1100px]:order-0">
            <div className="relative flex aspect-9/5 w-full shrink-0 items-end overflow-hidden rounded-lg border border-border bg-linear-to-br from-secondary to-muted shadow-sm">
              {breed.image && (
                <img src={breed.image} alt={breed.name} className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="relative w-full bg-linear-to-t from-card/90 to-transparent px-4 py-3">
                <p className="font-serif text-lg font-semibold text-foreground">{breed.name}</p>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-secondary/40 px-2 py-1.5">
                {WORKSPACE_TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      tab === t.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-3">
                {tab === "history" && <HistoryTab breed={breed} lifeExpectancyYears={lifeExpectancyYears} />}
                {tab === "characteristics" && <CharacteristicsTab breed={breed} defaultInnateRatio={defaultInnateRatio} averageTotalInnate={averageTotalInnate} />}
                {tab === "health" && <HealthTab healthConditions={healthConditions} />}
                {tab === "standard" && <StandardTab breed={breed} coatStandardDisplay={coatStandardDisplay} />}
                {tab === "traits" && <PossibleTraitsTab alleleFrequencies={breed.alleleFrequencies} />}
                {tab === "foundation" && <FoundationTab breed={breed} />}
              </div>
            </div>

          </div>

          {/* Right column — coat colors */}
          <div className="flex flex-col gap-3 pr-4">
            {coatColors.length > 0 && (
              <Panel title="Coat Colors" fit className="w-fit">
                <div className="flex flex-wrap gap-1.5">
                  {coatColors.map(c => (
                    <span key={c} className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1 text-xs text-foreground">{c}</span>
                  ))}
                </div>
                {coatColorOverflow > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">+{coatColorOverflow} other combinations</p>
                )}
              </Panel>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
