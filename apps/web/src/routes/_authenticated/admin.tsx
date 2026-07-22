import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import {
  LayoutDashboard, Users, MessageSquare, Bug, ShieldAlert,
  Megaphone, Fingerprint, ScrollText, Server, TrendingUp, Trophy, Calendar,
  Settings2, PawPrint, GitCommitHorizontal, BarChart2, Sparkles, Tag,
  Dna, GitBranch, FlaskConical, SlidersHorizontal, Heart, Activity,
  Pill, FileCheck, Dumbbell, Gauge, Star, Award, Layers, MapPin,
  CalendarDays, BookOpen, CircleDollarSign, Package, ShoppingCart,
  ShoppingBag, Crown, Bell, Filter, ChevronDown, ChevronRight, ArrowLeft,
  Stethoscope, Swords, Plus, Settings, Gamepad2, Loader2, CircleDot,
} from "lucide-react"

type NavLink = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }
type NavGroupDef = { label: string; links: NavLink[] }

const platformLinks: NavLink[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/players", label: "Players", icon: Users },
  { to: "/admin/support", label: "Support Tickets", icon: MessageSquare },
  { to: "/admin/bugs", label: "Bug Reports", icon: Bug },
  { to: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
  { to: "/admin/integrity", label: "Integrity", icon: Fingerprint },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { to: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
  { to: "/admin/system", label: "System", icon: Server },
]

function makeGameOpsLinks(gameId: string): NavLink[] {
  return [
    { to: `/admin/games/${gameId}`, label: "Setup Checklist", icon: Settings2 },
    { to: `/admin/games/${gameId}/economy`, label: "Economy", icon: TrendingUp },
    { to: `/admin/games/${gameId}/events`, label: "Events", icon: Calendar },
    { to: `/admin/games/${gameId}/seasons`, label: "Seasons & Comp", icon: Trophy },
  ]
}

function makeConfigGroups(gameId: string): NavGroupDef[] {
  return [
    { label: "Game Setup", links: [{ to: `/admin/games/${gameId}/config`, label: "Game Config", icon: Settings2 }] },
    {
      label: "Animals",
      links: [
        { to: `/admin/games/${gameId}/species`, label: "Species", icon: PawPrint },
        { to: `/admin/games/${gameId}/life-stages`, label: "Life Stages", icon: GitCommitHorizontal },
        { to: `/admin/games/${gameId}/stats`, label: "Stats", icon: BarChart2 },
        { to: `/admin/games/${gameId}/personality-traits`, label: "Personality Traits", icon: Sparkles },
        { to: `/admin/games/${gameId}/breeds`, label: "Breeds", icon: Tag },
      ],
    },
    {
      label: "Genetics",
      links: [
        { to: `/admin/games/${gameId}/loci`, label: "Loci & Alleles", icon: Dna },
        { to: `/admin/games/${gameId}/expression-rules`, label: "Expression Rules", icon: GitBranch },
        { to: `/admin/games/${gameId}/genetic-panels`, label: "Genetic Panels", icon: FlaskConical },
        { to: `/admin/games/${gameId}/conformation-sections`, label: "Conformation", icon: SlidersHorizontal },
      ],
    },
    {
      label: "Care & Health",
      links: [
        { to: `/admin/games/${gameId}/care-actions`, label: "Care Actions", icon: Heart },
        { to: `/admin/games/${gameId}/health-conditions`, label: "Health Conditions", icon: Activity },
        { to: `/admin/games/${gameId}/treatments`, label: "Treatments", icon: Pill },
        { to: `/admin/games/${gameId}/health-certificates`, label: "Health Certs", icon: FileCheck },
      ],
    },
    {
      label: "Training",
      links: [
        { to: `/admin/games/${gameId}/training-actions`, label: "Training Actions", icon: Dumbbell },
        { to: `/admin/games/${gameId}/intensity-tiers`, label: "Intensity Tiers", icon: Gauge },
        { to: `/admin/games/${gameId}/stage-activities`, label: "Stage Activities", icon: Star },
        { to: `/admin/games/${gameId}/titles`, label: "Titles", icon: Award },
      ],
    },
    {
      label: "Competition",
      links: [
        { to: `/admin/games/${gameId}/disciplines`, label: "Disciplines", icon: Swords },
        { to: `/admin/games/${gameId}/competition-tiers`, label: "Competition Tiers", icon: Layers },
        { to: `/admin/games/${gameId}/venues`, label: "Venues", icon: MapPin },
        { to: `/admin/games/${gameId}/season-categories`, label: "Season Categories", icon: CalendarDays },
        { to: `/admin/games/${gameId}/records`, label: "Records", icon: BookOpen },
      ],
    },
    {
      label: "Economy",
      links: [
        { to: `/admin/games/${gameId}/currencies`, label: "Currencies", icon: CircleDollarSign },
        { to: `/admin/games/${gameId}/items`, label: "Items", icon: Package },
        { to: `/admin/games/${gameId}/vet-services`, label: "Vet Services", icon: Stethoscope },
        { to: `/admin/games/${gameId}/store-listings`, label: "Store Listings", icon: ShoppingCart },
        { to: `/admin/games/${gameId}/game-shop`, label: "Game Shop", icon: ShoppingBag },
      ],
    },
    {
      label: "Groups",
      links: [{ to: `/admin/games/${gameId}/group-prestige-tiers`, label: "Prestige Tiers", icon: Crown }],
    },
    {
      label: "World",
      links: [
        { to: `/admin/games/${gameId}/notification-topics`, label: "Notification Topics", icon: Bell },
        { to: `/admin/games/${gameId}/directory-filters`, label: "Directory Filters", icon: Filter },
        { to: `/admin/games/${gameId}/tutorial-steps`, label: "Tutorial Steps", icon: BookOpen },
      ],
    },
  ]
}

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
})

function OpsNavLink({ link, exact }: { link: NavLink; exact?: boolean }) {
  const Icon = link.icon
  return (
    <Link
      to={link.to as never}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      activeProps={{ className: "flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-primary text-primary-foreground font-semibold shadow-sm" }}
      activeOptions={exact ? { exact: true } : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{link.label}</span>
      {link.badge != null && link.badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
          {link.badge}
        </span>
      )}
    </Link>
  )
}

function CollapsibleGroup({ group }: { group: NavGroupDef }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 transition-colors hover:text-muted-foreground"
      >
        <Chevron className="size-3 shrink-0" />
        {group.label}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {group.links.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to as never}
                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                activeProps={{ className: "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground font-semibold" }}
              >
                <Icon className="size-3.5 shrink-0" />
                {link.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GameSection({ game }: { game: { id: string; name: string; isActive: boolean } }) {
  const [open, setOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const opsLinks = makeGameOpsLinks(game.id)
  const configGroups = makeConfigGroups(game.id)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Gamepad2 className="size-3.5 shrink-0" />
        <span className="flex-1 font-medium">{game.name}</span>
        {!game.isActive && (
          <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground/50">
            draft
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-0.5 pl-3">
          {opsLinks.map((link) => (
            <OpsNavLink key={link.to} link={link} />
          ))}

          <div className="my-1.5 h-px bg-border/50" />

          <button
            onClick={() => setConfigOpen(o => !o)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          >
            {configOpen ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
            Config
          </button>

          {configOpen && (
            <div className="space-y-0.5 pl-1">
              {configGroups.map((group) => (
                <CollapsibleGroup key={group.label} group={group} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddGameInline() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const utils = trpc.useUtils()
  const navigate = useNavigate()

  const save = trpc.admin.game.saveGame.useMutation({
    onSuccess: (game) => {
      void utils.admin.game.list.invalidate()
      setOpen(false)
      setName("")
      setSlug("")
      void navigate({ to: `/admin/games/${game.id}/config` as never })
    },
  })

  function handleNameChange(val: string) {
    setName(val)
    setSlug(val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        <Plus className="size-4 shrink-0" />
        Add Game
      </button>
    )
  }

  return (
    <div className="mx-1 rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-xs font-semibold text-foreground">New Game</p>
      <input
        autoFocus
        placeholder="Name"
        value={name}
        onChange={e => handleNameChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
      />
      <input
        placeholder="slug"
        value={slug}
        onChange={e => setSlug(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <button
          onClick={() => save.mutate({ name, slug, isActive: false })}
          disabled={!name || !slug || save.isPending}
          className="flex-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="mx-auto size-3 animate-spin" /> : "Create"}
        </button>
        <button
          onClick={() => { setOpen(false); setName(""); setSlug("") }}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
      {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}
    </div>
  )
}

function AdminLayout() {
  const { data: games, isLoading } = trpc.admin.game.list.useQuery()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/20">
            <Settings className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Admin Console</p>
            <p className="text-[11px] text-muted-foreground">Engine Operations</p>
          </div>
          <Link to="/" className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-3" />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* Platform */}
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
            Platform
          </p>
          {platformLinks.map((link) => (
            <OpsNavLink key={link.to} link={link} exact={link.to === "/admin"} />
          ))}

          <div className="my-3 h-px bg-border/60" />

          {/* Games */}
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
            Games
          </p>

          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground/40">
              <Loader2 className="size-3 animate-spin" /> Loading…
            </div>
          )}

          {games?.map((game) => (
            <GameSection key={game.id} game={game} />
          ))}

          <AddGameInline />
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
