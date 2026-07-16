import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, ActionButton } from "@/components/game/ui"
import { Package, ShoppingBag, X } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"

export function EquippedPanel({ animal, playerAccountId }: { animal: AnimalProfile; playerAccountId: string }) {
  const utils = trpc.useUtils()

  const { data: inventory } = trpc.inventory.mine.useQuery({ playerAccountId }, { enabled: !!playerAccountId })

  const invalidate = () => {
    utils.animalProfile.get.invalidate({ animalId: animal.id })
    utils.inventory.mine.invalidate({ playerAccountId })
  }

  const equip = trpc.inventory.equip.useMutation({ onSuccess: invalidate })
  const unequip = trpc.inventory.unequip.useMutation({ onSuccess: invalidate })

  const [showEquipPicker, setShowEquipPicker] = useState(false)

  const equipableItems = inventory?.filter(
    (inv) =>
      inv.itemDef.itemType === "EQUIPMENT" &&
      !animal.equipment.some((eq) => eq.itemDefId === inv.itemDef.id)
  ) ?? []

  return (
    <Panel
      title="Equipped"
      icon={<Package className="size-4 text-muted-foreground" />}
      action={
        <Link to="/shop">
          <ActionButton variant="soft" className="h-6 px-2 text-[11px]">
            <ShoppingBag className="size-3" /> Shop
          </ActionButton>
        </Link>
      }
    >
      {animal.equipment.length === 0 && !showEquipPicker ? (
        <p className="text-[11px] text-muted-foreground">No items equipped</p>
      ) : (
        <div className="space-y-1.5">
          {animal.equipment.map((eq: AnimalProfile["equipment"][number]) => (
            <div
              key={eq.id}
              className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
            >
              <span className="text-xs font-semibold text-foreground">{eq.itemDef.name}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Unequip"
                  disabled={unequip.isPending}
                  onClick={() => unequip.mutate({ equipmentId: eq.id, playerAccountId })}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {unequip.error && <p className="mt-1 text-xs text-destructive">{unequip.error.message}</p>}

      {equipableItems.length > 0 && !showEquipPicker && (
        <ActionButton
          variant="soft"
          className="mt-2 h-6 w-full text-[11px]"
          onClick={() => setShowEquipPicker(true)}
        >
          + Equip Item
        </ActionButton>
      )}

      {showEquipPicker && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Choose item to equip</p>
          {equipableItems.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No equipment in inventory.</p>
          ) : (
            equipableItems.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                <span className="text-xs font-semibold text-foreground">{inv.itemDef.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">×{inv.quantity}</span>
                  <ActionButton
                    variant="soft"
                    className="h-5 px-1.5 text-[10px]"
                    disabled={equip.isPending}
                    onClick={() =>
                      equip.mutate({ animalId: animal.id, playerAccountId, itemDefId: inv.itemDef.id }, {
                        onSuccess: () => setShowEquipPicker(false),
                      })
                    }
                  >
                    Equip
                  </ActionButton>
                </div>
              </div>
            ))
          )}
          {equip.error && <p className="text-xs text-destructive">{equip.error.message}</p>}
          <ActionButton variant="ghost" className="h-5 w-full text-[10px]" onClick={() => setShowEquipPicker(false)}>
            Cancel
          </ActionButton>
        </div>
      )}
    </Panel>
  )
}
