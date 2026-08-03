import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { ActionButton } from "@/components/game/ui"
import { ArrowLeft, Heart, ImageIcon, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnimalProfile } from "./animal/-animal-profile/types"
import { CreateListingDialog } from "./animal/-animal-profile/panels/CreateListingDialog"

export const Route = createFileRoute("/_authenticated/stud-market")({
  validateSearch: (search: Record<string, unknown>) => ({
    fromAnimalId: (search.fromAnimalId as string) || undefined,
    fromAnimalName: (search.fromAnimalName as string) || undefined,
    listingId: (search.listingId as string) || undefined,
  }),
  component: StudMarketPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Listing = {
  id: string
  title: string | null
  description: unknown
  pricePerSlot: number
  pureBredOnly: boolean
  isActive: boolean
  ownerPlayer: { id: string; username: string }
  animal: {
    id: string
    name: string
    breedId: string | null
    breedName: string | null
    breed: { name: string } | null
    image: string | null
    fertility: number
    ageInCycles: number
    breedGeneration: number | null
    stats: { trainedValue: number }[]
    conformationScores: { score: number; breedId: string }[]
    compTiers: { tierDef: { name: string }; disciplineDef: { name: string } }[]
    titles: { id: string; titleDef: { name: string } }[]
    breedComposition: { percentage: number; breed: { name: string } }[]
    personality: { value: number; traitLabel: string | null; traitDef: { name: string } }[]
    _count: { breedingRecordsAsSire: number }
  }
  currencyDef: { id: string; symbol: string | null; name: string } | null
  breedRestrictions: { breedId: string; breed: { name: string } }[]
  statMinimums: { statDefId: string; minValue: number; statDef: { name: string } }[]
  requiredTitleDef: { name: string } | null
  _count: { slots: number }
}

// ─── TipTap renderer ──────────────────────────────────────────────────────────

type TTMark = { type: string; attrs?: Record<string, unknown> }
type TTNode = { type?: string; text?: string; content?: TTNode[]; marks?: TTMark[]; attrs?: Record<string, unknown> }

function applyMarks(content: React.ReactNode, marks: TTMark[]): React.ReactNode {
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case "bold":      return <strong className="font-semibold">{acc}</strong>
      case "italic":    return <em className="italic">{acc}</em>
      case "strike":    return <s>{acc}</s>
      case "underline": return <u>{acc}</u>
      case "code":      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{acc}</code>
      default:          return acc
    }
  }, content)
}

const ALIGN_CLS: Record<string, string> = {
  left: "text-left", center: "text-center", right: "text-right", justify: "text-justify",
}

function ttAlign(node: TTNode) {
  return node.attrs?.textAlign ? (ALIGN_CLS[node.attrs.textAlign as string] ?? "") : ""
}

function renderTTNode(node: TTNode, key: number): React.ReactNode {
  if (node.type === "text") {
    const t = node.text ?? ""
    return node.marks?.length ? applyMarks(t, node.marks) : t
  }
  if (node.type === "hardBreak") return <br key={key} />
  const children = node.content?.map((c, i) => renderTTNode(c, i)) ?? []
  const align = ttAlign(node)
  switch (node.type) {
    case "paragraph":
      return <p key={key} className={cn("text-sm leading-relaxed", align)}>{children}</p>
    case "bulletList":
      return <ul key={key} className={cn("list-disc space-y-0.5 pl-5 text-sm", align)}>{children}</ul>
    case "orderedList":
      return <ol key={key} className={cn("list-decimal space-y-0.5 pl-5 text-sm", align)}>{children}</ol>
    case "listItem":
      return <li key={key}>{children}</li>
    case "blockquote":
      return <blockquote key={key} className={cn("border-l-2 border-border pl-3 italic opacity-75", align)}>{children}</blockquote>
    case "heading": {
      const level = (node.attrs?.level as number) ?? 2
      const size = level === 1 ? "text-2xl" : level === 2 ? "text-xl" : level === 3 ? "text-lg" : "text-base"
      const weight = level <= 2 ? "font-bold" : "font-semibold"
      return <p key={key} className={cn(size, weight, align)}>{children}</p>
    }
    default:
      return <span key={key}>{children}</span>
  }
}

function TipTapContent({ json }: { json: unknown }) {
  if (!json || typeof json !== "object") return null
  const doc = json as TTNode
  if (!doc.content?.length) return null
  return <div className="space-y-2">{doc.content.map((n, i) => renderTTNode(n, i))}</div>
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const TRAIT_COLORS = ["bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-blue-400", "bg-purple-400"]

function FertilityHearts({ fertility, size = "sm" }: { fertility: number; size?: "sm" | "lg" }) {
  const filled = fertility >= 0.8 ? 5 : fertility >= 0.6 ? 4 : fertility >= 0.4 ? 3 : fertility >= 0.2 ? 2 : fertility > 0 ? 1 : 0
  const sz = size === "lg" ? "size-[14px]" : "size-3"
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Heart key={i} className={cn(sz, i < filled ? "text-rose-400" : "text-muted-foreground/20")} fill="currentColor" />
      ))}
    </span>
  )
}

function PriceTag({ listing }: { listing: Listing }) {
  if (listing.pricePerSlot === 0) return <span className="text-xs font-bold text-emerald-500">Free</span>
  return (
    <span className="text-xs font-bold text-amber-500">
      {listing.pricePerSlot}{listing.currencyDef?.symbol ?? "g"}
    </span>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-1 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

// ─── Listing card (left panel) ────────────────────────────────────────────────

function ListingCard({ listing, isSelected, onSelect, onBook, cycleToAge }: {
  listing: Listing; isSelected: boolean
  onSelect: () => void; onBook: () => void; cycleToAge: (n: number) => string
}) {
  const breed = listing.animal.breed?.name ?? listing.animal.breedName ?? "Unknown"
  const slots = listing._count.slots
  const stats = Math.round(listing.animal.stats.reduce((s, x) => s + x.trainedValue, 0))
  const conf = listing.animal.conformationScores[0]?.score
  const sameBreedOnly = listing.breedRestrictions.length > 0 && listing.breedRestrictions.every((r) => r.breedId === listing.animal.breedId)

  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect} onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "flex gap-4 rounded-xl border p-4 cursor-pointer transition-all duration-150",
        isSelected
          ? "border-primary/50 bg-primary/8 shadow-sm border-r-[3px] border-r-primary"
          : "border-border/50 bg-secondary/30 hover:bg-secondary/50 hover:border-border/70",
      )}
    >
      {/* Image */}
      <div className="size-[100px] shrink-0 overflow-hidden rounded-xl bg-secondary/50 border border-border/30">
        {listing.animal.image
          ? <img src={listing.animal.image} alt={listing.animal.name} className="size-full object-cover" />
          : <div className="flex size-full items-center justify-center"><ImageIcon className="size-6 text-muted-foreground/40" /></div>
        }
      </div>

      {/* Content: identity on top, data row on bottom */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        {/* Identity row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {listing.title
              ? <>
                  <p className="truncate font-serif text-base font-semibold text-foreground leading-snug">"{listing.title}"</p>
                  <p className="truncate text-xs text-muted-foreground">{listing.animal.name}</p>
                </>
              : <p className="truncate font-serif text-base font-semibold text-foreground leading-snug">{listing.animal.name}</p>
            }
            <p className="text-xs text-muted-foreground">by {listing.ownerPlayer.username}</p>
          </div>
          <div className="shrink-0 text-right">
            <PriceTag listing={listing} />
            <p className="mt-0.5 text-xs text-muted-foreground">{slots} {slots === 1 ? "slot" : "slots"}</p>
          </div>
        </div>

        {/* Data row — spans full remaining width */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
          onClick={(e) => e.stopPropagation()} role="presentation"
        >
          <span className="text-xs text-muted-foreground">
            {breed}{listing.animal.breedGeneration !== null ? ` · Gen ${listing.animal.breedGeneration}` : ""} · {cycleToAge(listing.animal.ageInCycles)} · {listing.animal._count.breedingRecordsAsSire} offspring
          </span>
          <span className="h-3 w-px shrink-0 bg-border/60" />
          <FertilityHearts fertility={listing.animal.fertility} />
          {conf !== undefined && <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{conf.toFixed(0)}</span> Conf</span>}
          {stats > 0 && <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{stats}</span> Stats</span>}
          <div className="ml-auto flex items-center gap-1.5">
            {listing.pureBredOnly && <Badge>Purebred only</Badge>}
            {sameBreedOnly && !listing.pureBredOnly && <Badge>Same breed</Badge>}
            {listing.statMinimums.length > 0 && <Badge>Stat req.</Badge>}
            {listing.requiredTitleDef && <Badge>Title req.</Badge>}
            <Link
              to="/animal/$animalId" params={{ animalId: listing.animal.id }}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50"
            >
              View page
            </Link>
            <ActionButton variant="primary" disabled={slots === 0} onClick={onBook}>
              {slots === 0 ? "No slots" : "Book"}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel (right) ─────────────────────────────────────────────────────

function DetailPanel({ listing, cycleToAge, onEdit }: {
  listing: Listing; cycleToAge: (n: number) => string; onEdit?: () => void
}) {
  const breed    = listing.animal.breed?.name ?? listing.animal.breedName ?? "Unknown"
  const slots    = listing._count.slots
  const stats    = Math.round(listing.animal.stats.reduce((s, x) => s + x.trainedValue, 0))
  const conf     = listing.animal.conformationScores[0]?.score
  const hasDesc  = listing.description != null && typeof listing.description === "object"
  const traits   = listing.animal.personality.filter((p): p is typeof p & { traitLabel: string } => p.traitLabel !== null)
  const hasRestr = listing.breedRestrictions.length > 0 || listing.pureBredOnly || listing.statMinimums.length > 0 || listing.requiredTitleDef

  return (
    <div>

        {/* ── Title ────────────────────────────────────────── */}
        <div className="px-8 pt-7 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {listing.title
                ? <>
                    <h2 className="font-serif text-3xl font-bold text-foreground leading-tight">
                      "{listing.title}"
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{listing.animal.name}</p>
                  </>
                : <h2 className="font-serif text-3xl font-bold text-foreground leading-tight">
                    {listing.animal.name}
                  </h2>
              }
            </div>
            {onEdit && (
              <button type="button" onClick={onEdit}
                className="mt-2 shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Edit ad
              </button>
            )}
          </div>

          {/* Image + Description */}
          <div className="mt-5 flex gap-5">
            <div className="shrink-0 overflow-hidden rounded-xl border border-border/30 bg-secondary/40" style={{ width: "160px", minHeight: "160px" }}>
              {listing.animal.image
                ? <img src={listing.animal.image} alt={listing.animal.name} className="h-full w-full object-cover object-top" />
                : <div className="flex h-full w-full items-center justify-center" style={{ minHeight: "160px" }}><ImageIcon className="size-10 text-muted-foreground/30" /></div>
              }
            </div>
            <div className="min-w-0 flex-1">
              {hasDesc
                ? <TipTapContent json={listing.description} />
                : <p className="text-sm italic text-muted-foreground/50">No description provided.</p>
              }
            </div>
          </div>
        </div>

        {/* ── Info chip strip (metadata + stats) ───────────── */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 bg-secondary/30 px-6 py-3">
          <InfoChip>by {listing.ownerPlayer.username}</InfoChip>
          <InfoChip>{breed}</InfoChip>
          {listing.animal.breedGeneration !== null && <InfoChip>Gen {listing.animal.breedGeneration}</InfoChip>}
          <InfoChip>{cycleToAge(listing.animal.ageInCycles)}</InfoChip>
          <InfoChip>{listing.animal._count.breedingRecordsAsSire} offspring</InfoChip>
          <span className="h-3 w-px shrink-0 bg-border/60" />
          <InfoChip><FertilityHearts fertility={listing.animal.fertility} /></InfoChip>
          {conf !== undefined && <InfoChip>{conf.toFixed(0)} Conformation</InfoChip>}
          {stats > 0 && <InfoChip>{stats} Stats</InfoChip>}
          {listing.animal.compTiers.map((ct, i) => (
            <InfoChip key={i}>{ct.disciplineDef.name} · {ct.tierDef.name}</InfoChip>
          ))}
        </div>

        {/* ── Content panels ───────────────────────────────── */}
        <div className="grid gap-3 px-5 pt-4 pb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>

          {/* Price */}
          <div className="rounded-2xl border border-border/40 bg-secondary/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Price per slot</p>
            <p className="mt-1.5 text-xl font-bold leading-none">
              {listing.pricePerSlot === 0
                ? <span className="text-emerald-500">Free</span>
                : <span className="text-amber-500">{listing.pricePerSlot}{listing.currencyDef?.symbol ?? "g"}</span>
              }
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{slots} {slots === 1 ? "slot" : "slots"} available</p>
          </div>

          {/* Requirements */}
          {hasRestr && (
            <div className="rounded-2xl border border-border/40 bg-secondary/25 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Requirements</p>
              <div className="space-y-1.5 text-sm">
                {listing.pureBredOnly && listing.breedRestrictions.length === 0 && (
                  <p className="text-muted-foreground">Purebred dams only</p>
                )}
                {listing.pureBredOnly && listing.breedRestrictions.length > 0 && (
                  <p className="text-muted-foreground">Purebred only · {listing.breedRestrictions.map((r) => r.breed.name).join(", ")}</p>
                )}
                {!listing.pureBredOnly && listing.breedRestrictions.map((r) => (
                  <p key={r.breedId} className="text-muted-foreground">Breed: {r.breed.name}</p>
                ))}
                {listing.statMinimums.map((s) => (
                  <div key={s.statDefId} className="flex items-baseline gap-2">
                    <span className="text-muted-foreground">{s.statDef.name}:</span>
                    <span className="font-semibold text-foreground">{s.minValue} min</span>
                  </div>
                ))}
                {listing.requiredTitleDef && (
                  <p className="text-muted-foreground">Required title: <span className="font-semibold text-foreground">{listing.requiredTitleDef.name}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Breed composition */}
          {listing.animal.breedComposition.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-secondary/25 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Breed composition</p>
              <div className="space-y-2.5">
                {listing.animal.breedComposition.map((bc, i) => {
                  const pct = bc.percentage * 100 < 1 ? "< 1" : Math.round(bc.percentage * 100)
                  const bar = Math.min(100, Math.round(bc.percentage * 100))
                  return (
                    <div key={i}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium text-foreground">{bc.breed.name}</span>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${bar}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Competition */}
          {listing.animal.compTiers.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-secondary/25 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Competition</p>
              <div className="space-y-1.5">
                {listing.animal.compTiers.map((ct, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{ct.disciplineDef.name}</span>
                    <span className="rounded-md bg-secondary/70 px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {ct.tierDef.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personality — full width */}
          {traits.length > 0 && (
            <div className="col-span-full rounded-2xl border border-border/40 bg-secondary/25 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Personality</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {traits.map((p, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-foreground">{p.traitDef.name}</span>
                      <span className="text-muted-foreground">{p.traitLabel} · {Math.round(p.value)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                      <div className={cn("h-full rounded-full", TRAIT_COLORS[i % TRAIT_COLORS.length])}
                        style={{ width: `${Math.min(100, Math.round(p.value))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function StudMarketPage() {
  const { fromAnimalId, fromAnimalName, listingId: fromListingId } = Route.useSearch()
  const navigate = useNavigate()

  const [selectedId, setSelectedId]           = useState<string | null>(fromListingId ?? null)
  const [selectedBreedId, setSelectedBreedId] = useState<string | null>(null)
  const [editOpen, setEditOpen]               = useState(false)
  const utils = trpc.useUtils()

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const cycleToAge = (n: number) => {
    const cpy = gameData?.gameConfig?.cyclesPerYear ?? 12
    return `${Math.floor(n / cpy)}y ${n % cpy}m`
  }

  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: listingsRaw, isLoading } = trpc.breeding.listing.list.useQuery(
    { gameId: gameId!, playerAccountId: playerAccountId ?? undefined },
    { enabled: !!gameId && !!playerAccountId },
  )
  const listings = (listingsRaw as Listing[] | undefined) ?? []

  const handleBook = (listing: Listing) => {
    navigate({
      to: "/breeding/book",
      search: { listingId: listing.id, ...(fromAnimalId ? { damId: fromAnimalId } : {}) },
    })
  }

  const breedOptions = Array.from(
    new Map(listings.filter((l) => l.animal.breedId && l.animal.breed)
      .map((l) => [l.animal.breedId!, l.animal.breed!.name] as [string, string])).entries()
  ).map(([id, name]) => ({ id, name }))

  const filtered = selectedBreedId ? listings.filter((l) => l.animal.breedId === selectedBreedId) : listings
  const selected = filtered.find((l) => l.id === selectedId) ?? null
  const isOwner = !!playerAccountId && !!selected && selected.ownerPlayer.id === playerAccountId

  const { data: editProfile } = trpc.animalProfile.get.useQuery(
    { animalId: selected?.animal.id ?? "" },
    { enabled: editOpen && !!selected },
  )

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>

      {/* ── Page header ───────────────────────────────────── */}
      <div className="shrink-0 px-8 py-6">
        <div className="mb-3">
          {fromAnimalId ? (
            <Link to="/animal/$animalId" params={{ animalId: fromAnimalId }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back to {fromAnimalName ?? "animal page"}
            </Link>
          ) : (
            <Link to="/town"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back to town
            </Link>
          )}
        </div>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-foreground">Stud Market</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fromAnimalId && fromAnimalName
                ? <>Browsing for <span className="font-medium text-foreground">{fromAnimalName}</span></>
                : "Browse available studs and book a breeding slot."
              }
            </p>
          </div>
          {breedOptions.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-0.5">
              <button type="button" onClick={() => setSelectedBreedId(null)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  !selectedBreedId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                All breeds
              </button>
              {breedOptions.map((b) => (
                <button key={b.id} type="button" onClick={() => setSelectedBreedId(b.id === selectedBreedId ? null : b.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedBreedId === b.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Split content ─────────────────────────────────── */}
      <div className="flex gap-3 px-4 pb-4" style={{ flex: 1, minHeight: 0 }}>

        {/* Left: listing panel */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm" style={{ width: "45%", minWidth: "460px", flexShrink: 0 }}>
          <div className="shrink-0 px-5 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
              {filtered.length} listing{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading ? (
              <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No studs available.</p>
            ) : (
              filtered.map((listing) => (
                <ListingCard key={listing.id} listing={listing}
                  isSelected={selectedId === listing.id}
                  onSelect={() => setSelectedId((prev) => prev === listing.id ? null : listing.id)}
                  onBook={() => handleBook(listing)}
                  cycleToAge={cycleToAge} />
              ))
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ minWidth: 0 }}>
          {selected ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                <DetailPanel listing={selected} cycleToAge={cycleToAge}
                  onEdit={isOwner ? () => setEditOpen(true) : undefined} />
              </div>
              <div className="flex items-center justify-center gap-3 py-3">
                <Link
                  to="/animal/$animalId" params={{ animalId: selected.animal.id }}
                  className="inline-flex items-center rounded-xl border border-border/60 bg-card px-6 py-2.5 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-secondary/40">
                  View animal page
                </Link>
                <ActionButton variant="primary" className="px-6 py-2.5 text-base"
                  disabled={selected._count.slots === 0}
                  onClick={() => handleBook(selected)}>
                  {selected._count.slots === 0 ? "No slots" : "Book"}
                </ActionButton>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a listing to view the stud ad.</p>
            </div>
          )}
        </div>

      </div>{/* split */}

      {editOpen && editProfile && editProfile.breedingListings[0] && (
        <CreateListingDialog
          animal={editProfile as AnimalProfile}
          listing={editProfile.breedingListings[0]}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            utils.breeding.listing.list.invalidate()
          }}
        />
      )}

    </div>
  )
}
