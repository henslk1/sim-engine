import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ITEM_TYPES = ["OTC_MEDICATION", "CARE_CONSUMABLE", "EQUIPMENT", "DIRECT_EFFECT", "PERMANENT_APPLIED", "ANIMAL_SLOT_EXPAND", "SUBCONTAINER_EXPAND", "AGING_BASE", "AGING_PREMIUM"] as const
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
  const { gameId } = Route.useParams()

  const { data: items } = trpc.admin.item.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ItemForm>(emptyForm())
  const [jsonError, setJsonError] = useState("")
  const utils = trpc.useUtils()

  const save = trpc.admin.item.save.useMutation({
    onSuccess: () => {
      utils.admin.item.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
      setJsonError("")
    },
  })
  const remove = trpc.admin.item.remove.useMutation({
    onSuccess: () => {
      utils.admin.item.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.name.trim()) return
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

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Items</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Item" : "Add Item"}
            </h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Energy Potion"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Brief description"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Item Type</label>
              <select
                value={editing.itemType}
                onChange={(e) => setEditing({ ...editing, itemType: e.target.value as ItemType, effectType: "" })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Category</label>
              <select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value as ItemCategory })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {editing.itemType === "PERMANENT_APPLIED" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Effect Type</label>
                <select
                  value={editing.effectType}
                  onChange={(e) => setEditing({ ...editing, effectType: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Effects JSON</label>
              <textarea
                value={editing.effects}
                onChange={(e) => { setEditing({ ...editing, effects: e.target.value }); setJsonError("") }}
                placeholder='e.g. {"energyRestore": 50}'
                rows={3}
                className="block w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            </div>
            <div className="flex gap-4">
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
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !editing.name.trim()}>
                {editingId ? "Save" : "Add Item"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()); setJsonError("") }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item Definitions</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null); setJsonError("") }}>
              + New
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effect</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Flags</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.itemType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.category}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.effectType ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground space-x-1">
                    {item.prizeEligible && <span className="rounded bg-muted px-1 py-0.5 text-xs">prize</span>}
                    {item.isSellable && <span className="rounded bg-muted px-1 py-0.5 text-xs">sellable</span>}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
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
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No items defined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </section>
      </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/items")({
  component: ItemsPage,
})
