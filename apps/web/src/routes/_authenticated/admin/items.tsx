import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ITEM_TYPES = ["OTC_MEDICATION", "CARE_CONSUMABLE", "EQUIPMENT", "DIRECT_EFFECT", "PERMANENT_APPLIED", "ANIMAL_SLOT_EXPAND", "SUBCONTAINER_EXPAND"] as const
const ITEM_CATEGORIES = ["AGING", "CARE", "HEALTH", "EQUIPMENT", "BREEDING", "STORAGE", "MISC"] as const
const EFFECT_TYPES = ["IMMORTALITY", "SEX_CHANGE", "FREE_AGING", "BREEDING_SLOT_RAISE", "ENERGY_MAX_RAISE", "TWIN_CHANCE_RAISE", "TWIN_GUARANTEE", "STAGE_SKIP"] as const

type ItemType = typeof ITEM_TYPES[number]
type ItemCategory = typeof ITEM_CATEGORIES[number]

type ItemForm = {
  name: string
  description: string
  itemType: ItemType
  category: ItemCategory
  effectType: string
  effects: string
  prizeEligible: boolean
  isSellable: boolean
}
const emptyForm = (): ItemForm => ({
  name: "",
  description: "",
  itemType: "CARE_CONSUMABLE",
  category: "CARE",
  effectType: "",
  effects: "",
  prizeEligible: true,
  isSellable: true,
})

function ItemsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: items } = trpc.admin.item.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ItemForm | null>(null)
  const [jsonError, setJsonError] = useState("")
  const utils = trpc.useUtils()

  const save = trpc.admin.item.save.useMutation({
    onSuccess: () => {
      utils.admin.item.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setJsonError("")
    },
  })
  const remove = trpc.admin.item.remove.useMutation({
    onSuccess: () => {
      utils.admin.item.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim()) return
    let effects: Record<string, unknown> | null = null
    if (editing.effects.trim()) {
      try {
        effects = JSON.parse(editing.effects.trim())
        setJsonError("")
      } catch {
        setJsonError("Effects must be valid JSON")
        return
      }
    }
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      itemType: editing.itemType,
      category: editing.category,
      effectType: (editing.effectType || null) as typeof EFFECT_TYPES[number] | null,
      effects,
      prizeEligible: editing.prizeEligible,
      isSellable: editing.isSellable,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Items</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Item Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null); setJsonError("") }}>
            + Add Item
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effect</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{item.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{item.itemType}</td>
                <td className="px-4 py-2 text-muted-foreground">{item.category}</td>
                <td className="px-4 py-2 text-muted-foreground">{item.effectType ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground space-x-1">
                  {item.prizeEligible && <span className="rounded bg-muted px-1 py-0.5 text-xs">prize</span>}
                  {item.isSellable && <span className="rounded bg-muted px-1 py-0.5 text-xs">sellable</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(item.id)
                    setEditing({
                      name: item.name,
                      description: item.description ?? "",
                      itemType: item.itemType as ItemType,
                      category: item.category as ItemCategory,
                      effectType: item.effectType ?? "",
                      effects: item.effects ? JSON.stringify(item.effects, null, 2) : "",
                      prizeEligible: item.prizeEligible,
                      isSellable: item.isSellable,
                    })
                    setJsonError("")
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this item? This will fail if it exists in any inventories or listings.")) return; remove.mutate({ id: item.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No items defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Item" : "Add Item"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Energy Potion"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description <span className="font-normal">(optional)</span></label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Item Type</label>
                <select
                  value={editing.itemType}
                  onChange={(e) => setEditing({ ...editing, itemType: e.target.value as ItemType, effectType: "" })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value as ItemCategory })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {editing.itemType === "PERMANENT_APPLIED" && (
              <div className="max-w-xs">
                <label className="text-xs font-medium text-muted-foreground">Effect Type</label>
                <select
                  value={editing.effectType}
                  onChange={(e) => setEditing({ ...editing, effectType: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Effects JSON <span className="font-normal">(optional)</span></label>
              <textarea
                value={editing.effects}
                onChange={(e) => { setEditing({ ...editing, effects: e.target.value }); setJsonError("") }}
                placeholder='e.g. {"energyRestore": 50}'
                rows={4}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {jsonError && <p className="mt-1 text-xs text-destructive">{jsonError}</p>}
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.prizeEligible}
                  onChange={(e) => setEditing({ ...editing, prizeEligible: e.target.checked })}
                  className="rounded border-input"
                />
                <span>Prize eligible</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isSellable}
                  onChange={(e) => setEditing({ ...editing, isSellable: e.target.checked })}
                  className="rounded border-input"
                />
                <span>Sellable</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim()}
              >
                {editingId ? "Save" : "Add Item"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null); setJsonError("") }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/items")({
  component: ItemsPage,
})
