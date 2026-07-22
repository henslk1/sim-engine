import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Trophy, MapPin, ChevronLeft, Users, Clock, Mountain, Waves, Wind, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/venue/$venueId")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
    disciplineDefId: (search.disciplineDefId as string) || undefined,
    isConformation: search.isConformation === true || search.isConformation === "true" || undefined,
    from: (search.from as string) || undefined,
  }),
  component: VenueDetailPage,
})

// ─── Types ─────────────────────────────────────────────────────────────────────

type Competition = {
  id: string
  name: string
  maxEntries: number
  isInvitational: boolean
  breedId: string | null
  breed: { id: string; name: string } | null
  expiresAt: Date | string
  _count: { entries: number }
  tierDef: { id: string; name: string; tierIndex: number; entryFee: number } | null
  disciplineDef: {
    id: string
    name: string
    isConformation: boolean
    equipmentRequirements: { id: string; quantity: number; itemDef: { id: string; name: string } }[]
    statWeights: { weight: number; statDef: { id: string; name: string } }[]
  }
  venue: { id: string; name: string }
  entries: {
    animal: {
      id: string
      name: string
      breed: { name: string }
      conformationScores: { score: number; breedId: string }[]
    }
    entryStats: { trainedValue: number; statDef: { id: string } }[]
    playerAccount: { username: string }
  }[]
}

type AliveAnimal = {
  id: string
  name: string
  status: string
  sex: string
  breed: { id: string; name: string }
  lifeStage: { name: string }
  compTiers: { disciplineDefId: string; tierDefId: string }[]
  equipment: { itemDef: { id: string } }[]
  conformationScores: { breedId: string }[]
  ageInCycles: number
  healthCertificates: { certDefId: string; isValid: boolean; expiresAtCycle: number }[]
}

// ─── Lookup tables ─────────────────────────────────────────────────────────────

const HEADER_GRADIENT: Record<string, string> = {
  HOT:       "bg-gradient-to-r from-chart-1/20 via-chart-1/8 to-transparent",
  WARM:      "bg-gradient-to-r from-chart-3/20 via-chart-3/8 to-transparent",
  COLD:      "bg-gradient-to-r from-chart-4/20 via-chart-4/8 to-transparent",
  TEMPERATE: "bg-gradient-to-r from-chart-2/20 via-chart-2/8 to-transparent",
}

const CLIMATE_BADGE: Record<string, string> = {
  HOT:       "bg-chart-1/20 text-chart-1",
  WARM:      "bg-chart-3/20 text-chart-3",
  COLD:      "bg-chart-4/20 text-chart-4",
  TEMPERATE: "bg-chart-2/20 text-chart-2",
}

const CLIMATE_ICON_CLS: Record<string, string> = {
  HOT:       "text-chart-1/12",
  WARM:      "text-chart-3/12",
  COLD:      "text-chart-4/12",
  TEMPERATE: "text-chart-2/12",
}

const CONDITIONS: Record<string, Record<string, string>> = {
  HOT:       { FLAT: "Hot & Hard Ground",     COASTAL: "Hot & Coastal Shore",    HILLY: "Hot & Rolling Hills",     MOUNTAIN: "Hot & Rocky Peaks" },
  WARM:      { FLAT: "Warm & Soft Turf",       COASTAL: "Warm & Sea Breeze",      HILLY: "Warm & Gentle Hills",     MOUNTAIN: "Warm & Steep Slopes" },
  COLD:      { FLAT: "Cold & Frozen Ground",   COASTAL: "Cold & Icy Shoreline",   HILLY: "Cold & Rugged Hills",     MOUNTAIN: "Cold & Thin Air" },
  TEMPERATE: { FLAT: "Temperate & Soft Turf",  COASTAL: "Temperate & Open Coast", HILLY: "Temperate & Rolling Fields", MOUNTAIN: "Temperate & High Ground" },
}

function TerrainIcon({ terrain, size = 80 }: { terrain: string | null | undefined; size?: number }) {
  if (terrain === "COASTAL") return <Waves size={size} strokeWidth={0.7} />
  if (terrain === "MOUNTAIN" || terrain === "HILLY") return <Mountain size={size} strokeWidth={0.7} />
  return <Wind size={size} strokeWidth={0.7} />
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SlotBar({ filled, max }: { filled: number; max: number }) {
  if (max <= 0) return null
  const pct = Math.min(100, Math.round((filled / max) * 100))
  const isFull = filled >= max
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", isFull ? "bg-destructive" : pct >= 75 ? "bg-chart-1" : "bg-chart-2")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("font-mono text-xs tabular-nums", isFull ? "text-destructive" : "text-muted-foreground")}>
        {filled}/{max}
      </span>
      {isFull && (
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-destructive">
          Full
        </span>
      )}
    </div>
  )
}

function deadlineInfo(expiresAt: Date | string): { text: string; cls: string } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const hours = ms / 3600000
  const minutes = ms / 60000
  if (hours < 0)   return { text: "Expired",                          cls: "text-destructive" }
  if (hours < 1)   return { text: `${Math.ceil(minutes)}m left`,      cls: "text-destructive font-semibold" }
  if (hours < 6)   return { text: `${Math.ceil(hours)}h left`,        cls: "text-destructive font-semibold" }
  if (hours < 24)  return { text: `${Math.ceil(hours)}h left`,        cls: "text-chart-1" }
  return { text: `${Math.ceil(hours / 24)}d left`,                     cls: "text-muted-foreground" }
}

// ─── Entry sub-table ───────────────────────────────────────────────────────────

function EntryTable({ comp }: { comp: Competition }) {
  const isConformation = comp.disciplineDef.isConformation
  const statWeights = comp.disciplineDef.statWeights
  const gridTemplate = isConformation
    ? "1fr 140px 140px"
    : `1fr ${statWeights.map(() => "72px").join(" ")} 140px`

  return (
    <div className="border-t border-border bg-secondary/30">
      <div style={{ display: "grid", gridTemplateColumns: gridTemplate }} className="border-b border-border/60 bg-secondary/50 px-4 py-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Entered</span>
        {isConformation ? (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Conformation Score</span>
        ) : (
          statWeights.map((sw) => (
            <span key={sw.statDef.id} className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {sw.statDef.name}
            </span>
          ))
        )}
        <span className="text-right text-[10px] uppercase tracking-widest text-muted-foreground">Owner</span>
      </div>
      {comp.entries.length === 0 ? (
        <div className="px-4 py-3 text-xs italic text-muted-foreground/60">No contestants yet</div>
      ) : comp.entries.map(({ animal, entryStats, playerAccount }) => {
        const conformationScore = isConformation
          ? (comp.breedId
              ? animal.conformationScores.find((cs) => cs.breedId === comp.breedId)?.score
              : animal.conformationScores[0]?.score)
          : undefined
        return (
          <div
            key={animal.id}
            style={{ display: "grid", gridTemplateColumns: gridTemplate }}
            className="border-t border-border/30 px-4 py-1.5 text-xs"
          >
            <div className="flex items-center gap-2">
              <Link
                to="/animal/$animalId"
                params={{ animalId: animal.id }}
                className="font-medium text-foreground transition-colors hover:text-primary"
              >
                {animal.name}
              </Link>
              <span className="text-muted-foreground/60">{animal.breed.name}</span>
            </div>
            {isConformation ? (
              <span className="tabular-nums text-muted-foreground">
                {conformationScore !== undefined ? conformationScore.toFixed(1) : "—"}
              </span>
            ) : (
              statWeights.map((sw) => {
                const stat = entryStats.find((s) => s.statDef.id === sw.statDef.id)
                return (
                  <span key={sw.statDef.id} className="tabular-nums text-muted-foreground">
                    {stat !== undefined ? Math.round(stat.trainedValue) : "—"}
                  </span>
                )
              })
            )}
            <span className="text-right text-muted-foreground">{playerAccount.username}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Competition table ─────────────────────────────────────────────────────────


const TABLE_COLS_FREE   = "grid grid-cols-[1fr_72px_110px_180px_120px]"
const TABLE_COLS_ANIMAL = "grid grid-cols-[1fr_72px_110px_120px]"

function CompTable({ children, animalMode, title, invitational }: {
  children: React.ReactNode
  animalMode?: boolean
  title?: string
  invitational?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {title && (
        <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {invitational && (
            <span className="flex items-center gap-1 rounded bg-chart-3/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-chart-3">
              <Star size={8} />
              Invitational
            </span>
          )}
        </div>
      )}
      <div className={cn(animalMode ? TABLE_COLS_ANIMAL : TABLE_COLS_FREE, "border-b border-border bg-secondary/70 px-4 py-2")}>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Entries</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Closes</span>
        {!animalMode && <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Animal</span>}
        <span />
      </div>
      {children}
    </div>
  )
}

type CompRowProps = {
  comp: Competition
  animalMode: boolean
  animalOptions: AliveAnimal[]
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
  playerAccountId: string | undefined
  isEntering: boolean
  justEntered: boolean
  errorMsg: string | null
  onEnter: () => void
}

function CompRow({
  comp,
  animalMode,
  animalOptions,
  selectedAnimalId,
  onSelectAnimal,
  playerAccountId,
  isEntering,
  justEntered,
  errorMsg,
  onEnter,
}: CompRowProps) {
  const isFull = comp._count.entries >= comp.maxEntries
  const dl = deadlineInfo(comp.expiresAt)
  const feeLabel = !comp.tierDef || comp.tierDef.entryFee === 0 ? "Free" : `${comp.tierDef.entryFee}`
  const canEnter = !!playerAccountId && !isFull && !isEntering && !justEntered
    && (animalMode || !!selectedAnimalId)

  const cols = animalMode ? TABLE_COLS_ANIMAL : TABLE_COLS_FREE

  return (
    <div className={cn(
      cols,
      "items-center border-t border-border px-4 py-2.5 transition-colors",
      isFull ? "opacity-60" : justEntered ? "bg-chart-2/5" : "hover:bg-secondary/20",
    )}>
      {/* Entries */}
      <SlotBar filled={comp._count.entries} max={comp.maxEntries} />

      {/* Fee */}
      <span className="font-mono text-xs text-muted-foreground">{feeLabel}</span>

      {/* Closes */}
      <span className={cn("flex items-center gap-1 font-mono text-xs", dl.cls)}>
        <Clock size={10} />
        {dl.text}
      </span>

      {/* Animal dropdown — free mode only */}
      {!animalMode && (
        <div className="flex flex-col gap-0.5">
          <select
            value={selectedAnimalId}
            onChange={(e) => onSelectAnimal(e.target.value)}
            disabled={isFull}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— Select —</option>
            {animalOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.sex === "MALE" ? "M" : "F"})
              </option>
            ))}
          </select>
          {errorMsg && <span className="text-[10px] text-destructive">{errorMsg}</span>}
        </div>
      )}

      {/* Action */}
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          disabled={!canEnter}
          onClick={onEnter}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
            justEntered
              ? "bg-chart-2/15 text-chart-2"
              : isFull
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isEntering ? "Entering…" : justEntered ? "Entered ✓" : isFull ? "Full" : "Enter"}
        </button>
        {animalMode && errorMsg && <span className="text-[10px] text-destructive">{errorMsg}</span>}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function VenueDetailPage() {
  const { venueId } = Route.useParams()
  const { animalId: initialAnimalId, disciplineDefId, isConformation, from } = Route.useSearch()

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: animals } = trpc.animal.list.useQuery()
  const aliveAnimals = (animals?.filter((a) => a.status === "ALIVE") ?? []) as AliveAnimal[]

  const isAnimalMode = !!initialAnimalId

  const [rowSelections, setRowSelections] = useState<Record<string, string>>({})
  const [enteredPairs, setEnteredPairs] = useState<Set<string>>(new Set())
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [banners, setBanners] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<"sporting" | "conformation">("sporting")

  const { data: certDefs } = trpc.vet.listCertDefs.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const requiredCertDefIds = (certDefs ?? []).filter((c) => c.requiredForCompetition).map((c) => c.id)

  const { data: allVenues } = trpc.competition.listVenues.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const venue = allVenues?.find((v) => v.id === venueId)

  const { data: competitions, isLoading: compsLoading } = trpc.competition.listOpen.useQuery(
    { gameId: gameId!, disciplineDefId: isConformation ? undefined : disciplineDefId, isConformation: isConformation ?? undefined },
    { enabled: !!gameId },
  )
  const venueComps = (competitions?.filter((c) => c.venue.id === venueId) ?? []) as Competition[]

  const utils = trpc.useUtils()
  const enter = trpc.competition.enter.useMutation({
    onSuccess: (_, variables) => {
      const pair = `${variables.competitionId}:${variables.animalId}`
      setEnteredPairs((prev) => new Set([...prev, pair]))
      setRowErrors((prev) => { const n = { ...prev }; delete n[variables.competitionId]; return n })
      utils.competition.listOpen.invalidate({ gameId: gameId! })
      if (isAnimalMode) {
        const animalName = aliveAnimals.find((a) => a.id === variables.animalId)?.name ?? "Animal"
        setBanners((prev) => [...prev, `${animalName} has been entered`])
      } else {
        setRowSelections((prev) => { const n = { ...prev }; delete n[variables.competitionId]; return n })
      }
    },
    onError: (err, variables) => {
      setRowErrors((prev) => ({ ...prev, [variables.competitionId]: err.message }))
    },
  })

  function meetsEquipmentReqs(a: AliveAnimal, comp: Competition): boolean {
    return comp.disciplineDef.equipmentRequirements.every((req) => {
      const count = (a.equipment ?? []).filter((eq) => eq.itemDef.id === req.itemDef.id).length
      return count >= req.quantity
    })
  }

  function hasRequiredCerts(a: AliveAnimal): boolean {
    return requiredCertDefIds.every((certDefId) => {
      const cert = (a.healthCertificates ?? []).find((c) => c.certDefId === certDefId)
      return cert && cert.isValid && cert.expiresAtCycle > a.ageInCycles
    })
  }

  function eligibleAnimalsFor(comp: Competition): AliveAnimal[] {
    return aliveAnimals.filter((a) => {
      if (comp.breedId && a.breed.id !== comp.breedId) return false
      if (!meetsEquipmentReqs(a, comp)) return false
      if (comp.disciplineDef.isConformation) {
        const hasScore = comp.breedId
          ? (a.conformationScores ?? []).some((cs) => cs.breedId === comp.breedId)
          : (a.conformationScores ?? []).length > 0
        if (!hasScore) return false
      }
      if (comp.tierDef) {
        const animalTier = (a.compTiers ?? []).find((t) => t.disciplineDefId === comp.disciplineDef.id)
        if (animalTier) {
          if (animalTier.tierDefId !== comp.tierDef.id) return false
        } else {
          if (comp.tierDef.tierIndex !== 0) return false
        }
      }
      if (!hasRequiredCerts(a)) return false
      if (enteredPairs.has(`${comp.id}:${a.id}`)) return false
      if (comp.entries.some((e) => e.animal.id === a.id)) return false
      return true
    })
  }

  const animalForFilter = isAnimalMode ? aliveAnimals.find((a) => a.id === initialAnimalId) : undefined

  function isEligibleForAnimal(comp: Competition, animal: AliveAnimal): boolean {
    if (comp.breedId && animal.breed.id !== comp.breedId) return false
    if (!meetsEquipmentReqs(animal, comp)) return false
    if (comp.disciplineDef.isConformation) {
      const hasScore = comp.breedId
        ? (animal.conformationScores ?? []).some((cs) => cs.breedId === comp.breedId)
        : (animal.conformationScores ?? []).length > 0
      if (!hasScore) return false
    }
    if (comp.tierDef) {
      const animalTier = (animal.compTiers ?? []).find((t) => t.disciplineDefId === comp.disciplineDef.id)
      if (animalTier) {
        if (animalTier.tierDefId !== comp.tierDef.id) return false
      } else {
        if (comp.tierDef.tierIndex !== 0) return false
      }
    }
    if (!hasRequiredCerts(animal)) return false
    if (comp.entries.some((e) => e.animal.id === animal.id)) return false
    return true
  }

  const displayComps = isAnimalMode && animalForFilter
    ? venueComps.filter((c) => isEligibleForAnimal(c, animalForFilter))
    : venueComps

  // Split competitions into sporting vs conformation
  const sportingByDiscipline: Record<string, Competition[]> = {}
  const conformationByBreed: Record<string, Competition[]> = {}
  for (const comp of displayComps) {
    if (comp.disciplineDef.isConformation) {
      const key = comp.breedId ?? comp.disciplineDef.id
      if (!conformationByBreed[key]) conformationByBreed[key] = []
      conformationByBreed[key].push(comp)
    } else {
      if (!sportingByDiscipline[comp.disciplineDef.id]) sportingByDiscipline[comp.disciplineDef.id] = []
      sportingByDiscipline[comp.disciplineDef.id].push(comp)
    }
  }
  const hasSporting = Object.keys(sportingByDiscipline).length > 0
  const hasConformation = Object.keys(conformationByBreed).length > 0

  const conditions = venue?.climate && venue?.terrain ? CONDITIONS[venue.climate]?.[venue.terrain] : null
  const headerGradient = venue?.climate ? HEADER_GRADIENT[venue.climate] : ""
  const climateBadge = venue?.climate ? CLIMATE_BADGE[venue.climate] : ""
  const iconCls = venue?.climate ? CLIMATE_ICON_CLS[venue.climate] : "text-foreground/5"

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">

          {/* Venue header */}
          <div className={cn("relative px-8 py-8", headerGradient)}>
            {/* Large faint terrain icon */}
            <div className={cn("pointer-events-none absolute right-8 top-1/2 -translate-y-1/2", iconCls)}>
              <TerrainIcon terrain={venue?.terrain} size={140} />
            </div>

            <Link
              to="/venues"
              search={{ animalId: initialAnimalId, disciplineDefId, isConformation, from }}
              className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft size={14} />
              All Venues
            </Link>

            <h1 className="text-3xl font-semibold text-foreground">
              {venue?.name ?? "Loading…"}
            </h1>

            {conditions && (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={13} />
                {conditions}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {venue?.climate && (
                <span className={cn("rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide", climateBadge)}>
                  {venue.climate.charAt(0) + venue.climate.slice(1).toLowerCase()}
                </span>
              )}
              {venue?.terrain && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {venue.terrain.charAt(0) + venue.terrain.slice(1).toLowerCase()}
                </span>
              )}
              {!compsLoading && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {displayComps.length} open competition{displayComps.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Competition content */}
          <div className="border-t border-border p-8">

            {/* Entry banners */}
            {banners.length > 0 && (
              <div className="mb-6 space-y-2">
                {banners.map((msg, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm font-semibold text-chart-2">
                    <Trophy size={14} />
                    {msg}
                  </div>
                ))}
              </div>
            )}

        {/* Competition sections */}
        {compsLoading ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-muted/20" />
            ))}
          </div>
        ) : displayComps.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy size={36} className="mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-xl font-semibold text-foreground">No open competitions</p>
            <p className="mt-1.5 text-sm text-muted-foreground">Check back soon — new events are added regularly.</p>
          </div>
        ) : (
          <div>
            {/* Tabs */}
            {hasSporting && hasConformation && (
              <div className="mb-6 flex gap-1 rounded-xl border border-border bg-secondary/50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("sporting")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                    activeTab === "sporting"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Trophy size={13} />
                  Sporting
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("conformation")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                    activeTab === "conformation"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Users size={13} />
                  Conformation
                </button>
              </div>
            )}

            {/* Sporting Disciplines */}
            {hasSporting && (!hasConformation || activeTab === "sporting") && (
              <div>
                {!hasConformation && (
                  <div className="mb-4 flex items-center gap-3">
                    <Trophy size={15} className="text-chart-1" />
                    <h2 className="text-xl font-semibold text-foreground">Sporting Disciplines</h2>
                  </div>
                )}
                <div className="space-y-6">
                  {Object.entries(sportingByDiscipline).map(([disciplineId, comps]) => {
                    const discipline = comps[0].disciplineDef
                    return (
                      <div key={disciplineId}>
                        <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2.5">
                          <h3 className="text-base font-semibold text-foreground">{discipline.name}</h3>
                          <span className="text-xs text-muted-foreground">{comps.length} open</span>
                        </div>
                        <div className="space-y-3">
                          {comps.map((comp) => (
                            <CompTable key={comp.id} animalMode={isAnimalMode} title={comp.tierDef?.name ?? "Open"} invitational={comp.isInvitational}>
                              <CompRow
                                comp={comp}
                                animalMode={isAnimalMode}
                                animalOptions={isAnimalMode ? [] : eligibleAnimalsFor(comp)}
                                selectedAnimalId={isAnimalMode ? "" : (rowSelections[comp.id] ?? "")}
                                onSelectAnimal={(id) => setRowSelections((p) => ({ ...p, [comp.id]: id }))}
                                playerAccountId={playerAccountId}
                                isEntering={enter.isPending && enter.variables?.competitionId === comp.id}
                                justEntered={isAnimalMode
                                  ? enteredPairs.has(`${comp.id}:${initialAnimalId ?? ""}`) || comp.entries.some((e) => e.animal.id === initialAnimalId)
                                  : enteredPairs.has(`${comp.id}:${rowSelections[comp.id] ?? ""}`)}
                                errorMsg={rowErrors[comp.id] ?? null}
                                onEnter={() => {
                                  const animalId = isAnimalMode ? initialAnimalId : rowSelections[comp.id]
                                  if (!animalId || !playerAccountId) return
                                  enter.mutate({ animalId, competitionId: comp.id, playerAccountId })
                                }}
                              />
                              <EntryTable comp={comp} />
                            </CompTable>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Conformation Registry */}
            {hasConformation && (!hasSporting || activeTab === "conformation") && (
              <div>
                {!hasSporting && (
                  <div className="mb-4 flex items-center gap-3">
                    <Users size={15} className="text-chart-3" />
                    <h2 className="text-xl font-semibold text-foreground">Conformation Registry</h2>
                  </div>
                )}
                <div className="space-y-6">
                  {Object.entries(conformationByBreed).map(([breedKey, comps]) => {
                    const breedName = comps[0].breed?.name ?? comps[0].disciplineDef.name
                    return (
                      <div key={breedKey}>
                        <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2.5">
                          <h3 className="text-base font-semibold text-foreground">{breedName}</h3>
                          <span className="text-xs text-muted-foreground">{comps.length} open</span>
                        </div>
                        <div className="space-y-3">
                          {comps.map((comp) => (
                            <CompTable key={comp.id} animalMode={isAnimalMode} title={comp.tierDef?.name ?? "Open"} invitational={comp.isInvitational}>
                              <CompRow
                                comp={comp}
                                animalMode={isAnimalMode}
                                animalOptions={isAnimalMode ? [] : eligibleAnimalsFor(comp)}
                                selectedAnimalId={isAnimalMode ? "" : (rowSelections[comp.id] ?? "")}
                                onSelectAnimal={(id) => setRowSelections((p) => ({ ...p, [comp.id]: id }))}
                                playerAccountId={playerAccountId}
                                isEntering={enter.isPending && enter.variables?.competitionId === comp.id}
                                justEntered={isAnimalMode
                                  ? enteredPairs.has(`${comp.id}:${initialAnimalId ?? ""}`) || comp.entries.some((e) => e.animal.id === initialAnimalId)
                                  : enteredPairs.has(`${comp.id}:${rowSelections[comp.id] ?? ""}`)}
                                errorMsg={rowErrors[comp.id] ?? null}
                                onEnter={() => {
                                  const animalId = isAnimalMode ? initialAnimalId : rowSelections[comp.id]
                                  if (!animalId || !playerAccountId) return
                                  enter.mutate({ animalId, competitionId: comp.id, playerAccountId })
                                }}
                              />
                              <EntryTable comp={comp} />
                            </CompTable>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
          </div>{/* /competition content */}
        </div>{/* /unified card */}
      </div>
    </div>
  )
}
