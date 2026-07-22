import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { OwnerView } from "./-animal-profile/views/OwnerView"
import { BuriedView } from "./-animal-profile/views/BuriedView"
import { DeceasedPendingView } from "./-animal-profile/views/DeceasedPendingView"
import { ArchivedView } from "./-animal-profile/views/ArchivedView"
import { VisitorView } from "./-animal-profile/views/VisitorView"
import { ShoppingBag, Loader2 } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/animal/$animalId")({
  component: AnimalProfilePage,
})

function ShopPurchaseBanner({
  shopAnimalId,
  price,
  currencyDef,
  playerAccountId,
}: {
  shopAnimalId: string
  price: number
  currencyDef: { id: string; name: string; symbol: string | null }
  playerAccountId: string
}) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [bought, setBought] = useState(false)

  const buyAnimal = trpc.inventory.buyAnimal.useMutation({
    onSuccess: (data) => {
      setBought(true)
      utils.animalProfile.get.invalidate()
      utils.animal.list.invalidate()
      utils.player.balances.invalidate({ playerAccountId })
      setTimeout(() => navigate({ to: "/shop" }), 1200)
    },
  })

  const symbol = currencyDef.symbol ?? currencyDef.name

  if (bought) {
    return (
      <div className="shrink-0 flex items-center justify-center gap-2 border-b border-chart-2/30 bg-chart-2/10 px-4 py-2.5 text-sm font-medium text-chart-2">
        Purchased — returning to shop…
      </div>
    )
  }

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <ShoppingBag className="size-4 text-muted-foreground" />
        <span className="font-medium text-foreground">Available for purchase</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold text-foreground">{price}{symbol}</span>
      </div>
      {buyAnimal.error && (
        <span className="text-xs text-destructive">{buyAnimal.error.message}</span>
      )}
      <button
        type="button"
        disabled={buyAnimal.isPending}
        onClick={() => buyAnimal.mutate({ gameShopAnimalId: shopAnimalId, playerAccountId })}
        className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {buyAnimal.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShoppingBag className="size-3.5" />}
        {buyAnimal.isPending ? "Purchasing…" : "Purchase"}
      </button>
    </div>
  )
}

function AnimalProfilePage() {
  const { animalId } = Route.useParams()
  const { data: animal, isLoading } = trpc.animalProfile.get.useQuery({ animalId })
  const { data: me } = trpc.player.me.useQuery(
    { gameId: animal?.gameId ?? "" },
    { enabled: !!animal },
  )

  if (isLoading)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  if (!animal) return <div className="p-8 text-sm">Animal not found</div>
  const isOwner = !!me && me.id === animal.playerAccount.id

  const shopEntry = animal.gameShopAnimal?.isAvailable ? animal.gameShopAnimal : null

  function withShopBanner(view: React.ReactNode) {
    if (!shopEntry || !me) return <>{view}</>
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <ShopPurchaseBanner
          shopAnimalId={shopEntry.id}
          price={shopEntry.shopBreedConfig.price}
          currencyDef={shopEntry.shopBreedConfig.currencyDef}
          playerAccountId={me.id}
        />
        <div className="min-h-0 flex-1 overflow-hidden">{view}</div>
      </div>
    )
  }

  if (animal.status === "EMBRYO_STORED") return <div className="p-8 text-sm text-muted-foreground">This animal is stored as an embryo.</div>
  if (animal.status === "DECEASED") return withShopBanner(<DeceasedPendingView animal={animal} animalId={animalId} />)
  if (animal.status === "BURIED") return withShopBanner(<BuriedView animal={animal} />)
  if (animal.status === "ARCHIVED") return withShopBanner(<ArchivedView animal={animal} animalId={animalId} />)
  if (!isOwner) return withShopBanner(<VisitorView animal={animal} animalId={animalId} />)
  return withShopBanner(<OwnerView animal={animal} animalId={animalId} playerAccountId={me!.id} />)
}
