import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ShopBreedForm = {
  breedId: string
  targetStock: string
  price: string
  currencyDefId: string
  gameShopFloor: string
  shopAlleleQualityBias: string
  isActive: boolean
}

const emptyForm = (): ShopBreedForm => ({
  breedId: "",
  targetStock: "10",
  price: "",
  currencyDefId: "",
  gameShopFloor: "0",
  shopAlleleQualityBias: "0",
  isActive: true,
})

function GameShopPage() {
  const { gameId } = Route.useParams()

  const { data: configs } = trpc.admin.gameShop.list.useQuery({ gameId: gameId! }, {})
  const { data: breeds } = trpc.admin.breed.list.useQuery({ gameId: gameId! }, {})
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId: gameId! }, {})

  const utils = trpc.useUtils()
  const invalidate = () => utils.admin.gameShop.list.invalidate({ gameId: gameId! })

  const save = trpc.admin.gameShop.save.useMutation({ onSuccess: () => { invalidate(); setEditingId(null); setForm(emptyForm()) } })
  const remove = trpc.admin.gameShop.remove.useMutation({ onSuccess: invalidate })
  const restock = trpc.admin.gameShop.restock.useMutation({ onSuccess: invalidate })
  const reset = trpc.admin.gameShop.reset.useMutation({ onSuccess: invalidate })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ShopBreedForm>(emptyForm())

  function submit() {
    if (!gameId || !form.breedId || !form.currencyDefId || form.price === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      breedId: form.breedId,
      targetStock: parseInt(form.targetStock),
      price: parseInt(form.price),
      currencyDefId: form.currencyDefId,
      gameShopFloor: parseFloat(form.gameShopFloor),
      shopAlleleQualityBias: parseFloat(form.shopAlleleQualityBias),
      isActive: form.isActive,
    })
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">Game Shop</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Configure which breeds are available in the game shop and at what price.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!gameId) return
              if (!confirm("Delete all current shop animals and restock from scratch?")) return
              reset.mutate({ gameId })
            }}
            disabled={reset.isPending || restock.isPending || !configs?.length}
          >
            {reset.isPending ? "Resetting…" : "Reset Shop"}
          </Button>
          <Button
            size="sm"
            onClick={() => gameId && restock.mutate({ gameId })}
            disabled={restock.isPending || reset.isPending || !configs?.length}
          >
            {restock.isPending ? "Restocking…" : "Restock Shop"}
          </Button>
          {restock.data && (
            <span className="text-sm text-muted-foreground">{restock.data.created} animal{restock.data.created !== 1 ? "s" : ""} created</span>
          )}
          {reset.data && (
            <span className="text-sm text-muted-foreground">{reset.data.deleted} removed · {reset.data.created} created</span>
          )}
          {(restock.error || reset.error) && (
            <span className="text-sm text-destructive">{restock.error?.message ?? reset.error?.message}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Breed Config" : "Add Breed"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Breed</label>
              <select
                value={form.breedId}
                onChange={(e) => setForm({ ...form, breedId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select breed —</option>
                {breeds?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
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
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Price</label>
              <Input type="number" min="0" className="h-8 text-sm" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 1000" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Target Stock</label>
              <Input type="number" min="0" className="h-8 text-sm" value={form.targetStock} onChange={(e) => setForm({ ...form, targetStock: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Shop Floor <span className="font-normal normal-case">(0–1)</span></label>
              <Input type="number" step="0.01" min="0" max="1" className="h-8 text-sm" value={form.gameShopFloor} onChange={(e) => setForm({ ...form, gameShopFloor: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele Quality Bias <span className="font-normal normal-case">(0–1)</span></label>
              <Input type="number" step="0.01" min="0" max="1" className="h-8 text-sm" value={form.shopAlleleQualityBias} onChange={(e) => setForm({ ...form, shopAlleleQualityBias: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !form.breedId || !form.currencyDefId || form.price === ""}>
                {save.isPending ? "Saving…" : editingId ? "Save" : "Add Breed"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(emptyForm()); setEditingId(null) }}>Cancel</Button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Breed Configurations</h2>
            <Button size="sm" variant="ghost" onClick={() => { setForm(emptyForm()); setEditingId(null) }}>+ Add Breed</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target Stock</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs?.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{c.breed.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.targetStock}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.price}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.currencyDef.symbol ?? c.currencyDef.name}</td>
                  <td className="px-3 py-2 text-center">{c.isActive ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(c.id)
                      setForm({
                        breedId: c.breed.id,
                        targetStock: c.targetStock.toString(),
                        price: c.price.toString(),
                        currencyDefId: c.currencyDef.id,
                        gameShopFloor: c.gameShopFloor.toString(),
                        shopAlleleQualityBias: c.shopAlleleQualityBias.toString(),
                        isActive: c.isActive,
                      })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Remove this breed from the shop?")) return; remove.mutate({ id: c.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {configs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No breeds configured yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/game-shop")({
  component: GameShopPage,
})
