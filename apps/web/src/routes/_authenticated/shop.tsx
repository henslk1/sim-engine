import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { ShoppingBag, Package, CheckCircle, PawPrint } from "lucide-react"
import { Button } from "@/components/ui/button"

type ShopTab = "BASE" | "PREMIUM" | "inventory" | "animals"

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

  const shopListings = listings?.filter((l) => l.shopType === (tab === "BASE" || tab === "PREMIUM" ? tab : "BASE")) ?? []

  if (!gameId || !me) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground flex items-center gap-2">
          <ShoppingBag className="size-5" /> Shop
        </h1>
        {balances && balances.length > 0 && (
          <div className="flex items-center gap-3">
            {balances.map((b) => (
              <span key={b.id} className="text-sm font-semibold text-foreground">
                <span className="text-muted-foreground font-normal">{b.currencyDef.symbol ?? b.currencyDef.name} </span>
                {b.balance.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border pb-0">
        {(["BASE", "PREMIUM", "animals", "inventory"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t === "BASE" ? "Store" : t === "PREMIUM" ? "Premium" : t === "animals" ? "Animals" : "My Inventory"}
            {t === "inventory" && inventory && inventory.length > 0 && (
              <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px]">
                {inventory.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
            {t === "animals" && shopAnimals && shopAnimals.length > 0 && (
              <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px]">
                {shopAnimals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {justBought && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          <CheckCircle className="size-4 text-primary" />
          <span><span className="font-semibold">{justBought}</span> added to your stable</span>
        </div>
      )}

      {(buy.error || buyAnimal.error) && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {buy.error?.message ?? buyAnimal.error?.message}
        </p>
      )}

      {tab === "animals" ? (
        !shopAnimals || shopAnimals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No animals currently available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shopAnimals.map((sa) => {
              const { price, currencyDef } = sa.shopBreedConfig
              const balance = getBalance(sa.shopBreedConfig.currencyDefId)
              const canAfford = balance >= price
              const isBuying = buyAnimal.isPending && buyAnimal.variables?.gameShopAnimalId === sa.id
              return (
                <div
                  key={sa.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-2 flex flex-col"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <PawPrint className="size-3.5 shrink-0 text-muted-foreground" />
                      <Link
                        to="/animal/$animalId"
                        params={{ animalId: sa.animal.id }}
                        className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {sa.animal.name}
                      </Link>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {sa.animal.breed.name} · {sa.animal.lifeStage.name} · {sa.animal.sex === "MALE" ? "M" : "F"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className={["text-sm font-semibold", canAfford ? "text-foreground" : "text-destructive"].join(" ")}>
                      {price === 0 ? "Free" : `${price} ${currencyDef.symbol ?? currencyDef.name}`}
                    </span>
                    <Button
                      size="sm"
                      variant={canAfford ? "default" : "outline"}
                      disabled={!canAfford || isBuying || buyAnimal.isPending}
                      onClick={() => handleBuyAnimal(sa.id)}
                    >
                      {isBuying ? "Buying…" : "Buy"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : tab !== "inventory" ? (
        shopListings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No items available in this shop.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shopListings.map((l) => {
              const balance = getBalance(l.currencyDef.id)
              const canAfford = balance >= l.price
              const isBuying = buy.isPending && buy.variables?.listingId === l.id
              return (
                <div
                  key={l.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-2 flex flex-col"
                >
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{l.itemDef.name}</p>
                    {l.itemDef.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{l.itemDef.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">{l.itemDef.category}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className={["text-sm font-semibold", canAfford ? "text-foreground" : "text-destructive"].join(" ")}>
                      {l.price === 0 ? "Free" : `${l.price} ${l.currencyDef.symbol ?? l.currencyDef.name}`}
                    </span>
                    <Button
                      size="sm"
                      variant={canAfford ? "default" : "outline"}
                      disabled={!canAfford || isBuying || buy.isPending}
                      onClick={() => handleBuy(l.id)}
                    >
                      {isBuying ? "Buying…" : "Buy"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        !inventory || inventory.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Your inventory is empty.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="size-3 text-muted-foreground" />
                        <span className="font-medium text-foreground">{inv.itemDef.name}</span>
                      </div>
                      {inv.itemDef.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{inv.itemDef.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{inv.itemDef.category}</td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{inv.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/shop")({
  component: ShopPage,
})
