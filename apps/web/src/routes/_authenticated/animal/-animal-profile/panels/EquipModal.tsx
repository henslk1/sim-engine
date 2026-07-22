import { useState } from "react"
import type { AnimalProfile } from "../types"
import { trpc } from "@/lib/trpc"
import { ActionButton } from "@/components/game/ui"
import { Package, ShoppingBag, X, CheckCircle2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

const EQUIPPABLE_CATEGORIES = ["EQUIPMENT", "BREEDING", "MISC"] as const
type EquippableCategory = typeof EQUIPPABLE_CATEGORIES[number]

const CATEGORY_LABEL: Record<EquippableCategory, string> = {
  EQUIPMENT: "Equipment",
  BREEDING:  "Breeding",
  MISC:      "Misc",
}

export function EquipModal({ animal, playerAccountId, onClose }: {
  animal: AnimalProfile
  playerAccountId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const { data: inventory } = trpc.inventory.mine.useQuery({ playerAccountId })

  const invalidate = () => {
    utils.animalProfile.get.invalidate({ animalId: animal.id })
    utils.inventory.mine.invalidate({ playerAccountId })
  }

  const equip = trpc.inventory.equip.useMutation({ onSuccess: invalidate })
  const unequip = trpc.inventory.unequip.useMutation({ onSuccess: invalidate })

  const equippedMap = new Map(animal.equipment.map((eq) => [eq.itemDefId, eq]))

  const unequippedItems = inventory?.filter(
    (inv) => !equippedMap.has(inv.itemDef.id) && (EQUIPPABLE_CATEGORIES as readonly string[]).includes(inv.itemDef.category)
  ) ?? []

  const byCategory = EQUIPPABLE_CATEGORIES.reduce<Record<EquippableCategory, typeof unequippedItems>>((acc, cat) => {
    acc[cat] = unequippedItems.filter((inv) => inv.itemDef.category === cat)
    return acc
  }, { EQUIPMENT: [], BREEDING: [], MISC: [] })

  const availableTabs = EQUIPPABLE_CATEGORIES.filter((cat) => byCategory[cat].length > 0)

  const [activeCategory, setActiveCategory] = useState<EquippableCategory>("EQUIPMENT")
  const activeItems = byCategory[activeCategory]

  const errorMsg = equip.error?.message ?? unequip.error?.message

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Equipment</h2>
          <p className="text-xs text-muted-foreground">{animal.name}</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Body — two columns */}
      <div className="grid max-h-[70vh] grid-cols-[220px_1fr] divide-x divide-border overflow-hidden">

        {/* Left — currently equipped */}
        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Equipped</p>
          {animal.equipment.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">Nothing equipped yet.</p>
          ) : (
            <div className="space-y-2">
              {animal.equipment.map((eq: AnimalProfile["equipment"][number]) => (
                <div
                  key={eq.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 text-chart-2" />
                    <span className="text-xs font-medium text-foreground">{eq.itemDef.name}</span>
                  </div>
                  <button
                    type="button"
                    title="Unequip"
                    disabled={unequip.isPending}
                    onClick={() => unequip.mutate({ equipmentId: eq.id, playerAccountId })}
                    className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — inventory with category tabs */}
        <div className="flex min-h-0 flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-border/50 px-5">
            <div className="flex">
              {EQUIPPABLE_CATEGORIES.map((cat) => {
                const count = byCategory[cat].length
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors",
                      activeCategory === cat
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {CATEGORY_LABEL[cat]}
                    {count > 0 && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                        activeCategory === cat ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <Link to="/shop" className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground">
              <ShoppingBag className="size-3" />
              Shop
            </Link>
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {inventory === undefined ? null : activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Package className="mb-3 size-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  {availableTabs.length === 0 ? "No items in inventory." : `No ${CATEGORY_LABEL[activeCategory].toLowerCase()} items.`}
                </p>
                <Link to="/shop" className="mt-1 text-xs text-primary hover:underline">Visit the shop</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {activeItems.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold leading-snug text-foreground">{inv.itemDef.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">×{inv.quantity}</p>
                    </div>
                    <ActionButton
                      variant="soft"
                      className="w-full py-2 text-xs font-semibold"
                      disabled={equip.isPending}
                      onClick={() => equip.mutate({ animalId: animal.id, playerAccountId, itemDefId: inv.itemDef.id })}
                    >
                      Equip
                    </ActionButton>
                  </div>
                ))}
              </div>
            )}
            {errorMsg && <p className="mt-3 text-xs text-destructive">{errorMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
