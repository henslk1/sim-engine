import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const SHOP_TYPES = ["BASE", "PREMIUM", "VET"] as const
type ShopType = typeof SHOP_TYPES[number]

type ListingForm = {
  itemDefId: string
  shopType: ShopType
  price: string
  currencyDefId: string
  isActive: boolean
  isRotating: boolean
}

const emptyForm = (): ListingForm => ({
  itemDefId: "",
  shopType: "BASE",
  price: "",
  currencyDefId: "",
  isActive: true,
  isRotating: false,
})

function StoreListingsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: listings } = trpc.admin.storeListing.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: items } = trpc.admin.item.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const utils = trpc.useUtils()
  const invalidate = () => utils.admin.storeListing.list.invalidate({ gameId: gameId! })

  const save = trpc.admin.storeListing.save.useMutation({ onSuccess: () => { invalidate(); setEditingId(null); setForm(null) } })
  const remove = trpc.admin.storeListing.remove.useMutation({ onSuccess: invalidate })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ListingForm | null>(null)

  function submit() {
    if (!form || !gameId || !form.itemDefId || !form.currencyDefId || form.price === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      itemDefId: form.itemDefId,
      shopType: form.shopType,
      price: parseInt(form.price),
      currencyDefId: form.currencyDefId,
      isActive: form.isActive,
      isRotating: form.isRotating,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Store Listings</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Listings</h2>
          <Button size="sm" onClick={() => { setForm(emptyForm()); setEditingId(null) }}>+ Add Listing</Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shop</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rotating</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings?.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{l.itemDef.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.shopType}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.price}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.currencyDef.symbol ?? l.currencyDef.name}</td>
                <td className="px-3 py-2 text-center">{l.isActive ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{l.isRotating ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(l.id)
                    setForm({
                      itemDefId: l.itemDef.id,
                      shopType: l.shopType as ShopType,
                      price: l.price.toString(),
                      currencyDefId: l.currencyDef.id,
                      isActive: l.isActive,
                      isRotating: l.isRotating,
                    })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this listing?")) return; remove.mutate({ id: l.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {listings?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No listings defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {form && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Listing" : "Add Listing"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Item</label>
                <select
                  value={form.itemDefId}
                  onChange={(e) => setForm({ ...form, itemDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select item —</option>
                  {items?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Shop Type</label>
                <select
                  value={form.shopType}
                  onChange={(e) => setForm({ ...form, shopType: e.target.value as ShopType })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SHOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Price</label>
                <Input type="number" min="0" className="mt-1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 500" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Currency</label>
                <select
                  value={form.currencyDefId}
                  onChange={(e) => setForm({ ...form, currencyDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select currency —</option>
                  {currencies?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.symbol ? ` (${c.symbol})` : ""}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isRotating} onChange={(e) => setForm({ ...form, isRotating: e.target.checked })} />
                Rotating
              </label>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
            <div className="flex gap-2">
              <Button onClick={submit} disabled={save.isPending || !form.itemDefId || !form.currencyDefId || form.price === ""}>
                {save.isPending ? "Saving…" : editingId ? "Save" : "Add Listing"}
              </Button>
              <Button variant="ghost" onClick={() => { setForm(null); setEditingId(null) }}>Cancel</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/store-listings")({
  component: StoreListingsPage,
})
