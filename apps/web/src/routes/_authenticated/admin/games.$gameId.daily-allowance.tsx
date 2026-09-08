import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/daily-allowance")({
  component: DailyAllowancePage,
})

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border bg-secondary/40 px-3 py-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function DailyAllowancePage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()
  const invalidateCurrencies = () => utils.admin.game.listDailyAllowanceCurrencies.invalidate({ gameId })
  const invalidateItems = () => utils.admin.game.listDailyAllowanceItems.invalidate({ gameId })

  const { data: currencyRows } = trpc.admin.game.listDailyAllowanceCurrencies.useQuery({ gameId })
  const { data: itemRows } = trpc.admin.game.listDailyAllowanceItems.useQuery({ gameId })
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId })
  const { data: items } = trpc.admin.item.list.useQuery({ gameId })

  const upsertCurrency = trpc.admin.game.upsertDailyAllowanceCurrency.useMutation({ onSuccess: () => { invalidateCurrencies(); setCurrencyForm(emptyCurrencyForm()) } })
  const deleteCurrency = trpc.admin.game.deleteDailyAllowanceCurrency.useMutation({ onSuccess: invalidateCurrencies })
  const upsertItem = trpc.admin.game.upsertDailyAllowanceItem.useMutation({ onSuccess: () => { invalidateItems(); setItemForm(emptyItemForm()) } })
  const deleteItem = trpc.admin.game.deleteDailyAllowanceItem.useMutation({ onSuccess: invalidateItems })

  const emptyCurrencyForm = () => ({ currencyDefId: "", amount: "0", subscriberOnly: false })
  const emptyItemForm = () => ({ itemDefId: "", quantity: "1", subscriberOnly: false })

  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm())
  const [editingCurrencyId, setEditingCurrencyId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState(emptyItemForm())
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  const usedCurrencyKeys = new Set((currencyRows ?? []).map((r) => `${r.currencyDef.id}:${r.subscriberOnly}`))
  const usedItemIds = new Set((itemRows ?? []).map((r) => r.itemDef.id))

  const availableCurrencies = (currencies ?? []).filter((c) => {
    const key = `${c.id}:${currencyForm.subscriberOnly}`
    if (editingCurrencyId && currencyForm.currencyDefId === c.id) return true
    return !usedCurrencyKeys.has(key)
  })

  const availableItems = (items ?? []).filter((i) => {
    if (editingItemId && itemForm.itemDefId === i.id) return true
    return !usedItemIds.has(i.id)
  })

  function startEditCurrency(row: NonNullable<typeof currencyRows>[number]) {
    setEditingCurrencyId(row.id)
    setCurrencyForm({ currencyDefId: row.currencyDef.id, amount: String(row.amount), subscriberOnly: row.subscriberOnly })
  }

  function submitCurrency() {
    const amount = parseInt(currencyForm.amount)
    if (!currencyForm.currencyDefId || isNaN(amount)) return
    upsertCurrency.mutate({ id: editingCurrencyId ?? undefined, gameId, currencyDefId: currencyForm.currencyDefId, amount, subscriberOnly: currencyForm.subscriberOnly })
    setEditingCurrencyId(null)
  }

  function startEditItem(row: NonNullable<typeof itemRows>[number]) {
    setEditingItemId(row.id)
    setItemForm({ itemDefId: row.itemDef.id, quantity: String(row.quantity), subscriberOnly: row.subscriberOnly })
  }

  function submitItem() {
    const quantity = parseInt(itemForm.quantity)
    if (!itemForm.itemDefId || isNaN(quantity) || quantity < 1) return
    upsertItem.mutate({ id: editingItemId ?? undefined, gameId, itemDefId: itemForm.itemDefId, quantity, subscriberOnly: itemForm.subscriberOnly })
    setEditingItemId(null)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-xl font-semibold text-foreground">Daily Allowance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Granted when a player logs in on a new day. Subscriber-only rows are additional — subscribers receive both the open rows and the subscriber-only rows.</p>
      </div>

      {/* Currency section */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency</h2>
        <Section title={editingCurrencyId ? "Edit Currency Grant" : "Add Currency Grant"}>
          <div className="p-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Currency</label>
              <select
                value={currencyForm.currencyDefId}
                onChange={(e) => setCurrencyForm((f) => ({ ...f, currencyDefId: e.target.value }))}
                disabled={!!editingCurrencyId}
                className="h-8 w-44 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {availableCurrencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Amount</label>
              <Input
                type="number" min="0" step="1"
                className="h-8 w-28 text-sm"
                value={currencyForm.amount}
                onChange={(e) => setCurrencyForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-1.5 pb-1 cursor-pointer text-sm text-foreground">
              <input
                type="checkbox"
                checked={currencyForm.subscriberOnly}
                disabled={!!editingCurrencyId}
                onChange={(e) => setCurrencyForm((f) => ({ ...f, subscriberOnly: e.target.checked }))}
              />
              Subscriber only
            </label>
            <div className="flex gap-2 pb-0.5">
              <Button className="h-8 text-sm" onClick={submitCurrency} disabled={upsertCurrency.isPending || !currencyForm.currencyDefId}>
                {upsertCurrency.isPending ? "Saving…" : editingCurrencyId ? "Update" : "Add"}
              </Button>
              {editingCurrencyId && (
                <Button variant="outline" className="h-8 text-sm" onClick={() => { setEditingCurrencyId(null); setCurrencyForm(emptyCurrencyForm()) }}>Cancel</Button>
              )}
            </div>
            {upsertCurrency.error && <p className="w-full text-sm text-destructive">{upsertCurrency.error.message}</p>}
          </div>
        </Section>

        <Section title="Currency Grants">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Currency</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subscriber Only</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!currencyRows?.length && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">No currency grants configured.</td></tr>
              )}
              {currencyRows?.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium text-foreground">{row.currencyDef.name}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.amount}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.subscriberOnly ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEditCurrency(row)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                      <button onClick={() => deleteCurrency.mutate({ id: row.id })} disabled={deleteCurrency.isPending} className="text-destructive hover:text-destructive/80 transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Item section */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</h2>
        <Section title={editingItemId ? "Edit Item Grant" : "Add Item Grant"}>
          <div className="p-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Item</label>
              <select
                value={itemForm.itemDefId}
                onChange={(e) => setItemForm((f) => ({ ...f, itemDefId: e.target.value }))}
                disabled={!!editingItemId}
                className="h-8 w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select item…</option>
                {availableItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quantity</label>
              <Input
                type="number" min="1" step="1"
                className="h-8 w-24 text-sm"
                value={itemForm.quantity}
                onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-1.5 pb-1 cursor-pointer text-sm text-foreground">
              <input
                type="checkbox"
                checked={itemForm.subscriberOnly}
                disabled={!!editingItemId}
                onChange={(e) => setItemForm((f) => ({ ...f, subscriberOnly: e.target.checked }))}
              />
              Subscriber only
            </label>
            <div className="flex gap-2 pb-0.5">
              <Button className="h-8 text-sm" onClick={submitItem} disabled={upsertItem.isPending || !itemForm.itemDefId}>
                {upsertItem.isPending ? "Saving…" : editingItemId ? "Update" : "Add"}
              </Button>
              {editingItemId && (
                <Button variant="outline" className="h-8 text-sm" onClick={() => { setEditingItemId(null); setItemForm(emptyItemForm()) }}>Cancel</Button>
              )}
            </div>
            {upsertItem.error && <p className="w-full text-sm text-destructive">{upsertItem.error.message}</p>}
          </div>
        </Section>

        <Section title="Item Grants">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantity</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subscriber Only</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!itemRows?.length && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">No item grants configured.</td></tr>
              )}
              {itemRows?.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium text-foreground">{row.itemDef.name}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.subscriberOnly ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEditItem(row)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                      <button onClick={() => deleteItem.mutate({ id: row.id })} disabled={deleteItem.isPending} className="text-destructive hover:text-destructive/80 transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  )
}
