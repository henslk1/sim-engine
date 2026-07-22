import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { ChevronLeft, Mountain, Waves, Wind, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/venues")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
    disciplineDefId: (search.disciplineDefId as string) || undefined,
    isConformation: search.isConformation === true || search.isConformation === "true" || undefined,
    from: (search.from as string) || undefined,
  }),
  component: VenuesPage,
})

// ─── Lookup tables (full literal strings so Tailwind picks them up) ─────────────

const CARD_HERO: Record<string, string> = {
  HOT:       "bg-gradient-to-br from-chart-1/35 via-chart-1/10 to-transparent",
  WARM:      "bg-gradient-to-br from-chart-3/35 via-chart-3/10 to-transparent",
  COLD:      "bg-gradient-to-br from-chart-4/35 via-chart-4/10 to-transparent",
  TEMPERATE: "bg-gradient-to-br from-chart-2/35 via-chart-2/10 to-transparent",
}

const CLIMATE_BADGE: Record<string, string> = {
  HOT:       "bg-chart-1/12 text-chart-1",
  WARM:      "bg-chart-3/12 text-chart-3",
  COLD:      "bg-chart-4/12 text-chart-4",
  TEMPERATE: "bg-chart-2/12 text-chart-2",
}

const CLIMATE_ICON_CLS: Record<string, string> = {
  HOT:       "text-chart-1/60",
  WARM:      "text-chart-3/60",
  COLD:      "text-chart-4/60",
  TEMPERATE: "text-chart-2/60",
}

const CONDITIONS: Record<string, Record<string, string>> = {
  HOT:       { FLAT: "Hot & Hard Ground", COASTAL: "Hot & Coastal Shore", HILLY: "Hot & Rolling Hills", MOUNTAIN: "Hot & Rocky Peaks" },
  WARM:      { FLAT: "Warm & Soft Turf",  COASTAL: "Warm & Sea Breeze",   HILLY: "Warm & Gentle Hills", MOUNTAIN: "Warm & Steep Slopes" },
  COLD:      { FLAT: "Cold & Frozen Ground", COASTAL: "Cold & Icy Shoreline", HILLY: "Cold & Rugged Hills", MOUNTAIN: "Cold & Thin Air" },
  TEMPERATE: { FLAT: "Temperate & Soft Turf", COASTAL: "Temperate & Open Coast", HILLY: "Temperate & Rolling Fields", MOUNTAIN: "Temperate & High Ground" },
}

function TerrainIcon({ terrain, size = 80 }: { terrain: string | null; size?: number }) {
  if (terrain === "COASTAL") return <Waves size={size} strokeWidth={0.8} />
  if (terrain === "MOUNTAIN" || terrain === "HILLY") return <Mountain size={size} strokeWidth={0.8} />
  return <Wind size={size} strokeWidth={0.8} />
}

// ─── Page ───────────────────────────────────────────────────────────────────────

function VenuesPage() {
  const { animalId, disciplineDefId, isConformation, from } = Route.useSearch()

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: venues, isLoading: venuesLoading } = trpc.competition.listVenues.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  const { data: competitions } = trpc.competition.listOpen.useQuery(
    {
      gameId: gameId!,
      disciplineDefId: isConformation ? undefined : disciplineDefId,
      isConformation: isConformation ?? undefined,
    },
    { enabled: !!gameId },
  )

  const infoByVenue = competitions?.reduce<Record<string, { count: number; disciplines: Set<string> }>>((acc, comp) => {
    if (!acc[comp.venue.id]) acc[comp.venue.id] = { count: 0, disciplines: new Set() }
    acc[comp.venue.id].count++
    acc[comp.venue.id].disciplines.add(comp.disciplineDef.name)
    return acc
  }, {}) ?? {}

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">

        {/* Page header */}
        <div className="mb-10">
          {from === "animal" && animalId && (
            <Link
              to="/animal/$animalId"
              params={{ animalId }}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft size={15} />
              Back to Animal
            </Link>
          )}
          <h1 className="font-serif text-4xl font-semibold text-foreground">
            {isConformation ? "Conformation Show Venues" : "World Venues"}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
            Explore the competition grounds. Each region presents unique
            environmental conditions that affect performance. Prepare your stable accordingly.
          </p>
        </div>

        {/* Grid */}
        {venuesLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl border border-border bg-muted/20" />
            ))}
          </div>
        ) : !venues?.length ? (
          <p className="text-sm text-muted-foreground">No venues configured.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue) => {
              const info = infoByVenue[venue.id]
              const count = info?.count ?? 0
              const disciplines = info ? Array.from(info.disciplines) : []
              const heroGradient = venue.climate ? CARD_HERO[venue.climate] : "bg-muted/20"
              const climateBadge = venue.climate ? CLIMATE_BADGE[venue.climate] : ""
              const climateIconCls = venue.climate ? CLIMATE_ICON_CLS[venue.climate] : "text-foreground/10"
              const conditions = venue.climate && venue.terrain ? CONDITIONS[venue.climate]?.[venue.terrain] : null

              return (
                <Link
                  key={venue.id}
                  to="/venue/$venueId"
                  params={{ venueId: venue.id }}
                  search={{ animalId, disciplineDefId, isConformation, from }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/30"
                >
                  {/* Hero */}
                  <div className={cn("relative h-36 overflow-hidden", heroGradient, count === 0 && "opacity-60")}>
                    <div className={cn("absolute -bottom-3 -right-3 transition-transform group-hover:-translate-x-1 group-hover:translate-y-1", climateIconCls)}>
                      <TerrainIcon terrain={venue.terrain} size={88} />
                    </div>
                    {venue.terrain && (
                      <span className="absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-widest text-foreground/35">
                        {venue.terrain === "MOUNTAIN" ? "Mountains" : venue.terrain === "COASTAL" ? "Coastal" : venue.terrain === "HILLY" ? "Hills" : "Flatlands"}
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-xl font-semibold leading-snug text-foreground">
                      {venue.name}
                    </h2>

                    {/* CONDITIONS */}
                    {conditions && (
                      <div className="mt-3">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">Conditions</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/80">
                          {venue.climate && (
                            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", climateBadge)}>
                              {venue.climate.charAt(0) + venue.climate.slice(1).toLowerCase()}
                            </span>
                          )}
                          {conditions.split(" & ")[1]}
                        </p>
                      </div>
                    )}

                    {/* SANCTIONED DISCIPLINES */}
                    <div className="mt-4">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                        Sanctioned Disciplines
                      </p>
                      {disciplines.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {disciplines.slice(0, 4).map((d) => (
                            <span key={d} className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                              {d}
                            </span>
                          ))}
                          {disciplines.length > 4 && (
                            <span className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                              +{disciplines.length - 4}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground/50">No open events</p>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="mt-auto pt-5">
                      <div className={cn(
                        "flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                        count > 0
                          ? "bg-primary text-primary-foreground group-hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-default",
                      )}>
                        <span>{count > 0 ? `Visit Venue` : "No Open Events"}</span>
                        {count > 0 && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
