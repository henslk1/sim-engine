import { useState } from "react"
import { Pin, Package, LayoutGrid, Pencil, Users, Stethoscope, Store, Gift } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { Input } from "@/components/ui/input"

type Props = {
  animal: { 
    id: string 
    name: string 
    isPinned: boolean 
    subContainerId: string | null
    playerAccount: { id: string } 
    game: { gameConfig: { subContainerLabel: string | null } | null} 
  }
}

export function OwnerActionList({ animal }: Props) {
  const utils = trpc.useUtils()
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(animal.name)

  const updatedName = trpc.animal.updateName.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })
  const togglePin = trpc.animal.togglePin.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })

  const { data: subContainers } = trpc.player.listSubContainers.useQuery(
    { playerAccountId: animal.playerAccount.id }
  )

  const moveToSubContainer = trpc.animal.moveToSubContainer.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })

  function commitRename() {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== animal.name) {
      updatedName.mutate({ animalId: animal.id, name: trimmed })
    }
    setRenaming(false)
  }

  return (
    <>
    
      {/* Rename */}
      {renaming ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <Pencil className="size-5 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            className="flex-1 h-7 text-sm"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") { setNameInput(animal.name); setRenaming(false) }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setNameInput(animal.name); setRenaming(true) }}
          className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="size-5 shring-0 text-muted-foreground" />
            <span className="flex-1">Rename {animal.name}</span>
          </button>
      )}

      {/* Pin */}
      <button
        type="button"
        onClick={() => togglePin.mutate({ animalId: animal.id })}
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pin className={`size-5 shrin-0 ${animal.isPinned ? "text-amber-500" : "text-muted-foreground"}`} />
        <span className="flex-1">{animal.isPinned ? "Unpin Animal" : "Pin Animal"}</span>
      </button>

      {/* Follow - stub */}
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Users className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">Follow</span>
      </button>

      {/* Move to Sub-Container — stub until container system */}
      <div className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-foreground">
        <LayoutGrid className="size-5 shrink-0 text-muted-foreground" />
        <span className="shrink-0">Move to {animal.game.gameConfig?.subContainerLabel ?? "Sub-Container"}</span>
        <select
          className="ml-auto flex-1 min-w-0 bg-transparent text-right text-sm text-muted-foreground outline-none"
          defaultValue={animal.subContainerId ?? ""}
          onChange={(e) => moveToSubContainer.mutate({ animalId: animal.id, subContainerId: e.target.value || null })}
        >
          <option value="">None</option>
          {subContainers?.map((sc) => (
            <option key={sc.id} value={sc.id}>{sc.name}</option>
          ))}
        </select>
      </div>

      {/* Equip / Unequip — stub until inventory modal */}
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Package className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">Equip / Unequip Item</span>
      </button>

      {/* Visit Vet — leads to other page */}
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Stethoscope className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">Visit Vet</span>
      </button>

      {/* List on Marketplace — leads to other page */}
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Store className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">List on Marketplace</span>
      </button>

      {/* Gift Animal — leads to other page */}
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Gift className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">Gift Animal</span>
      </button>

    </>
  )

}