import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, useMemo } from "react"
import {
  ShoppingBag, Package, CheckCircle, PawPrint,
  Coins, Gem, Search, Sparkles, Plus, ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ShopTab = "BASE" | "PREMIUM" | "inventory" | "animals"

const tabConfig: { id: ShopTab; label: string }[] = [
  { id: "BASE", label: "Store" },
  { id: "PREMIUM", label: "Premium" },
  { id: "animals", label: "Animals" },
  { id: "inventory", label: "My Inventory" },
]

function categoryLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ListingShape = {
  id: string
  price: number
  currencyDef: { id: string; name: string; symbol: string | null }
  itemDef: { id: string; name: string; description: string | null; category: string }
}

type InvSlot = {
  id: string
  quantity: number
  itemDef: { id: string; name: string; description: string | null; category: string }
}

function FeaturedHero({
  listing,
  canAfford,
  onBuy,
}: {
  listing: ListingShape
  canAfford: boolean
  onBuy: () => void
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-secondary/40 to-transparent" />
      <div className="relative flex flex-col gap-4 p-6 sm:max-w-lg sm:p-8">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          Featured this cycle
        </span>
        <div>
          <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground text-balance">
            {listing.itemDef.name}
          </h2>
          {listing.itemDef.description && (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
              {listing.itemDef.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm font-bold tabular-nums text-foreground ring-1 ring-border">
            <Coins className="size-4 text-chart-1" />
            {listing.price === 0 ? "Free" : listing.price.toLocaleString()}
          </span>
          <button
            type="button"
            disabled={!canAfford}
            onClick={onBuy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Buy now <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </section>
  )
}

function Toolbar({
  filter,
  setFilter,
  query,
  setQuery,
  categories,
}: {
  filter: string
  setFilter: (f: string) => void
  query: string
  setQuery: (q: string) => void
  categories: string[]
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {["all", ...categories].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-secondary-foreground hover:bg-secondary",
            )}
          >
            {f === "all" ? "All items" : categoryLabel(f)}
          </button>
        ))}
      </div>
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the shop…"
          className="w-full rounded-md border border-border bg-card py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  )
}

function ItemCard({
  listing,
  inventory,
  canAfford,
  isBuying,
  isPremium,
  onBuy,
}: {
  listing: ListingShape
  inventory: InvSlot[] | undefined
  canAfford: boolean
  isBuying: boolean
  isPremium: boolean
  onBuy: () => void
}) {
  const owned = inventory?.find((s) => s.itemDef.id === listing.itemDef.id)?.quantity

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-secondary/50 to-card">
        <div className="flex h-full items-center justify-center">
          <Package className="size-10 text-muted-foreground/20 transition-transform duration-300 group-hover:scale-105" />
        </div>
        {owned != null && owned > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
            Owned {owned}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-serif text-base font-semibold leading-tight text-foreground text-balance">
          {listing.itemDef.name}
        </h3>
        {listing.itemDef.description && (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {listing.itemDef.description}
          </p>
        )}

        <div className="mt-auto pt-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {categoryLabel(listing.itemDef.category)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-bold tabular-nums",
              isPremium ? "text-accent-foreground" : "text-foreground",
            )}
          >
            {isPremium ? (
              <Gem className="size-3.5 text-accent" />
            ) : (
              <Coins className="size-3.5 text-chart-1" />
            )}
            {listing.price === 0 ? "Free" : listing.price.toLocaleString()}
          </div>
          <button
            type="button"
            disabled={!canAfford || isBuying}
            onClick={onBuy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              isPremium
                ? "bg-accent text-accent-foreground hover:bg-accent/85"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {isPremium ? <Gem className="size-3.5" /> : <Plus className="size-3.5" />}
            {isBuying ? "Buying…" : isPremium ? "Get" : "Buy"}
          </button>
        </div>
      </div>
    </article>
  )
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof PawPrint
  title: string
  body: string
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground text-pretty">{body}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ShopPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: listings } = trpc.inventory.listStore.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: balances } = trpc.player.balances.useQuery({ playerAccountId: playerAccountId! }, { enabled: !!playerAccountId })
  const { data: inventory } = trpc.inventory.mine.useQuery({ playerAccountId: playerAccountId! }, { enabled: !!playerAccountId })
  const { data: shopAnimals } = trpc.inventory.listShopAnimals.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const utils = trpc.useUtils()

  const invalidatePlayer = () => {
    utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    utils.inventory.mine.invalidate({ playerAccountId: playerAccountId! })
  }
  const invalidateAnimals = () => {
    utils.inventory.listShopAnimals.invalidate({ gameId: gameId! })
    utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
  }

  const buy = trpc.inventory.buy.useMutation({ onSuccess: invalidatePlayer })
  const buyAnimal = trpc.inventory.buyAnimal.useMutation({ onSuccess: invalidateAnimals })

  const [tab, setTab] = useState<ShopTab>("BASE")
  const [filter, setFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [justBought, setJustBought] = useState<string | null>(null)

  function handleBuy(listingId: string) {
    if (!playerAccountId) return
    buy.mutate({ listingId, playerAccountId, quantity: 1 }, {
      onSuccess: (data) => {
        setJustBought(data.item)
        setTimeout(() => setJustBought(null), 2500)
      },
    })
  }

  function handleBuyAnimal(gameShopAnimalId: string) {
    if (!playerAccountId) return
    buyAnimal.mutate({ gameShopAnimalId, playerAccountId }, {
      onSuccess: (data) => {
        setJustBought(data.animalName)
        setTimeout(() => setJustBought(null), 2500)
      },
    })
  }

  function getBalance(currencyDefId: string) {
    return balances?.find((b) => b.currencyDef.id === currencyDefId)?.balance ?? 0
  }

  const shopListings = listings?.filter((l) => l.shopType === (tab === "PREMIUM" ? "PREMIUM" : "BASE")) ?? []

  const categories = useMemo(
    () => Array.from(new Set(shopListings.map((l) => l.itemDef.category))).sort(),
    [shopListings],
  )

  const filtered = useMemo(
    () =>
      shopListings.filter((l) => {
        const matchesFilter = filter === "all" || l.itemDef.category === filter
        const matchesQuery =
          query.trim() === "" ||
          l.itemDef.name.toLowerCase().includes(query.toLowerCase()) ||
          (l.itemDef.description ?? "").toLowerCase().includes(query.toLowerCase())
        return matchesFilter && matchesQuery
      }),
    [shopListings, filter, query],
  )

  const inventoryCount = inventory?.reduce((s, i) => s + i.quantity, 0) ?? 0
  const animalsCount = shopAnimals?.length ?? 0
  const featuredListing = shopListings[0]

  if (!gameId || !me) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold tracking-tight text-foreground">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="size-5" />
            </span>
            Shop
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Outfit and care for your stable with everything from daily feed to prestige items.
          </p>
        </div>
        {balances && balances.length > 0 && (
          <div className="flex items-center gap-2">
            {balances.map((b, i) => (
              <span
                key={b.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums shadow-sm ring-1",
                  i === 0
                    ? "bg-card text-foreground ring-border"
                    : "bg-accent/20 text-accent-foreground ring-accent/30",
                )}
              >
                {i === 0 ? (
                  <Coins className="size-4 text-chart-1" />
                ) : (
                  <Gem className="size-4 text-accent" />
                )}
                {b.balance.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 border-b border-border">
        {tabConfig.map((t) => {
          const badge =
            t.id === "inventory" && inventoryCount > 0
              ? String(inventoryCount)
              : t.id === "animals" && animalsCount > 0
                ? String(animalsCount)
                : undefined
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setFilter("all")
                setQuery("")
              }}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {badge && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                  {badge}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Notifications */}
      {justBought && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          <CheckCircle className="size-4 text-primary" />
          <span>
            <span className="font-semibold">{justBought}</span> added to your stable
          </span>
        </div>
      )}
      {(buy.error || buyAnimal.error) && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {buy.error?.message ?? buyAnimal.error?.message}
        </p>
      )}

      {/* Store */}
      {tab === "BASE" && (
        <div className="mt-6 space-y-6">
          {featuredListing && (
            <FeaturedHero
              listing={featuredListing}
              canAfford={getBalance(featuredListing.currencyDef.id) >= featuredListing.price}
              onBuy={() => handleBuy(featuredListing.id)}
            />
          )}
          <Toolbar
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            categories={categories}
          />
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
              <p className="text-sm text-muted-foreground">No items match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((l) => (
                <ItemCard
                  key={l.id}
                  listing={l}
                  inventory={inventory as InvSlot[] | undefined}
                  canAfford={getBalance(l.currencyDef.id) >= l.price}
                  isBuying={buy.isPending && buy.variables?.listingId === l.id}
                  isPremium={false}
                  onBuy={() => handleBuy(l.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Premium */}
      {tab === "PREMIUM" && (
        <div className="mt-6 space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Premium Collection</h2>
              <p className="text-sm text-muted-foreground">
                Rare and exceptional items purchased with gems. Limited stock rotates each season.
              </p>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
              <p className="text-sm text-muted-foreground">No premium items available right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((l) => (
                <ItemCard
                  key={l.id}
                  listing={l}
                  inventory={inventory as InvSlot[] | undefined}
                  canAfford={getBalance(l.currencyDef.id) >= l.price}
                  isBuying={buy.isPending && buy.variables?.listingId === l.id}
                  isPremium={true}
                  onBuy={() => handleBuy(l.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Animals */}
      {tab === "animals" &&
        (!shopAnimals || shopAnimals.length === 0 ? (
          <EmptyState
            icon={PawPrint}
            title="Animals up for sale"
            body="Browse foals and adults listed by other stables. The marketplace opens next cycle."
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shopAnimals.map((sa) => {
              const { price, currencyDef } = sa.shopBreedConfig
              const canAfford = getBalance(sa.shopBreedConfig.currencyDefId) >= price
              const isBuying =
                buyAnimal.isPending && buyAnimal.variables?.gameShopAnimalId === sa.id
              return (
                <article
                  key={sa.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-secondary/50 to-card">
                    <PawPrint className="size-10 text-muted-foreground/20" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div>
                      <Link to="/animal/$animalId" params={{ animalId: sa.animal.id }}>
                        <h3 className="font-serif text-base font-semibold leading-tight text-foreground hover:text-primary">
                          {sa.animal.name}
                        </h3>
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sa.animal.breed.name} · {sa.animal.lifeStage.name} ·{" "}
                        {sa.animal.sex === "MALE" ? "Male" : "Female"}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <div className="flex items-center gap-1 text-sm font-bold tabular-nums text-foreground">
                        <Coins className="size-3.5 text-chart-1" />
                        {price === 0
                          ? "Free"
                          : `${price.toLocaleString()} ${currencyDef.symbol ?? currencyDef.name}`}
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford || isBuying || buyAnimal.isPending}
                        onClick={() => handleBuyAnimal(sa.id)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Plus className="size-3.5" />
                        {isBuying ? "Buying…" : "Buy"}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ))}

      {/* Inventory */}
      {tab === "inventory" &&
        (!inventory || inventory.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Your inventory"
            body="Items you own will appear here, ready to equip or apply to your horses."
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inventory.map((inv) => (
              <article
                key={inv.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-border"
              >
                <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-secondary/50 to-card">
                  <Package className="size-10 text-muted-foreground/20" />
                  <span className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                    ×{inv.quantity}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <h3 className="font-serif text-base font-semibold leading-tight text-foreground">
                    {inv.itemDef.name}
                  </h3>
                  {inv.itemDef.description && (
                    <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                      {inv.itemDef.description}
                    </p>
                  )}
                  <div className="mt-auto pt-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {categoryLabel(inv.itemDef.category)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/shop")({
  component: ShopPage,
})
