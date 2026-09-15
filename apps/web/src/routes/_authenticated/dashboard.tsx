import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { grantGold } from "@/lib/tutorial/utils/grant-gold"
import { grantPremium } from "@/lib/tutorial/utils/grant-premium"
import { useEffect, useMemo, useState } from "react"
import { Dialog } from "@/components/game/ui"
import { startTutorial, isTourRunning, setTourRunning } from "@/lib/tutorial"
import {
  AlertTriangle, Baby, Trophy, Coins, PawPrint, ClipboardList,
  ArrowRight, ShieldCheck, Mountain, Waves, Wind,
  ShoppingBag, Ticket, Star, Medal, Newspaper,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({
    welcome: search.welcome === true || search.welcome === "true" ? true : undefined,
  }),
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

// ─── Dev log ───────────────────────────────────────────────────────────────────

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

// ─── Coming soon placeholder ──────────────────────────────────────────────────

function ComingSoonCard({ minHeight = "140px" }: { minHeight?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight }}>
      <p className="text-sm italic text-muted-foreground/40">Coming soon</p>
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
                  <p className="truncate text-muted-foreground/60">{animal.breed?.name ?? animal.breedName ?? ""}</p>
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
  return (
    <div className="flex min-h-50 items-center justify-center border-b border-border bg-chart-2/4 px-6 py-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-chart-2/50">Breed Campaigns</p>
        <p className="mt-2 text-sm italic text-muted-foreground/40">Coming soon</p>
      </div>
    </div>
  )
}

// ─── Center panels ─────────────────────────────────────────────────────────────

function MarketplacePanel() {
  return (
    <Panel title="Recent Listings" icon={ShoppingBag}>
      <ComingSoonCard minHeight="130px" />
    </Panel>
  )
}

function RafflePanel() {
  return (
    <Panel title="Raffles" icon={Ticket}>
      <ComingSoonCard minHeight="120px" />
    </Panel>
  )
}

function FeaturedHorsePanel() {
  return (
    <Panel title="Featured Horse" icon={Star}>
      <ComingSoonCard minHeight="140px" />
    </Panel>
  )
}

function LastInvitationalPanel() {
  return (
    <Panel title="Last Invitational" icon={Medal}>
      <ComingSoonCard minHeight="100px" />
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
  const utils = trpc.useUtils()
  const { welcome } = Route.useSearch()
  const [tutorialStarted, setTutorialStarted] = useState(false)

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

  // Show dialog whenever tutorial is incomplete — derived from seniority, not URL state.
  // tutorialStarted hides it once the driver tour is launched (cleared on page reload).
  // isTourRunning() hides it if Driver.js is actively running (module-level flag that resets on
  // every full page load — unlike sessionStorage, it can't be left stale from a prior session).
  const tutorialComplete = me?.seniority?.tutorialCompleted ?? true
  const showWelcome = !meLoading && !tutorialComplete && !tutorialStarted && !isTourRunning()

  const setupMutation = trpc.tutorial.setup.useMutation()
  const completeStepMutation = trpc.tutorial.completeStep.useMutation()


  const { data: tutorialProgress, isLoading: progressLoading } = trpc.tutorial.getProgress.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && showWelcome },
  )

  // Whether setup has been called: progress records exist (created in tutorial.setup).
  const isSetup = (tutorialProgress?.progress.length ?? 0) > 0

  // First incomplete step def — drives the contextual re-entry dialog.
  const nextIncompleteStep = tutorialProgress?.steps.find((step) => {
    const prog = tutorialProgress.progress.find((p) => p.stepDefId === step.id)
    return !prog || prog.completedAt === null
  })

  // Map completed step defs to a Driver.js checkpoint resume index.
  // NOTE: DEV pause is at index 21 — remove before launch.
  const resumeIndex = useMemo(() => {
    const dbIndex = (() => {
      if (!tutorialProgress) return 0
      const completedKeys = new Set(
        tutorialProgress.progress
          .filter((p) => p.completedAt !== null)
          .map((p) => tutorialProgress.steps.find((s) => s.id === p.stepDefId)?.stepKey),
      )
      if (completedKeys.has("step_mare_profile")) return 20  // training phase (dev pause for now)
      if (completedKeys.has("step_purchased")) return 10     // profile phase start
      if (completedKeys.has("step_shop")) return 5           // stable phase start
      return 0
    })()
    // Always layer in localStorage so the user resumes at the exact Driver.js step they left.
    // devReset clears localStorage so a full restart always lands at step 0.
    const lsRaw = parseInt(localStorage.getItem("tutorial_step") ?? "", 10)
    const lsIndex = isNaN(lsRaw) ? 0 : lsRaw
    return Math.max(dbIndex, lsIndex)
  }, [tutorialProgress])

  const { data: tutorialPair } = trpc.tutorial.pairIds.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && resumeIndex >= 10 && showWelcome },
  )

  function beginTutorial() {
    if (!gameId) return
    // Mark the tour as running before any navigation so beforeLoad (which imports
    // isTourRunning) allows /shop immediately — 600 ms before driverObj.drive() is called.
    setTourRunning(true)
    setTutorialStarted(true)
    if (welcome) navigate({ to: "/dashboard", search: {}, replace: true })

    // Navigate to the page where the resume step's spotlight element lives,
    // so Driver.js can find it when the tour starts.
    const animalId = tutorialPair?.ancestorOneId
    let didNavigate = true
    if (resumeIndex >= 58 && resumeIndex <= 60) {
      navigate({ to: "/vet", search: animalId ? { animalId, service: "certificates" as const } : {} })
    } else {
      const resumeRoute =
        resumeIndex >= 11 ? (animalId ? `/animal/${animalId}` : "/stable") :
        resumeIndex >= 6 ? "/stable" :
        resumeIndex >= 1 && resumeIndex <= 5 ? "/shop" :
        null
      if (resumeRoute) navigate({ to: resumeRoute })
      else didNavigate = false
    }

    // setup creates the tutorial animal pair + TutorialProgress rows.
    // Throws "Tutorial already set up" on resume — caught and ignored.
    setupMutation.mutateAsync({ gameId })
      .catch(() => {})
      .finally(() => {
        const launch = () => startTutorial(
          {
            grantGold: (amount) => grantGold(gameId!, amount),
            grantPremium: () => grantPremium(gameId!),
            completeStep: (stepKey) => completeStepMutation.mutateAsync({ gameId, stepKey }),
          },
          resumeIndex,
          () => completeStepMutation.mutate({ gameId: gameId!, stepKey: "tutorial_complete" }),
        )
        // Give React Router time to navigate before Driver.js queries the DOM.
        if (didNavigate) setTimeout(launch, 600)
        else launch()
      })
  }

  const { data: balances = [] } = trpc.player.balances.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )
  const { data: animals = [] } = trpc.animal.list.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )
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
            discipline: comp.disciplineDef?.name ?? "",
            venue: comp.venue.name,
            tier: comp.tierDef?.name ?? "",
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
    <>
    <Dialog
      open={showWelcome}
      title={!isSetup ? "Welcome to Your Breeding Program" : nextIncompleteStep ? nextIncompleteStep.name : "Continue Your Tutorial"}
    >
      <div className="space-y-3 px-4 py-4">
        {!isSetup ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              You'll begin with a foundation mare representing one of the historic lines behind your chosen breed. Together, you'll learn how to care for, train, compete, manage health, and prepare a horse for breeding.
            </p>
            <p className="text-sm text-muted-foreground">
              Her foal will become your first purebred and the beginning of your own breeding program.
            </p>
          </div>
        ) : nextIncompleteStep ? (
          <p className="text-sm text-muted-foreground">{nextIncompleteStep.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
        )}
        <div className="flex justify-end">
          <button
            onClick={beginTutorial}
            disabled={progressLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {progressLoading ? "Loading…" : isSetup ? "Continue Tutorial" : "Begin Tutorial"}
          </button>
        </div>
      </div>
    </Dialog>
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
    </>
  )
}
