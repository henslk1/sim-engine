import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { Badge, Panel } from "@/components/game/ui"
import { cn } from "@/lib/utils"

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
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
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

function resolveLabel(value: number, ranges: { label: string; minValue: number; maxValue: number }[]) {
  return ranges.find(r => value >= r.minValue && value <= r.maxValue)?.label ?? value.toFixed(0)
}

function SectionGroup({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{name}</p>
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
        <p className="text-sm leading-relaxed text-muted-foreground">{breed.lore}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60">No history written for this breed.</p>
      )}

      {hasVitals && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
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

function CharacteristicsTab({ breed }: { breed: Breed }) {
  if (breed.statProfile.length === 0 && breed.personalityProfiles.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No characteristics defined for this breed.</p>
  }

  return (
    <div className="space-y-4">
      {breed.statProfile.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stat Distribution</p>
          <AutoGrid minWidth={120}>
            {breed.statProfile.map(s => (
              <MiniCard
                key={s.id}
                label={s.statDef.name}
                value={`${s.naturalMin.toFixed(0)}–${s.naturalMax.toFixed(0)}`}
                sub={`${(s.weight * 100).toFixed(0)}% dist.`}
              />
            ))}
          </AutoGrid>
        </div>
      )}
      {breed.personalityProfiles.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Personality</p>
          <AutoGrid minWidth={120}>
            {breed.personalityProfiles.map(p => {
              const baseLabel = resolveLabel(p.baseline, p.traitDef.labelRanges)
              const minLabel = resolveLabel(p.naturalMin, p.traitDef.labelRanges)
              const maxLabel = resolveLabel(p.naturalMax, p.traitDef.labelRanges)
              const rangeSub = minLabel !== maxLabel ? `${minLabel} – ${maxLabel}` : undefined
              return <MiniCard key={p.id} label={p.traitDef.name} value={baseLabel} sub={rangeSub} />
            })}
          </AutoGrid>
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
          <span key={h} className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{h}</span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Individual animals may or may not be carriers.</p>
    </div>
  )
}

function StandardTab({ breed }: { breed: Breed }) {
  const standardSections = groupBySection(breed.conformationStandards)
  const dqSections = groupBySection(breed.dqTraits)

  return (
    <div className="space-y-4">
      {breed.conformationStandards.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ideal Traits</p>
          {standardSections.map(({ section, items }) => (
            <SectionGroup key={section.id} name={section.name}>
              {(items as ConformStandard[]).map(s => (
                <div key={s.id} className="min-w-24 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.locus.name}</p>
                  <p className="text-xs text-foreground">{s.idealExpressionLabel}</p>
                </div>
              ))}
            </SectionGroup>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60">No breed standard defined.</p>
      )}

      {breed.dqTraits.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disqualifying Traits</p>
          {dqSections.map(({ section, items }) => (
            <SectionGroup key={section.id} name={section.name}>
              {(items as DqTrait[]).map(d => (
                <div key={d.id} className="min-w-24 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive/70">{d.locus.name}</p>
                  <p className="text-xs text-destructive">{d.expression}</p>
                </div>
              ))}
            </SectionGroup>
          ))}
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
            <p className="truncate text-[11px] font-semibold text-foreground">{fa.animal.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{fa.animal.playerAccount.username}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function PossibleTraitsTab({ alleleFrequencies }: { alleleFrequencies: AlleleFrequency[] }) {
  if (alleleFrequencies.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No allele frequencies configured for this breed.</p>
  }

  const breedAllelesPerLocus = new Map<string, Set<string>>()
  for (const af of alleleFrequencies) {
    const lid = af.allele.locusId
    if (!breedAllelesPerLocus.has(lid)) breedAllelesPerLocus.set(lid, new Set())
    breedAllelesPerLocus.get(lid)!.add(af.allele.id)
  }

  type LocusData = {
    name: string
    section: { id: string; name: string; displayOrder: number } | null
    phenotypes: Set<string>
  }
  const locusMap = new Map<string, LocusData>()

  for (const af of alleleFrequencies) {
    // Coat color loci are handled by the Coat Colors panel — skip them here
    if (af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "COLOR")) continue
    const lid = af.allele.locusId
    const pool = breedAllelesPerLocus.get(lid) ?? new Set()
    if (!locusMap.has(lid)) {
      const se = af.allele.locus.sectionEntries[0]
      locusMap.set(lid, { name: af.allele.locus.name, section: se?.section ?? null, phenotypes: new Set() })
    }
    const entry = locusMap.get(lid)!
    for (const rule of af.allele.expressionRulesAsAlleleOne) {
      if (pool.has(rule.alleleTwoId)) entry.phenotypes.add(rule.phenotype)
    }
    for (const rule of af.allele.expressionRulesAsAlleleTwo) {
      if (pool.has(rule.alleleOneId)) entry.phenotypes.add(rule.phenotype)
    }
  }

  type SecEntry = {
    section: { id: string; name: string; displayOrder: number } | null
    loci: { id: string; name: string; phenotypes: string[] }[]
  }
  const secMap = new Map<string, SecEntry>()
  for (const [locusId, data] of locusMap) {
    if (data.phenotypes.size === 0) continue
    const key = data.section?.id ?? "__other"
    if (!secMap.has(key)) secMap.set(key, { section: data.section, loci: [] })
    secMap.get(key)!.loci.push({ id: locusId, name: data.name, phenotypes: [...data.phenotypes].sort() })
  }

  const sections = [...secMap.values()].sort((a, b) => (a.section?.displayOrder ?? 999) - (b.section?.displayOrder ?? 999))

  if (sections.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60">No phenotypes could be resolved for this breed.</p>
  }

  return (
    <div className="space-y-4">
      {sections.map(({ section, loci }) => (
        <SectionGroup key={section?.id ?? "__other"} name={section?.name ?? "Other"}>
          {loci.map(l => (
            <div key={l.id} className="min-w-28 rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.name}</p>
              <p className="text-sm text-foreground">{l.phenotypes.join(", ")}</p>
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

  const { breed, coatColors, healthConditions, compatibleDisciplines, lifeExpectancyYears } = data
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
        <Link to="/breeds/" className="ml-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground">← Directory</Link>
      </div>

      {/* Body */}
      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mx-auto max-w-6xl">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1100px]:grid-cols-[200px_minmax(0,1fr)_200px]">

          {/* Left column — leaderboards + disciplines */}
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
                    <span className="text-[10px] text-muted-foreground">→</span>
                  </div>
                ))}
              </div>
            </Panel>

            {compatibleDisciplines.length > 0 && (
              <Panel title="Disciplines" fit>
                <div className="space-y-1.5">
                  {compatibleDisciplines.map((d, i) => (
                    <div key={d.id} className="flex items-center gap-2 text-xs">
                      <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{i + 1}</span>
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
                {tab === "characteristics" && <CharacteristicsTab breed={breed} />}
                {tab === "health" && <HealthTab healthConditions={healthConditions} />}
                {tab === "standard" && <StandardTab breed={breed} />}
                {tab === "traits" && <PossibleTraitsTab alleleFrequencies={breed.alleleFrequencies} />}
                {tab === "foundation" && <FoundationTab breed={breed} />}
              </div>
            </div>
          </div>

          {/* Right column — coat colors */}
          <div className="flex flex-col gap-3">
            {coatColors.length > 0 && (
              <Panel title="Coat Colors" fit>
                <div className="flex flex-wrap gap-1.5">
                  {coatColors.map(c => (
                    <span key={c} className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1 text-[11px] text-foreground">{c}</span>
                  ))}
                </div>
              </Panel>
            )}
          </div>

        </div>
        </div>
      </main>
    </div>
  )
}
