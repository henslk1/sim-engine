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
  const { gameId } = Route.useParams()

  const { data: listings } = trpc.admin.storeListing.list.useQuery({ gameId: gameId! }, {})
  const { data: items } = trpc.admin.item.list.useQuery({ gameId: gameId! }, {})
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId: gameId! }, {})

  const utils = trpc.useUtils()
  const invalidate = () => utils.admin.storeListing.list.invalidate({ gameId: gameId! })

  const save = trpc.admin.storeListing.save.useMutation({ onSuccess: () => { invalidate(); setEditingId(null); setForm(emptyForm()) } })
  const remove = trpc.admin.storeListing.remove.useMutation({ onSuccess: invalidate })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ListingForm>(emptyForm())

  function submit() {
    if (!gameId || !form.itemDefId || !form.currencyDefId || form.price === "") return
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

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Store Listings</h1>

      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Listing" : "Add Listing"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Item</label>
              <select
                value={form.itemDefId}
                onChange={(e) => setForm({ ...form, itemDefId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select item —</option>
                {items?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Shop Type</label>
              <select
                value={form.shopType}
                onChange={(e) => setForm({ ...form, shopType: e.target.value as ShopType })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SHOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Price</label>
              <Input type="number" min="0" className="h-8 text-sm" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Currency</label>
              <select
                value={form.currencyDefId}
                onChange={(e) => setForm({ ...form, currencyDefId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select currency —</option>
                {currencies?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.symbol ? ` (${c.symbol})` : ""}</option>)}
              </select>
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
              <Button size="sm" onClick={submit} disabled={save.isPending || !form.itemDefId || !form.currencyDefId || form.price === ""}>
                {save.isPending ? "Saving…" : editingId ? "Save" : "Add Listing"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(emptyForm()); setEditingId(null) }}>Cancel</Button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Listings</h2>
            <Button size="sm" variant="ghost" onClick={() => { setForm(emptyForm()); setEditingId(null) }}>+ New</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shop</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rotating</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
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
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/store-listings")({
  component: StoreListingsPage,
})
