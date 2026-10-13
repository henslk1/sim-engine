import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { DEFAULT_FILTERS, readStablePreferences, type StableFilters, type StablePreferences } from "@sim-engine/trpc/stable-preferences"
import { useEffect, useRef, useState } from "react"
import {
  Plus, Pencil, Trash2, Check, X,
  AlertTriangle, MoveRight, FolderOpen,
  Baby, Search, SlidersHorizontal, Pin, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DisciplineBadge } from "@/components/discipline-badge"
import { useTutorialAccess } from "@/lib/tutorial/access"

export const Route = createFileRoute("/_authenticated/stable")({
  component: StablePage,
})

type Animal = {
  id: string
  name: string
  status: string
  sex: string
  image: string | null
  isPinned: boolean
  breed: { id: string; name: string } | null
  breedName: string | null
  lifeStage: { name: string; stageIndex: number }
  subContainerId: string | null
  ageInCycles: number
  isCastrated: boolean
  pregnancies: { id: string }[]
  _count: { healthRecords: number }
  healthCertificates: { certDefId: string; isValid: boolean; expiresAtCycle: number }[]
  disciplineDef: { name: string; isConformation: boolean } | null
  compTiers: { disciplineDefId: string; tierDefId: string }[]
  conformationScores: { breedId: string }[]
  equipment: { itemDef: { id: string } }[]
}

type SubContainer = { id: string; name: string }
type Selection = "all" | "unassigned" | "archived" | string
type SortBy = "name" | "oldest" | "youngest" | "alerts" | "care"

/**
 * An animal the player has started on today and not finished.
 *
 * `carePending` is the signal, and it is narrower than "care is incomplete":
 * the animal has been interacted with this cycle, so the nightly is going to
 * age it tonight, and its care is short of what would have stopped its
 * condition decaying. An animal nobody has touched is not pending anything and
 * says nothing on the card.
 */
type PendingCare = {
  animalId: string
  careDone: number
  careRequired: number
  careComplete: boolean
  interacted: boolean
  carePending: boolean
  ltcDue: number
  ltcOverdue: number
  ltcName: string | null
}

function AnimalCard({
  animal,
  care,
  subContainers,
  cycleToAge,
  conformationName,
  tutorialAttr,
}: {
  animal: Animal
  care?: PendingCare
  subContainers: SubContainer[]
  cycleToAge: (n: number) => string
  conformationName: string
  tutorialAttr?: string
}) {
  const [showMove, setShowMove] = useState(false)
  const utils = trpc.useUtils()

  const moveAnimal = trpc.animal.moveToSubContainer.useMutation({
    onSuccess: () => { utils.animal.list.invalidate(); setShowMove(false) },
  })

  const isDeceased = animal.status === "DECEASED"
  const hasAlert = animal._count.healthRecords > 0
  const isPregnant = animal.pregnancies.length > 0
  const isInspected = animal.conformationScores.length > 0

  // Only for the living, and only once the query has answered — an animal that
  // simply has no row yet must not be drawn as neglected.
  const careOwed = !isDeceased && care ? care.carePending : false
  const ltcOwed = !isDeceased && care ? care.ltcDue > 0 : false

  const hasChips = hasAlert || isPregnant || !!animal.disciplineDef || isInspected || careOwed || ltcOwed

  return (
    <div
      {...(tutorialAttr ? { "data-tutorial": tutorialAttr } : {})}
      className={cn(
      "group relative overflow-visible rounded-xl border transition-all",
      isDeceased
        ? "border-destructive/50 bg-destructive/15 hover:bg-destructive/20"
        : animal.isPinned
        ? "border-amber-500/40 bg-card ring-1 ring-amber-500/30 hover:shadow-sm"
        : hasAlert
        ? "border-border bg-card border-l-2 border-l-destructive/50 hover:shadow-sm"
        : isPregnant
        ? "border-border bg-card border-l-2 border-l-chart-2/40 hover:shadow-sm"
        : "border-border bg-card hover:shadow-sm hover:border-border/70",
    )}>
      <Link to="/animal/$animalId" params={{ animalId: animal.id }} className="block">
        <div className={cn(
          "relative h-28 overflow-hidden rounded-t-xl",
          isDeceased ? "bg-destructive/25" : "bg-secondary/30",
        )}>
          {animal.image ? (
            <img
              src={animal.image}
              alt={animal.name}
              className={cn("h-full w-full object-cover", isDeceased && "grayscale opacity-50")}
            />
          ) : (
            <div className="absolute inset-0 flex items-end justify-end p-2 opacity-[0.07]">
              <svg viewBox="0 0 80 80" className="h-16 w-16 fill-foreground" xmlns="http://www.w3.org/2000/svg">
                <path d="M72 28c0-4-2-7-5-9l-3-8c-1-2-3-3-5-2l-8 3c-2-4-6-6-11-6s-9 2-11 6l-8-3c-2-1-4 0-5 2l-3 8c-3 2-5 5-5 9v8c0 3 2 6 5 7v9c0 2 2 4 4 4h4c2 0 4-2 4-4v-4h30v4c0 2 2 4 4 4h4c2 0 4-2 4-4v-9c3-1 5-4 5-7v-8zm-32-14c3 0 6 1 8 3l-16 0c2-2 5-3 8-3zm-22 10h44c2 0 4 2 4 4v4H14v-4c0-2 2-4 4-4zm-4 16v-4h52v4c0 2-2 4-4 4H18c-2 0-4-2-4-4zm8 16H20v-8h4v8zm36 0h-4v-8h4v8z"/>
              </svg>
            </div>
          )}
          {isDeceased && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
              <span className="rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-destructive-foreground shadow">
                Deceased
              </span>
            </div>
          )}
          {animal.isPinned && !isDeceased && (
            <div className="absolute left-2 top-2 z-10">
              <Pin className="size-3.5 text-amber-500 drop-shadow-sm" />
            </div>
          )}
        </div>
        <div className="p-4 pb-3">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <p className={cn("font-serif font-semibold leading-tight", isDeceased ? "text-destructive/80" : "text-foreground")}>{animal.name}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {!isDeceased && hasAlert && <AlertTriangle className="size-3.5 text-destructive/80" />}
            {!isDeceased && isPregnant && <Baby className="size-3.5 text-chart-2/70" />}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{animal.breed?.name ?? animal.breedName}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
          {animal.lifeStage.name} · {animal.sex === "MALE" ? "Male" : "Female"}
          {animal.isCastrated ? " · Castrated" : ""} · {cycleToAge(animal.ageInCycles)}
        </p>

        {hasChips && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {hasAlert && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive/80">
                {animal._count.healthRecords} condition{animal._count.healthRecords !== 1 ? "s" : ""}
              </span>
            )}
            {careOwed && care && (
              <span
                title={`You have worked with this animal today but only completed ${care.careDone} of ${care.careRequired} care actions — its condition will decay tonight`}
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
              >
                Care {care.careDone}/{care.careRequired}
              </span>
            )}
            {ltcOwed && care && (
              <span
                title={care.ltcName ?? undefined}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  care.ltcOverdue > 0
                    ? "bg-destructive/10 text-destructive/80"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {care.ltcOverdue > 0 ? "Care overdue" : "Care due"}
              </span>
            )}
            {isPregnant && (
              <span className="rounded bg-chart-2/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-2/70">Pregnant</span>
            )}
            {animal.disciplineDef && !animal.disciplineDef.isConformation && (
              <DisciplineBadge
                name={animal.disciplineDef.name}
                isConformation={false}
              />
            )}
            {isInspected && (
              <DisciplineBadge name={conformationName} isConformation inspected />
            )}
          </div>
        )}
        </div>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMove(!showMove) }}
          className="absolute bottom-2.5 right-2.5 rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-secondary/60 hover:text-foreground group-hover:opacity-100"
        >
          <MoveRight className="size-3.5" />
        </button>
        {showMove && (
          <div className="absolute bottom-9 right-0 z-10 min-w-[150px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <p className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Move to…
            </p>
            <button
              type="button"
              onClick={() => moveAnimal.mutate({ animalId: animal.id, subContainerId: null })}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60"
            >
              <FolderOpen className="size-3 text-muted-foreground" /> Unassigned
            </button>
            {subContainers.map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => moveAnimal.mutate({ animalId: animal.id, subContainerId: sc.id })}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60"
              >
                <FolderOpen className="size-3 text-muted-foreground" /> {sc.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab pill ──────────────────────────────────────────────────────────────────

function Tab({
  label,
  count,
  active,
  dim,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  dim?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
        active
          ? "bg-secondary/80 font-medium text-foreground"
          : dim
          ? "text-muted-foreground/50 hover:bg-secondary/30 hover:text-muted-foreground"
          : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("font-mono text-xs", active ? "text-foreground" : "text-muted-foreground/40")}>
        {count}
      </span>
    </button>
  )
}

// ─── Subcontainer tab ──────────────────────────────────────────────────────────

function SubContainerTab({
  sc,
  count,
  active,
  onClick,
}: {
  sc: SubContainer
  count: number
  active: boolean
  onClick: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(sc.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const utils = trpc.useUtils()

  const update = trpc.animal.updateSubContainer.useMutation({
    onSuccess: () => { utils.player.listSubContainers.invalidate(); setEditing(false) },
  })
  const remove = trpc.animal.deleteSubContainer.useMutation({
    onSuccess: () => { utils.player.listSubContainers.invalidate(); utils.animal.list.invalidate() },
  })

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") update.mutate({ id: sc.id, name })
            if (e.key === "Escape") { setEditing(false); setName(sc.name) }
          }}
          className="h-7 w-32 rounded border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="button" onClick={() => update.mutate({ id: sc.id, name })} className="text-chart-2 hover:opacity-80">
          <Check className="size-3.5" />
        </button>
        <button type="button" onClick={() => { setEditing(false); setName(sc.name) }} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="group/tab flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
          active
            ? "bg-secondary/80 font-medium text-foreground"
            : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
        )}
      >
        {sc.name}
        <span className={cn("font-mono text-xs", active ? "text-foreground" : "text-muted-foreground/40")}>
          {count}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/tab:opacity-100">
        {confirmDelete ? (
          <>
            <button type="button" onClick={() => remove.mutate({ id: sc.id })} className="text-[11px] text-destructive underline hover:opacity-80">Del</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-[11px] text-muted-foreground underline hover:opacity-80">No</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} className="rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground">
              <Pencil className="size-3" />
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive/70">
              <Trash2 className="size-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Create group tab ──────────────────────────────────────────────────────────

function CreateSubContainerTab({
  playerAccountId,
  label,
}: {
  playerAccountId: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const utils = trpc.useUtils()

  const create = trpc.animal.createSubContainer.useMutation({
    onSuccess: () => { utils.player.listSubContainers.invalidate(); setOpen(false); setName("") },
  })

  if (open) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input
          autoFocus
          placeholder={`${label} name…`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) create.mutate({ playerAccountId, name: name.trim() })
            if (e.key === "Escape") { setOpen(false); setName("") }
          }}
          className="h-7 w-36 rounded border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate({ playerAccountId, name: name.trim() })}
          className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? "…" : "Create"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setName("") }} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Plus className="size-3" /> {label}
    </button>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function StablePage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data: gameData, isLoading: gameLoading } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const stableLabel = gameData?.gameConfig?.containerLabel ?? "My Stable"
  const subContainerLabel = gameData?.gameConfig?.subContainerLabel ?? "Group"

  const { data: me, isLoading: meLoading } = trpc.player.me.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  useEffect(() => {
    if (!meLoading && gameId && me === null) navigate({ to: "/setup" })
  }, [me, meLoading, gameId, navigate])

  const playerAccountId = me?.id

  const { data: subContainers = [] } = trpc.player.listSubContainers.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )
  function conformationNameFor(animal: Animal): string {
    const eligible = disciplines?.filter(d => d.isConformation
      && (d.minLifeStageIndex == null || animal.lifeStage.stageIndex >= d.minLifeStageIndex)
      && (d.maxLifeStageIndex == null || animal.lifeStage.stageIndex <= d.maxLifeStageIndex)) ?? []
    const competing = eligible.filter(d => animal.compTiers.some(t => t.disciplineDefId === d.id))
    // Prefer the horse's current discipline; an inspection alone doesn't assign one.
    const matches = competing.length > 0 ? competing : eligible
    return matches.length === 1 ? matches[0]!.name : "Conformation"
  }

  const { data: animals = [], isLoading: animalsLoading } = trpc.animal.list.useQuery(
    { playerAccountId: playerAccountId!, includeTutorial: true },
    { enabled: !!playerAccountId },
  )

  // What is still owed tonight. Four queries for the whole stable, so it is
  // cheap enough to ask on every visit rather than being hidden behind a
  // toggle.
  const { data: pendingCare } = trpc.care.pending.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const careByAnimal = new Map((pendingCare?.animals ?? []).map((row) => [row.animalId, row]))

  const { data: tutorialPair } = trpc.tutorial.pairIds.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )
  const tutorialMareId = tutorialPair?.ancestorOneId
  const tutorialAccess = useTutorialAccess()
  const showReturnMareBtn = tutorialAccess.restricted && tutorialAccess.step === 163
  const { data: tutorialFoalInfo } = trpc.tutorial.foalAnimal.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )
  const tutorialFoalId = tutorialFoalInfo?.id ?? null
  const returnMare = trpc.tutorial.returnMare.useMutation({
    onSuccess: () => {
      window.dispatchEvent(new Event("tutorial:mareReturned"))
      utils.animal.list.invalidate()
      // The return agreement pays out — without this the header still shows the
      // old balance until something else happens to refetch it.
      utils.player.balances.invalidate()
    },
  })
  const [selected, setSelected] = useState<Selection>("all")
  const [nameFilter, setNameFilter] = useState("")
  const [preferenceDrafts, setPreferenceDrafts] = useState<Record<string, StablePreferences>>({})
  const draftsRef = useRef(preferenceDrafts)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const savePreferences = trpc.player.saveSubContainerPreferences.useMutation()
  const selectedPaddock = subContainers.find(sc => sc.id === selected)
  const preferenceKey = `${playerAccountId}:${selected}`
  const preferences = preferenceDrafts[preferenceKey] ?? readStablePreferences(selectedPaddock)
  const sortBy = preferences.sortDefault
  const filters = preferences.filterConfig

  function persistPreferences(value: StablePreferences) {
    if (!selectedPaddock || !playerAccountId) return
    const id = selectedPaddock.id
    const accountId = playerAccountId
    const key = preferenceKey
    // Serialize writes so a slower earlier request cannot overwrite a later choice.
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await savePreferences.mutateAsync({ id, ...value })
        utils.player.listSubContainers.setData({ playerAccountId: accountId }, previous =>
          previous?.map(sc => sc.id === id ? { ...sc, ...value } : sc))
        setSaveErrors(previous => { const next = { ...previous }; delete next[key]; return next })
      } catch (error) {
        setSaveErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : "Could not save preferences" }))
      }
    })
  }

  function updatePreferences(patch: Partial<StablePreferences>) {
    const next = { ...(draftsRef.current[preferenceKey] ?? preferences), ...patch }
    draftsRef.current = { ...draftsRef.current, [preferenceKey]: next }
    setPreferenceDrafts(draftsRef.current)
    persistPreferences(next)
  }
  function setSortBy(sort: SortBy) { updatePreferences({ sortDefault: sort }) }
  function setFilters(value: StableFilters | ((current: StableFilters) => StableFilters)) {
    const current = draftsRef.current[preferenceKey]?.filterConfig ?? filters
    updatePreferences({ filterConfig: typeof value === "function" ? value(current) : value })
  }
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [filterOpen])

  const activeFilterCount = (filters.sex ? 1 : 0)
    + (filters.hasAlerts ? 1 : 0)
    + (filters.pregnant ? 1 : 0)
    + (filters.inspected ? 1 : 0)
    + (filters.hasDiscipline ? 1 : 0)
    + (filters.careDue ? 1 : 0)

  const archivedAnimals = animals.filter((a) => a.status === "ARCHIVED") as Animal[]
  const mainAnimals = animals.filter((a) => a.status !== "ARCHIVED") as Animal[]
  const liveAnimals = mainAnimals.filter((a) => a.status === "ALIVE")
  const deceasedAnimals = mainAnimals.filter((a) => a.status === "DECEASED")
  const unassigned = mainAnimals.filter(
    (a) => a.subContainerId === null || !subContainers.some((sc) => sc.id === a.subContainerId),
  )

  const alertCount = liveAnimals.filter((a) => a._count.healthRecords > 0).length
  const pregnantCount = liveAnimals.filter((a) => a.pregnancies.length > 0).length

  const cycleToAge = (n: number): string => {
    const cpy = gameData?.gameConfig?.cyclesPerYear ?? 12
    return `${Math.floor(n / cpy)}y ${n % cpy}m`
  }

  const selectedAnimals: Animal[] =
    selected === "all" ? mainAnimals
    : selected === "unassigned" ? unassigned
    : selected === "archived" ? archivedAnimals
    : mainAnimals.filter((a) => a.subContainerId === selected)

  const selectedAlerts = selectedAnimals.filter((a) => a.status === "ALIVE" && a._count.healthRecords > 0).length

  let displayAnimals = selected === "archived" ? selectedAnimals.filter((a) =>
    !nameFilter.trim() || a.name.toLowerCase().includes(nameFilter.toLowerCase())
  ) : selectedAnimals.filter((a) => {
    if (nameFilter.trim() && !a.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
    if (a.status === "DECEASED") return true // deceased always shown regardless of other filters
    if (filters.sex && a.sex !== filters.sex) return false
    if (filters.hasAlerts && a._count.healthRecords === 0) return false
    if (filters.pregnant && a.pregnancies.length === 0) return false
    if (filters.inspected && a.conformationScores.length === 0) return false
    if (filters.hasDiscipline && !a.disciplineDef) return false
    if (filters.careDue) {
      const care = careByAnimal.get(a.id)
      if (!care || (!care.carePending && care.ltcDue === 0)) return false
    }
    return true
  })

  displayAnimals = selected === "archived" ? displayAnimals : [...displayAnimals].sort((a, b) => {
    const rank = (x: Animal) => x.status === "DECEASED" ? 0 : x.isPinned ? 1 : 2
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    if (sortBy === "oldest") return b.ageInCycles - a.ageInCycles
    if (sortBy === "youngest") return a.ageInCycles - b.ageInCycles
    if (sortBy === "alerts") return b._count.healthRecords - a._count.healthRecords
    if (sortBy === "care") {
      // Overdue long-term care first, then anything with care still owed.
      const weight = (x: Animal) => {
        const care = careByAnimal.get(x.id)
        if (!care) return 0
        return (care.ltcOverdue > 0 ? 4 : 0) + (care.ltcDue > 0 ? 2 : 0) + (care.carePending ? 1 : 0)
      }
      const d = weight(b) - weight(a)
      if (d !== 0) return d
    }
    return a.name.localeCompare(b.name)
  })

  if (gameLoading || (gameId && meLoading)) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div data-tutorial="stable-content" className="flex h-full flex-col overflow-hidden">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-secondary/70 to-card px-8 py-5">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">{stableLabel}</h1>
          <div className="mt-0.5 flex items-center gap-3">
            <span data-tutorial="stable-horse-count" className="text-sm text-muted-foreground">{liveAnimals.length} alive</span>
            {deceasedAnimals.length > 0 && (
              <span className="text-sm font-medium text-destructive">
                {deceasedAnimals.length} deceased — needs attention
              </span>
            )}
            {alertCount > 0 && (
              <span className="text-sm text-destructive/70">{alertCount} alert{alertCount !== 1 ? "s" : ""}</span>
            )}
            {pregnantCount > 0 && (
              <span className="text-sm text-chart-2/70">{pregnantCount} pregnant</span>
            )}
            {pendingCare && pendingCare.totals.carePending > 0 && (
              <span
                title="Worked with today, but their care is not finished"
                className="text-sm text-amber-600 dark:text-amber-400"
              >
                {pendingCare.totals.carePending} awaiting care
              </span>
            )}
            {selectedAlerts > 0 && selected !== "all" && (
              <span className="text-sm text-muted-foreground/50">
                · {selectedAlerts} in this group need attention
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Search animals…"
              className="h-9 w-52 rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Filter dropdown */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
                activeFilterCount > 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="text-[11px] text-muted-foreground underline hover:text-foreground"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-4 p-3">
                  {/* Sex */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sex</p>
                    <div className="flex gap-1.5">
                      {(["", "MALE", "FEMALE"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFilters((f) => ({ ...f, sex: v }))}
                          className={cn(
                            "flex-1 rounded-md border px-2 py-1 text-xs transition-colors",
                            filters.sex === v
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-secondary/40",
                          )}
                        >
                          {v === "" ? "All" : v === "MALE" ? "Male" : "Female"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                    <div className="space-y-1.5">
                      {([
                        { key: "hasAlerts", label: "Has conditions" },
                        { key: "pregnant", label: "Pregnant" },
                        { key: "inspected", label: "Conformation inspected" },
                        { key: "hasDiscipline", label: "Has discipline" },
                        { key: "careDue", label: "Started, care unfinished" },
                      ] as const).map(({ key, label }) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary/30">
                          <input
                            type="checkbox"
                            checked={filters[key]}
                            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                            className="size-3.5 rounded accent-primary"
                          />
                          <span className="text-xs text-foreground">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selected !== "inactive" && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="name">Name A→Z</option>
              <option value="oldest">Oldest First</option>
              <option value="youngest">Youngest First</option>
              <option value="alerts">Alerts First</option>
              <option value="care">Unfinished Care First</option>
            </select>
          )}
          {selectedPaddock && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => updatePreferences(readStablePreferences())}>
              Reset view
            </button>
          )}
          {saveErrors[preferenceKey] && (
            <span role="alert" className="text-xs text-destructive">
              View preferences were not saved. {saveErrors[preferenceKey]}{" "}
              <button type="button" className="underline" onClick={() => persistPreferences(preferences)}>Retry</button>
            </span>
          )}
        </div>
      </div>

      {/* ── Group tabs ───────────────────────────────────────────────────── */}
      <div data-tutorial="stable-paddocks" className="flex items-center border-b border-border bg-card/30 px-5 py-2">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          <Tab
            label="All"
            count={mainAnimals.length}
            active={selected === "all"}
            onClick={() => setSelected("all")}
          />
          {(unassigned.length > 0 || subContainers.length > 0) && (
            <Tab
              label="Unassigned"
              count={unassigned.length}
              active={selected === "unassigned"}
              onClick={() => setSelected("unassigned")}
            />
          )}

          {subContainers.length > 0 && (
            <div className="mx-1.5 h-5 w-px shrink-0 bg-border/60" />
          )}

          {subContainers.map((sc) => (
            <SubContainerTab
              key={sc.id}
              sc={sc}
              count={liveAnimals.filter((a) => a.subContainerId === sc.id).length}
              active={selected === sc.id}
              onClick={() => setSelected(sc.id)}
            />
          ))}

          {playerAccountId && (
            <CreateSubContainerTab playerAccountId={playerAccountId} label={subContainerLabel} />
          )}
        </div>

        {archivedAnimals.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(selected === "archived" ? "all" : "archived")}
            className={cn(
              "ml-3 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              selected === "archived"
                ? "bg-primary text-primary-foreground"
                : "bg-primary/15 text-primary hover:bg-primary/25",
            )}
          >
            Archived
            <span className="font-mono">{archivedAnimals.length}</span>
          </button>
        )}
      </div>

      {/* ── Tutorial: Return Mare ─────────────────────────────────────────── */}
      {showReturnMareBtn && gameId && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-3">
          <p className="text-sm text-foreground">Your mare's time with your stable is complete. Return her to her breeder and receive 300G from the return agreement.</p>
          <button
            type="button"
            data-tutorial="tutorial-return-mare-btn"
            disabled={returnMare.isPending}
            onClick={() => returnMare.mutate({ gameId })}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {returnMare.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Return Mare · +300G
          </button>
        </div>
      )}

      {/* ── Animals grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {animalsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : displayAnimals.length > 0 ? (
          selected === "archived" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayAnimals.map((a) => (
                <Link
                  key={a.id}
                  to="/animal/$animalId"
                  params={{ animalId: a.id }}
                  className="rounded-xl border border-border/40 bg-card/40 p-4 transition-colors hover:bg-secondary/20"
                >
                  <p className="font-serif font-semibold leading-tight text-foreground/50">{a.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">{a.breed?.name ?? a.breedName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/40">{a.lifeStage.name} · {cycleToAge(a.ageInCycles)}</p>
                </Link>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {displayAnimals.map((a) => (
              <AnimalCard
                key={a.id}
                animal={a}
                care={careByAnimal.get(a.id)}
                subContainers={subContainers}
                cycleToAge={cycleToAge}
                conformationName={conformationNameFor(a)}
                tutorialAttr={a.id === tutorialMareId ? "tutorial-mare-stable-card" : a.id === tutorialFoalId ? "tutorial-foal-stable-card" : undefined}
              />
            ))}
          </div>
          )
        ) : nameFilter.trim() ? (
          <div className="flex h-40 items-center justify-center text-sm italic text-muted-foreground/50">
            No animals match "{nameFilter}"
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm italic text-muted-foreground/50">
            No animals in this group
          </div>
        )}
      </div>

    </div>
  )
}
