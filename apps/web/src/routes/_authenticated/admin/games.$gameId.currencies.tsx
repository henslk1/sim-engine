import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const CURRENCY_TYPES = ["BASE", "PREMIUM", "PRESTIGE"] as const
type CurrencyType = typeof CURRENCY_TYPES[number]

type CurrencyForm = {
  name: string
  currencyType: CurrencyType
  symbol: string
}
const emptyForm = (): CurrencyForm => ({ name: "", currencyType: "BASE", symbol: "" })

function CurrenciesPage() {
  const { gameId } = Route.useParams()

  const { data: currencies } = trpc.admin.currency.list.useQuery(
    { gameId: gameId! }
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CurrencyForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.currency.save.useMutation({
    onSuccess: () => {
      utils.admin.currency.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.currency.remove.useMutation({
    onSuccess: () => {
      utils.admin.currency.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      currencyType: editing.currencyType,
      symbol: editing.symbol.trim() || null,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Currencies</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[280px_1fr] gap-2 items-start">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Currency" : "New Currency"}
            </h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Gold"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
              <select
                value={editing.currencyType}
                onChange={(e) => setEditing({ ...editing, currencyType: e.target.value as CurrencyType })}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CURRENCY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Symbol <span className="font-normal normal-case">(optional)</span></label>
              <Input
                className="h-8 text-sm"
                value={editing.symbol}
                onChange={(e) => setEditing({ ...editing, symbol: e.target.value })}
                placeholder="e.g. G, ₢"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-8 text-sm" onClick={submit} disabled={save.isPending || !editing.name.trim()}>Save</Button>
              {editingId && (
                <Button className="h-8 text-sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>Cancel</Button>
              )}
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Currency Definitions</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symbol</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currencies?.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.currencyType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.symbol ?? "—"}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(c.id)
                      setEditing({
                        name: c.name,
                        currencyType: c.currencyType as CurrencyType,
                        symbol: c.symbol ?? "",
                      })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this currency? This will fail if it has any balances or transactions.")) return; remove.mutate({ id: c.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {currencies?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No currencies defined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </div>
      </div>
    </div>
  </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/currencies")({
  component: CurrenciesPage,
})
