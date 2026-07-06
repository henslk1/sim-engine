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
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: currencies } = trpc.admin.currency.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CurrencyForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.currency.save.useMutation({
    onSuccess: () => {
      utils.admin.currency.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.currency.remove.useMutation({
    onSuccess: () => {
      utils.admin.currency.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      currencyType: editing.currencyType,
      symbol: editing.symbol.trim() || null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Currencies</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Currency Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Currency
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Symbol</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currencies?.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.currencyType}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.symbol ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
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
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No currencies defined yet.</td>
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
              {editingId ? "Edit Currency" : "Add Currency"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Gold"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select
                  value={editing.currencyType}
                  onChange={(e) => setEditing({ ...editing, currencyType: e.target.value as CurrencyType })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CURRENCY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Symbol <span className="font-normal">(optional)</span></label>
                <Input
                  value={editing.symbol}
                  onChange={(e) => setEditing({ ...editing, symbol: e.target.value })}
                  placeholder="e.g. G, ₢"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim()}
              >
                {editingId ? "Save" : "Add Currency"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
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

export const Route = createFileRoute("/_authenticated/admin/currencies")({
  component: CurrenciesPage,
})
