import {
  Users,
  Package,
  Trophy,
  Award,
  Stethoscope,
  Tag,
  Store,
  Gift,
  Skull,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const OWNER_ACTIONS: { Icon: LucideIcon; label: string }[] = [
  { Icon: Users, label: "Move to Group" },
  { Icon: Package, label: "Equip / Unequip Item" },
  { Icon: Trophy, label: "Enter in Competition" },
  { Icon: Award, label: "Create Stud Listing" },
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
      <div className="my-1.5 border-t border-border" />
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Skull className="size-4" />
        <span className="flex-1">Bury / Archive</span>
      </button>
    </>
  )
}
