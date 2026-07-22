import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useEffect, useRef, useState } from "react"
import {
  Plus, Pencil, Trash2, Check, X,
  AlertTriangle, MoveRight, FolderOpen,
  Baby, Search, SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DisciplineBadge } from "@/components/discipline-badge"

export const Route = createFileRoute("/_authenticated/stable")({
  component: StablePage,
})

type Animal = {
  id: string
  name: string
  status: string
  sex: string
  image: string | null
  breed: { id: string; name: string }
  lifeStage: { name: string }
  subContainerId: string | null
  ageInCycles: number
  isCastrated: boolean
  pregnancies: { id: string }[]
  _count: { healthRecords: number }
  healthCertificates: { certDefId: string; isValid: boolean; expiresAtCycle: number }[]
  disciplineDef: { name: string; isConformation: boolean } | null
  conformationScores: { breedId: string }[]
  equipment: { itemDef: { id: string } }[]
}

type SubContainer = { id: string; name: string }
type Selection = "all" | "unassigned" | "inactive" | string
type SortBy = "name" | "oldest" | "youngest" | "alerts"

type StableFilters = {
  sex: "MALE" | "FEMALE" | ""
  hasAlerts: boolean
  pregnant: boolean
  inspected: boolean
  hasDiscipline: boolean
}

const DEFAULT_FILTERS: StableFilters = {
  sex: "",
  hasAlerts: false,
  pregnant: false,
  inspected: false,
  hasDiscipline: false,
}

// ─── Animal card ───────────────────────────────────────────────────────────────

function AnimalCard({
  animal,
  subContainers,
  cycleToAge,
  conformationName,
}: {
  animal: Animal
  subContainers: SubContainer[]
  cycleToAge: (n: number) => string
  conformationName: string
}) {
  const [showMove, setShowMove] = useState(false)
  const utils = trpc.useUtils()

  const moveAnimal = trpc.animal.moveToSubContainer.useMutation({
    onSuccess: () => { utils.animal.list.invalidate(); setShowMove(false) },
  })

  const hasAlert = animal._count.healthRecords > 0
  const isPregnant = animal.pregnancies.length > 0
  const isInspected = animal.conformationScores.length > 0
  const hasChips = hasAlert || isPregnant || !!animal.disciplineDef || isInspected

  return (
    <div className={cn(
      "group relative overflow-visible rounded-xl border border-border bg-card transition-all hover:shadow-sm",
      hasAlert
        ? "border-l-2 border-l-destructive/50"
        : isPregnant
        ? "border-l-2 border-l-chart-2/40"
        : "hover:border-border/70",
    )}>
      <Link to="/animal/$animalId" params={{ animalId: animal.id }} className="block">
        <div className="relative h-28 overflow-hidden rounded-t-xl bg-secondary/30">
          {animal.image ? (
            <img src={animal.image} alt={animal.name} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-end justify-end p-2 opacity-[0.07]">
              <svg viewBox="0 0 80 80" className="h-16 w-16 fill-foreground" xmlns="http://www.w3.org/2000/svg">
                <path d="M72 28c0-4-2-7-5-9l-3-8c-1-2-3-3-5-2l-8 3c-2-4-6-6-11-6s-9 2-11 6l-8-3c-2-1-4 0-5 2l-3 8c-3 2-5 5-5 9v8c0 3 2 6 5 7v9c0 2 2 4 4 4h4c2 0 4-2 4-4v-4h30v4c0 2 2 4 4 4h4c2 0 4-2 4-4v-9c3-1 5-4 5-7v-8zm-32-14c3 0 6 1 8 3l-16 0c2-2 5-3 8-3zm-22 10h44c2 0 4 2 4 4v4H14v-4c0-2 2-4 4-4zm-4 16v-4h52v4c0 2-2 4-4 4H18c-2 0-4-2-4-4zm8 16H20v-8h4v8zm36 0h-4v-8h4v8z"/>
              </svg>
            </div>
          )}
        </div>
        <div className="p-4 pb-3">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <p className="font-serif font-semibold leading-tight text-foreground">{animal.name}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasAlert && <AlertTriangle className="size-3.5 text-destructive/80" />}
            {isPregnant && <Baby className="size-3.5 text-chart-2/70" />}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{animal.breed.name}</p>
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
            {isPregnant && (
              <span className="rounded bg-chart-2/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-2/70">Pregnant</span>
            )}
            {animal.disciplineDef && (
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
  const conformationName = disciplines?.find((d) => d.isConformation)?.name ?? "Conformation"

  const { data: animals = [], isLoading: animalsLoading } = trpc.animal.list.useQuery()
  const [selected, setSelected] = useState<Selection>("all")
  const [nameFilter, setNameFilter] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("name")
  const [filters, setFilters] = useState<StableFilters>(DEFAULT_FILTERS)
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

  const alive = animals.filter((a) => a.status === "ALIVE") as Animal[]
  const inactive = animals.filter((a) => a.status !== "ALIVE") as Animal[]
  const unassigned = alive.filter(
    (a) => a.subContainerId === null || !subContainers.some((sc) => sc.id === a.subContainerId),
  )

  const alertCount = alive.filter((a) => a._count.healthRecords > 0).length
  const pregnantCount = alive.filter((a) => a.pregnancies.length > 0).length

  const cycleToAge = (n: number): string => {
    const cpy = gameData?.gameConfig?.cyclesPerYear ?? 12
    return `${Math.floor(n / cpy)}y ${n % cpy}m`
  }

  const selectedAnimals: Animal[] =
    selected === "all" ? alive
    : selected === "unassigned" ? unassigned
    : selected === "inactive" ? inactive
    : alive.filter((a) => a.subContainerId === selected)

  const selectedAlerts = selected === "inactive" ? 0 : selectedAnimals.filter((a) => a._count.healthRecords > 0).length

  let displayAnimals = selectedAnimals.filter((a) => {
    if (nameFilter.trim() && !a.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
    if (filters.sex && a.sex !== filters.sex) return false
    if (filters.hasAlerts && a._count.healthRecords === 0) return false
    if (filters.pregnant && a.pregnancies.length === 0) return false
    if (filters.inspected && a.conformationScores.length === 0) return false
    if (filters.hasDiscipline && !a.disciplineDef) return false
    return true
  })

  if (selected !== "inactive") {
    if (sortBy === "oldest") {
      displayAnimals = [...displayAnimals].sort((a, b) => b.ageInCycles - a.ageInCycles)
    } else if (sortBy === "youngest") {
      displayAnimals = [...displayAnimals].sort((a, b) => a.ageInCycles - b.ageInCycles)
    } else if (sortBy === "alerts") {
      displayAnimals = [...displayAnimals].sort((a, b) => b._count.healthRecords - a._count.healthRecords)
    }
  }

  if (gameLoading || (gameId && meLoading)) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-secondary/70 to-card px-8 py-5">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">{stableLabel}</h1>
          <div className="mt-0.5 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{alive.length} active</span>
            {alertCount > 0 && (
              <span className="text-sm text-destructive/70">{alertCount} alert{alertCount !== 1 ? "s" : ""}</span>
            )}
            {pregnantCount > 0 && (
              <span className="text-sm text-chart-2/70">{pregnantCount} pregnant</span>
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
            </select>
          )}
        </div>
      </div>

      {/* ── Group tabs ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/30 px-5 py-2">
        <Tab
          label="All"
          count={alive.length}
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
            count={alive.filter((a) => a.subContainerId === sc.id).length}
            active={selected === sc.id}
            onClick={() => setSelected(sc.id)}
          />
        ))}

        {playerAccountId && (
          <CreateSubContainerTab playerAccountId={playerAccountId} label={subContainerLabel} />
        )}

        {inactive.length > 0 && (
          <>
            <div className="mx-1.5 h-5 w-px shrink-0 bg-border/60" />
            <Tab
              label="Inactive"
              count={inactive.length}
              active={selected === "inactive"}
              dim
              onClick={() => setSelected(selected === "inactive" ? "all" : "inactive")}
            />
          </>
        )}
      </div>

      {/* ── Animals grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {animalsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : displayAnimals.length > 0 ? (
          selected === "inactive" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayAnimals.map((a) => (
                <Link
                  key={a.id}
                  to="/animal/$animalId"
                  params={{ animalId: a.id }}
                  className="rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-secondary/20"
                >
                  <p className="font-serif font-semibold leading-tight text-foreground/60">{a.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">{a.breed.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/40">
                    {a.status === "DECEASED" ? "Deceased" : a.status === "ARCHIVED" ? "Archived" : "Buried"}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayAnimals.map((a) => (
                <AnimalCard key={a.id} animal={a} subContainers={subContainers} cycleToAge={cycleToAge} conformationName={conformationName} />
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
