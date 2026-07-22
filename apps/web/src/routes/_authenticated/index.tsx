import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useEffect } from "react"
import {
  AlertTriangle, Baby, Trophy, Coins, PawPrint, ClipboardList,
  Swords, ArrowRight, ShieldCheck, Mountain, Waves, Wind,
  ShoppingBag, Ticket, Star, Medal, Newspaper,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
})

// ─── Venue display helpers ──────────────────────────────────────────────────────

const CLIMATE_BADGE: Record<string, string> = {
  HOT:       "bg-chart-1/12 text-chart-1",
  WARM:      "bg-chart-3/12 text-chart-3",
  COLD:      "bg-chart-4/12 text-chart-4",
  TEMPERATE: "bg-chart-2/12 text-chart-2",
}

const TERRAIN_LABEL: Record<string, string> = {
  FLAT: "Flatlands", COASTAL: "Coastal", HILLY: "Hills", MOUNTAIN: "Mountains",
}

function TerrainIcon({ terrain }: { terrain: string | null }) {
  if (terrain === "COASTAL") return <Waves className="size-3.5" strokeWidth={1.2} />
  if (terrain === "MOUNTAIN" || terrain === "HILLY") return <Mountain className="size-3.5" strokeWidth={1.2} />
  return <Wind className="size-3.5" strokeWidth={1.2} />
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CAMPAIGN = {
  newBreedName: "Baroque Sport Horse",
  phase: 2, totalPhases: 4,
  dam: "Andalusian", sire: "Warmblood",
  description: "Cross Andalusians with Warmbloods during Phase 2 to contribute toward the Baroque Sport Horse — a breed combining Iberian collection with warmblood scope and power.",
  progress: 340, goal: 1000,
  endsIn: "18 days",
}

const MOCK_LISTINGS = [
  { id: "1", name: "Astrid",     breed: "Friesian",     sex: "Mare",    age: "4",  price: 12500 },
  { id: "2", name: "Nightfall",  breed: "Thoroughbred", sex: "Stallion", age: "6", price:  8200 },
  { id: "3", name: "Solstice",   breed: "Andalusian",   sex: "Mare",    age: "3",  price: 15000 },
  { id: "4", name: "Ember Rise", breed: "Warmblood",    sex: "Gelding", age: "5",  price:  6800 },
]

const MOCK_RAFFLES = [
  {
    id: "1", isGameRaffle: true,
    title: "Heritage Andalusian Colt",
    description: "A young colt from the heritage breeding program. Full genetic panel included at no extra cost.",
    ticketPrice: 500, ticketsSold: 142,
    endsIn: "3d 12h",
  },
  {
    id: "2", isGameRaffle: false,
    hostedBy: "SilverMane_Stables",
    title: "Friesian Mare — Full Panel",
    ticketPrice: 200, ticketsSold: 89,
    endsIn: "1d 4h",
  },
  {
    id: "3", isGameRaffle: false,
    hostedBy: "CoastalBreeds",
    title: "Thoroughbred Stallion",
    ticketPrice: 350, ticketsSold: 54,
    endsIn: "4d",
  },
]

const MOCK_FEATURED = {
  name: "Tempest Rising",
  breed: "Thoroughbred",
  owner: "GoldenPasture",
  sex: "Stallion",
  age: "7",
  discipline: "Flat Racing",
  tier: "Invitational",
  record: "3× Invitational champion · Unbeaten in the last 8 cycles",
}

const MOCK_INVITATIONAL = {
  venue: "Riverside Track",
  climate: "WARM" as string,
  terrain: "FLAT" as string,
  discipline: "Flat Racing",
  cycle: 161,
  date: "July 14, 2026",
  results: [
    { rank: 1, animalName: "Tempest Rising",  player: "GoldenPasture", score: 94.2 },
    { rank: 2, animalName: "Silverwind",       player: "NightStables",  score: 91.8 },
    { rank: 3, animalName: "Desert Run",       player: "AridRanch",     score: 89.5 },
    { rank: 4, animalName: "Copperdawn",       player: "MeadowCrest",   score: 87.1 },
    { rank: 5, animalName: "Stormgate",        player: "IronHoof",      score: 85.6 },
  ],
}

const DEVLOG = [
  {
    id: "1", tag: "Update", tagClass: "bg-chart-1/15 text-chart-1", date: "July 20, 2026",
    title: "Breeding System — Cooldowns, Collection & Embryo Procedures",
    body: "Breeding now enforces cooldowns on sires (post-collection) and dams (post-foaling). Sperm and egg collection are available at the vet with donor snapshots stored at time of collection. Embryo flushing has been added for mares. Castration is now a permanent one-time vet procedure. Offspring can be aborted prior to birth. Senior animals have a reduced daily energy budget.",
  },
  {
    id: "2", tag: "Update", tagClass: "bg-chart-1/15 text-chart-1", date: "July 15, 2026",
    title: "Vet Office Redesign — Conformation Inspection Now Live",
    body: "The vet office has been redesigned around a full service catalog covering health checks, genetic testing, castration, conformation inspection, and embryo procedures. Conformation inspection is now required for breed show eligibility. Scores are permanent. Health conditions now decay over time if untreated.",
  },
  {
    id: "3", tag: "Genetics", tagClass: "bg-chart-4/15 text-chart-4", date: "July 10, 2026",
    title: "Genetic Testing — Individual Locus Tests & Full Panels",
    body: "Genetic testing is now split into individual locus tests (free monthly quota, three per account) and full genetic panels (paid, one-time, covers every locus). Results are permanent and visible on marketplace listings.",
  },
  {
    id: "4", tag: "Competition", tagClass: "bg-chart-2/15 text-chart-2", date: "July 5, 2026",
    title: "Competition System — Tiers, Disciplines & Entry Fees",
    body: "Competition is live across multiple disciplines and venues. Animals compete within their assigned tier per discipline. Results are processed at cycle end. Animals advance tiers by meeting the advancement threshold score. Invitationals require minimum weekly points to qualify.",
  },
  {
    id: "5", tag: "Update", tagClass: "bg-chart-1/15 text-chart-1", date: "June 28, 2026",
    title: "Training, Daily Care & Energy System",
    body: "Animals now track trained stat values per discipline. Daily care tasks — feeding, grooming, exercise — consume energy and influence mood. Training sessions raise stat values toward competition readiness. Seniors have a reduced daily energy budget.",
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatExpiry(expiresAt: Date | string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(ms / 86400000)
  if (days <= 0) return "Closed"
  return days === 1 ? "1d" : `${days}d`
}

// ─── Sidebar section header ────────────────────────────────────────────────────

function SectionHeader({
  title, icon: Icon, href, hrefLabel = "See all", className, iconClassName, textClassName,
}: {
  title: string; icon?: React.ElementType; href?: string; hrefLabel?: string
  className?: string; iconClassName?: string; textClassName?: string
}) {
  return (
    <div className={cn("flex items-center justify-between border-b border-border px-4 py-2", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={cn("size-3.5 text-muted-foreground/60", iconClassName)} />}
        <span className={cn("text-xs font-semibold text-muted-foreground", textClassName)}>{title}</span>
      </div>
      {href && (
        <Link to={href} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
          {hrefLabel} <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Center panel wrapper ──────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, href, hrefLabel = "See all", children, className,
}: {
  title?: string; icon?: React.ElementType; href?: string; hrefLabel?: string
  children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-3.5 text-muted-foreground/60" />}
            <span className="text-xs font-semibold text-muted-foreground">{title}</span>
          </div>
          {href && (
            <Link to={href} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
              {hrefLabel} <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Left sidebar: Alerts ──────────────────────────────────────────────────────

function AlertsSection({
  needsAttention, pregnant,
}: {
  needsAttention: {
    id: string; name: string
    breed: { name: string }; lifeStage: { name: string }
    _count: { healthRecords: number }
  }[]
  pregnant: { id: string; name: string; breed: { name: string } }[]
}) {
  const allAlerts = [
    ...needsAttention.map((a) => ({ type: "health" as const, animal: a })),
    ...pregnant.map((a) => ({ type: "pregnant" as const, animal: a })),
  ]
  const visible = allAlerts.slice(0, 5)
  const overflow = allAlerts.length - visible.length
  const hasAlerts = allAlerts.length > 0

  return (
    <div>
      <SectionHeader
        title="Alerts" icon={AlertTriangle}
        href={hasAlerts ? "/vet" : undefined} hrefLabel="Book vet"
        className={hasAlerts ? "bg-destructive/8" : "bg-secondary/40"}
        iconClassName={hasAlerts ? "text-destructive/60" : undefined}
        textClassName={hasAlerts ? "text-destructive/80" : undefined}
      />
      {!hasAlerts ? (
        <div className="flex items-center gap-2 px-4 py-3">
          <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground/40">No alerts</span>
        </div>
      ) : (
        <>
          {visible.map(({ type, animal }, i) => (
            <Link
              key={animal.id} to="/animal/$animalId" params={{ animalId: animal.id }}
              className={cn(
                "flex items-center justify-between px-4 py-2.5 text-xs transition-colors",
                type === "health" ? "hover:bg-destructive/5" : "hover:bg-secondary/20",
                i > 0 && "border-t border-border/40",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {type === "pregnant"
                  ? <Baby className="size-3.5 shrink-0 text-chart-2/60" />
                  : <AlertTriangle className="size-3.5 shrink-0 text-destructive/50" />
                }
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{animal.name}</p>
                  <p className="truncate text-muted-foreground/60">{animal.breed.name}</p>
                </div>
              </div>
              {type === "health" && (
                <span className="ml-2 shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive/80">
                  {(animal as typeof needsAttention[0])._count.healthRecords} cond.
                </span>
              )}
              {type === "pregnant" && (
                <span className="ml-2 shrink-0 text-[11px] text-muted-foreground/50">Pregnant</span>
              )}
            </Link>
          ))}
          {overflow > 0 && (
            <Link to="/stable" className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-xs text-muted-foreground/60 hover:bg-secondary/20 hover:text-foreground transition-colors">
              <span>+{overflow} more</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </>
      )}
    </div>
  )
}

// ─── Left sidebar: My Entries ──────────────────────────────────────────────────

type CompEntry = {
  id: string; animalName: string; discipline: string
  venue: string; tier: string; expiresAt: Date | string
}

function EntriesSection({ entries }: { entries: CompEntry[] }) {
  return (
    <div>
      <SectionHeader title="My Entries" icon={ClipboardList} href="/venues" hrefLabel="Venues" className="bg-secondary/40" />
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground/40">No active entries</p>
      ) : (
        entries.map((e, i) => {
          const expiry = formatExpiry(e.expiresAt)
          return (
            <div key={e.id} className={cn("flex items-center justify-between px-4 py-2.5 text-xs hover:bg-secondary/20 transition-colors", i > 0 && "border-t border-border/40")}>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{e.animalName}</p>
                <p className="truncate text-muted-foreground/60">{e.discipline} · {e.tier}</p>
                <p className="truncate text-muted-foreground/40">{e.venue}</p>
              </div>
              <span className={cn("ml-2 shrink-0 font-mono text-[11px] tabular-nums", expiry === "1d" ? "text-destructive/80 font-semibold" : "text-muted-foreground/50")}>
                {expiry}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Right sidebar: Stable stats ───────────────────────────────────────────────

function StableStatsSection({ alive, pregnant }: { alive: number; pregnant: number }) {
  return (
    <div>
      <SectionHeader title="Stable" icon={PawPrint} href="/stable" hrefLabel="View" className="bg-secondary/40" />
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        {[
          { label: "Active",   value: alive,    href: "/stable" as const },
          { label: "Pregnant", value: pregnant, href: "/stable" as const },
        ].map(({ label, value, href }) => (
          <Link key={label} to={href} className="flex flex-col px-5 py-4 hover:bg-secondary/20 transition-colors">
            <span className="text-[11px] text-muted-foreground/70">{label}</span>
            <span className="mt-1 font-mono text-2xl font-semibold tabular-nums leading-none text-foreground">{value}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Right sidebar: Balance ────────────────────────────────────────────────────

function BalanceSection({ balances }: {
  balances: { currencyDef: { id: string; name: string; symbol: string | null }; balance: number }[]
}) {
  if (!balances.length) return null
  return (
    <div>
      <SectionHeader title="Balance" icon={Coins} className="bg-secondary/40" />
      {balances.map((b, i) => (
        <div key={b.currencyDef.id} className={cn("flex items-center justify-between px-4 py-2.5 text-xs", i > 0 && "border-t border-border/40")}>
          <span className="text-muted-foreground">{b.currencyDef.name}</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {b.balance.toLocaleString()}{b.currencyDef.symbol ?? ""}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Right sidebar: Venues ─────────────────────────────────────────────────────

type VenueRow = { id: string; name: string; climate: string | null; terrain: string | null; count: number }

function VenuesSection({ venues }: { venues: VenueRow[] }) {
  if (!venues.length) return null
  return (
    <div>
      <SectionHeader title="Competitions" icon={Trophy} href="/venues" hrefLabel="All venues" className="bg-secondary/40" />
      {venues.map((v, i) => (
        <Link
          key={v.id} to="/venue/$venueId" params={{ venueId: v.id }}
          className={cn("flex items-start justify-between px-4 py-3 text-xs transition-colors hover:bg-secondary/20", i > 0 && "border-t border-border/40")}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{v.name}</p>
            <div className="mt-1 flex items-center gap-1.5">
              {v.climate && (
                <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", CLIMATE_BADGE[v.climate])}>
                  {v.climate.charAt(0) + v.climate.slice(1).toLowerCase()}
                </span>
              )}
              {v.terrain && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  <TerrainIcon terrain={v.terrain} />
                  {TERRAIN_LABEL[v.terrain]}
                </span>
              )}
            </div>
          </div>
          <span className="ml-3 shrink-0 font-mono text-muted-foreground/60 tabular-nums">{v.count}</span>
        </Link>
      ))}
    </div>
  )
}

// ─── Center: Campaign banner ───────────────────────────────────────────────────

function CampaignBanner() {
  const c = MOCK_CAMPAIGN
  const pct = Math.round((c.progress / c.goal) * 100)
  return (
    <div className="border-b border-border bg-chart-2/6 px-6 pt-5 pb-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Swords className="size-3.5 text-chart-2/60" />
            <span className="text-xs font-semibold text-chart-2/70 tracking-wide">Breed Campaign</span>
            <span className="rounded bg-chart-2/15 px-1.5 py-0.5 text-[10px] font-medium text-chart-2/70">
              Phase {c.phase} of {c.totalPhases}
            </span>
          </div>
          <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">{c.newBreedName}</h2>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{c.dam}</span>
            <span className="text-muted-foreground/30">×</span>
            <span>{c.sire}</span>
          </div>
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground/50">{c.endsIn} remaining</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{c.description}</p>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{c.progress.toLocaleString()} / {c.goal.toLocaleString()} conceptions</span>
          <span className="font-semibold text-chart-2/80 tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
          <div className="h-full rounded-full bg-chart-2/50 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

// ─── Center panels ─────────────────────────────────────────────────────────────

function MarketplacePanel() {
  return (
    <Panel title="Recent Listings" icon={ShoppingBag} href="/shop" hrefLabel="Browse">
      <div className="grid grid-cols-2 gap-px bg-border">
        {MOCK_LISTINGS.map((l) => (
          <div
            key={l.id}
            className="flex cursor-pointer items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-secondary/20"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-gradient-to-b from-secondary/60 to-card">
              <PawPrint className="size-4 text-muted-foreground/30" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-sm font-semibold leading-tight text-foreground">{l.name}</p>
              <p className="text-[11px] text-muted-foreground/60">{l.breed} · {l.sex} · Age {l.age}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Coins className="size-3 text-chart-1" />
              <span className="font-mono text-xs font-bold tabular-nums text-foreground">{l.price.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground/50">GB</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function RafflePanel() {
  const gameRaffle = MOCK_RAFFLES.find((r) => r.isGameRaffle)
  const playerRaffles = MOCK_RAFFLES.filter((r) => !r.isGameRaffle)
  return (
    <Panel title="Raffles" icon={Ticket} href="/shop" hrefLabel="All raffles">
      {gameRaffle && (
        <div className={cn("flex cursor-pointer items-center justify-between gap-3 bg-chart-3/5 px-4 py-2.5 text-xs hover:bg-chart-3/8 transition-colors")}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-chart-3/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-3">Game</span>
            <p className="truncate font-medium text-foreground">{gameRaffle.title}</p>
            <p className="shrink-0 text-muted-foreground/60">{gameRaffle.ticketPrice.toLocaleString()} GB</p>
          </div>
          <span className="shrink-0 text-muted-foreground/50">{gameRaffle.endsIn}</span>
        </div>
      )}
      {playerRaffles.map((r, i) => (
        <div
          key={r.id}
          className={cn("flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-secondary/20 transition-colors", (gameRaffle || i > 0) && "border-t border-border/40")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-medium text-foreground">{r.title}</p>
            <p className="shrink-0 text-muted-foreground/60">{r.hostedBy} · {r.ticketPrice.toLocaleString()} GB</p>
          </div>
          <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", r.endsIn.startsWith("1d") ? "text-destructive/80 font-semibold" : "text-muted-foreground/50")}>
            {r.endsIn}
          </span>
        </div>
      ))}
    </Panel>
  )
}

function FeaturedHorsePanel() {
  const h = MOCK_FEATURED
  return (
    <Panel title="Featured Horse" icon={Star}>
      <div className="flex gap-0">
        <div className="w-1 shrink-0 bg-chart-3/40" />
        <div className="min-w-0 space-y-2 px-4 py-3.5">
          <div>
            <p className="font-serif text-lg font-semibold leading-tight text-foreground">{h.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">{h.breed} · {h.sex} · Age {h.age}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{h.discipline}</span>
            <span className="rounded bg-chart-3/12 px-2 py-0.5 text-[11px] font-medium text-chart-3">{h.tier}</span>
          </div>
          <p className="text-xs italic text-muted-foreground/70 leading-relaxed">"{h.record}"</p>
          <p className="text-[11px] text-muted-foreground/40">by {h.owner}</p>
        </div>
      </div>
    </Panel>
  )
}

function LastInvitationalPanel() {
  const inv = MOCK_INVITATIONAL
  const winner = inv.results[0]
  return (
    <Panel title="Last Invitational" icon={Medal}>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", CLIMATE_BADGE[inv.climate])}>
            {inv.climate.charAt(0) + inv.climate.slice(1).toLowerCase()}
          </span>
          <span className="flex items-center gap-1 text-xs text-foreground/80 font-medium">
            <TerrainIcon terrain={inv.terrain} />
            {inv.venue}
          </span>
          <span className="text-xs text-muted-foreground/60">· {inv.discipline}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono font-bold text-chart-3">1</span>
          <span className="font-medium text-foreground">{winner.animalName}</span>
          <span className="text-muted-foreground/60">{winner.player}</span>
          <span className="ml-auto font-mono tabular-nums text-muted-foreground/60">{winner.score}</span>
        </div>
        <p className="text-[11px] text-muted-foreground/40">Cycle {inv.cycle} · {inv.date}</p>
      </div>
    </Panel>
  )
}

function DevLogPanel({ gameName }: { gameName: string }) {
  const visible = DEVLOG.slice(0, 3)
  return (
    <Panel title={`${gameName} — Dev Log`} icon={Newspaper}>
      <div className="divide-y divide-border">
        {visible.map((item) => (
          <article key={item.id} className="cursor-pointer px-5 py-4 transition-colors hover:bg-secondary/10">
            <div className="mb-2 flex items-center gap-3">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", item.tagClass)}>{item.tag}</span>
              <span className="text-[11px] text-muted-foreground/50">{item.date}</span>
            </div>
            <h2 className="font-serif text-base font-semibold leading-snug text-foreground">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </article>
        ))}
        {DEVLOG.length > 3 && (
          <div className="flex items-center justify-between border-t border-border/40 px-5 py-2.5 text-xs text-muted-foreground/60 hover:bg-secondary/20 hover:text-foreground transition-colors cursor-pointer">
            <span>{DEVLOG.length - 3} older entries</span>
            <ArrowRight className="size-3" />
          </div>
        )}
      </div>
    </Panel>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const navigate = useNavigate()
  const { data: gameData, isLoading: gameLoading } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: me, isLoading: meLoading, isFetching: meFetching } = trpc.player.me.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  useEffect(() => {
    if (!meLoading && !meFetching && gameId && me === null) navigate({ to: "/setup" })
  }, [me, meLoading, meFetching, gameId, navigate])

  const playerAccountId = me?.id

  const { data: balances = [] } = trpc.player.balances.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )
  const { data: animals = [] } = trpc.animal.list.useQuery()
  const { data: openComps = [] } = trpc.competition.listOpen.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )
  const { data: allVenues = [] } = trpc.competition.listVenues.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  if (gameLoading || (gameId && meLoading)) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  const alive = animals.filter((a) => a.status === "ALIVE")
  const needsAttention = alive.filter((a) => a._count.healthRecords > 0)
  const pregnant = alive.filter((a) => a.pregnancies.length > 0)

  const myUsername = me?.username
  const myEntries: CompEntry[] = myUsername
    ? openComps.flatMap((comp) =>
        comp.entries
          .filter((e) => e.playerAccount.username === myUsername)
          .map((e) => ({
            id: `${comp.id}-${e.animal.id}`,
            animalName: e.animal.name,
            discipline: comp.disciplineDef.name,
            venue: comp.venue.name,
            tier: comp.tierDef.name,
            expiresAt: comp.expiresAt,
          }))
      )
    : []

  const venueDetailMap = new Map(allVenues.map((v) => [v.id, v]))
  const venueCountMap = new Map<string, number>()
  for (const comp of openComps) {
    venueCountMap.set(comp.venue.id, (venueCountMap.get(comp.venue.id) ?? 0) + 1)
  }
  const venues: VenueRow[] = Array.from(venueCountMap.entries()).map(([id, count]) => {
    const detail = venueDetailMap.get(id)
    return { id, name: detail?.name ?? "", climate: detail?.climate ?? null, terrain: detail?.terrain ?? null, count }
  })

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-border bg-card divide-y divide-border">
        <AlertsSection needsAttention={needsAttention} pregnant={pregnant} />
        <EntriesSection entries={myEntries} />
      </div>

      {/* ── Center ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <CampaignBanner />
        <div className="grid grid-cols-2 gap-4 p-5">
          <MarketplacePanel />
          <RafflePanel />
          <FeaturedHorsePanel />
          <LastInvitationalPanel />
          <div className="col-span-2">
            <DevLogPanel gameName={gameData?.name ?? "Dev Log"} />
          </div>
        </div>
      </div>

      {/* ── Right sidebar ────────────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card divide-y divide-border">
        <StableStatsSection alive={alive.length} pregnant={pregnant.length} />
        <BalanceSection balances={balances} />
        <VenuesSection venues={venues} />
      </div>

    </div>
  )
}
