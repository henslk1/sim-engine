import { LayoutGrid, Package, Baby, Stethoscope, Tag, Store, Gift } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const OWNER_ACTIONS: { Icon: LucideIcon; label: string }[] = [
  { Icon: LayoutGrid, label: "Move to Sub-Container" },
  { Icon: Package, label: "Equip / Unequip Item" },
  { Icon: Baby, label: "Breeding Listing" },
  { Icon: Stethoscope, label: "Visit Vet" },
  { Icon: Tag, label: "Brand this Animal" },
  { Icon: Store, label: "List on Marketplace" },
  { Icon: Gift, label: "Gift Animal" },
]

export function OwnerActionList() {
  return (
    <>
      {OWNER_ACTIONS.map(({ Icon, label }) => (
        <button
          key={label}
          type="button"
          disabled
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="size-4 text-muted-foreground" />
          <span className="flex-1">{label}</span>
        </button>
      ))}
    </>
  )
}
