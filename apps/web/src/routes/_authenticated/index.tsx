import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useEffect } from "react"
import { Settings, Skull, Archive, BookMarked } from "lucide-react"

export const Route = createFileRoute("/_authenticated/")({
  component: LandingPage,
})

const STATUS_META: Record<string, { label: string; color: string }> = {
  ALIVE:    { label: "Alive",    color: "text-chart-2" },
  DECEASED: { label: "Deceased", color: "text-destructive" },
  ARCHIVED: { label: "Archived", color: "text-amber-500" },
  BURIED:   { label: "Buried",   color: "text-muted-foreground" },
}

function LandingPage() {
  const navigate = useNavigate()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me, isLoading: meLoading } = trpc.player.me.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  useEffect(() => {
    if (!meLoading && gameId && me === null) {
      navigate({ to: "/setup" })
    }
  }, [me, meLoading, gameId, navigate])

  const { data: animals, isLoading } = trpc.animal.list.useQuery()

  const alive    = animals?.filter((a) => a.status === "ALIVE") ?? []
  const deceased = animals?.filter((a) => a.status === "DECEASED") ?? []
  const archived = animals?.filter((a) => a.status === "ARCHIVED") ?? []
  const buried   = animals?.filter((a) => a.status === "BURIED") ?? []

  if (!gameId || meLoading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">

      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-semibold text-foreground">Sim Engine</h1>
        <p className="mt-1 text-sm text-muted-foreground">Development dashboard</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          to="/admin"
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary/60"
        >
          <Settings className="size-5 shrink-0 text-muted-foreground" />
          Admin Panel
        </Link>
      </div>

      {/* Animals */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading animals…</p>
      ) : (
        <div className="space-y-6">
          <AnimalSection title="Active" animals={alive} />
          <AnimalSection title="Deceased" animals={deceased} icon={<Skull className="size-4 text-destructive/60" />} />
          <AnimalSection title="Archived" animals={archived} icon={<Archive className="size-4 text-amber-500/70" />} />
          <AnimalSection title="Buried" animals={buried} icon={<BookMarked className="size-4 text-muted-foreground/60" />} />
        </div>
      )}
    </div>
  )
}

type AnimalItem = { id: string; name: string; status: string; sex: string; breed: { name: string }; lifeStage: { name: string } }

function AnimalSection({ title, animals, icon }: { title: string; animals: AnimalItem[]; icon?: React.ReactNode }) {
  if (animals.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">({animals.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {animals.map((a) => (
          <Link
            key={a.id}
            to="/animal/$animalId"
            params={{ animalId: a.id }}
            className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-secondary/60"
          >
            <p className="font-serif font-semibold text-foreground">{a.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {a.breed.name} · {a.lifeStage.name} · {a.sex === "MALE" ? "M" : "F"}
            </p>
            <p className={`mt-1 text-[11px] font-medium ${STATUS_META[a.status]?.color ?? ""}`}>
              {STATUS_META[a.status]?.label ?? a.status}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
