import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"

export const Route = createFileRoute("/_authenticated/breeds/")({
  component: BreedDirectoryPage,
})

type BreedItem = RouterOutputs["breed"]["list"][number]

const BADGE_LABELS: Record<string, string> = {
  BASE: "Base",
  SECONDARY: "Secondary",
  CUSTOM: "Custom",
}

const CLIMATE_LABELS: Record<string, string> = {
  TROPICAL: "Tropical",
  ARID: "Arid",
  TEMPERATE: "Temperate",
  COLD: "Cold",
  ALPINE: "Alpine",
}

const TERRAIN_LABELS: Record<string, string> = {
  FLAT: "Flat",
  HILLY: "Hilly",
  MOUNTAINOUS: "Mountainous",
  COASTAL: "Coastal",
  FOREST: "Forest",
  DESERT: "Desert",
}

function BreedCard({ breed }: { breed: BreedItem }) {
  const navigate = useNavigate()
  const dateAdded = new Date(breed.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })

  return (
    <article
      onClick={() => navigate({ to: "/breeds/$breedId", params: { breedId: breed.id } })}
      className="group flex flex-col cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-linear-to-b from-secondary/50 to-card">
        {breed.image ? (
          <img src={breed.image} alt={breed.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-4xl text-muted-foreground/10 select-none">🐎</span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">
          {BADGE_LABELS[breed.categoryBadge] ?? breed.categoryBadge}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="font-serif text-base font-semibold leading-tight text-foreground">{breed.name}</h3>
          <p className="text-[11px] text-muted-foreground">{breed.species.name}</p>
        </div>

        {breed.lore && (
          <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{breed.lore}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-[10px] text-muted-foreground border-t border-border/60">
          <span>{breed._count.animals} alive</span>
          {breed.preferredClimate && <span>·</span>}
          {breed.preferredClimate && <span>{CLIMATE_LABELS[breed.preferredClimate] ?? breed.preferredClimate}</span>}
          {breed.preferredTerrain && <span>{TERRAIN_LABELS[breed.preferredTerrain] ?? breed.preferredTerrain}</span>}
          <span className="ml-auto">{dateAdded}</span>
        </div>
      </div>
    </article>
  )
}

function ProposalCard() {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-dashed border-border bg-card/30 shadow-sm opacity-60">
      <div className="relative aspect-video w-full bg-linear-to-b from-secondary/20 to-card/20 flex items-center justify-center">
        <span className="text-3xl opacity-20 select-none">✦</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div>
          <h3 className="font-serif text-base font-semibold leading-tight text-muted-foreground">Custom Breed Proposals</h3>
          <p className="text-[11px] text-muted-foreground/60">Coming Soon</p>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground/50">
          Design a new breed and submit it for review. Community-voted proposals are developed into real playable breeds.
        </p>
      </div>
    </article>
  )
}

function BreedDirectoryPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data: breeds, isLoading } = trpc.breed.list.useQuery(
    { gameId },
    { enabled: !!gameId }
  )

  const [search, setSearch] = useState("")
  const [speciesFilter, setSpeciesFilter] = useState<string>("")
  const [badgeFilter, setBadgeFilter] = useState<string>("")

  const speciesList = [...new Set(breeds?.map(b => b.species.name) ?? [])].sort()

  const filtered = (breeds ?? []).filter(b => {
    if (speciesFilter && b.species.name !== speciesFilter) return false
    if (badgeFilter && b.categoryBadge !== badgeFilter) return false
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const selectClass = "rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Breed Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Explore all registered breeds in the game.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2.5">
        <input
          type="search"
          placeholder="Search breeds..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card py-1.5 pl-3 pr-3 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {speciesList.length > 1 && (
          <select value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value)} className={selectClass}>
            <option value="">All species</option>
            {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={badgeFilter} onChange={e => setBadgeFilter(e.target.value)} className={selectClass}>
          <option value="">All types</option>
          <option value="BASE">Base</option>
          <option value="SECONDARY">Secondary</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading breeds...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(b => <BreedCard key={b.id} breed={b} />)}
          <ProposalCard />
        </div>
      )}
    </div>
  )
}
