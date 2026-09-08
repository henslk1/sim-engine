import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/daily-allowance")({
  component: DailyAllowancePage,
})

type ItemRow = {
  id: string
  quantity: number
  subscriberOnly: boolean
  itemDef: { id: string; name: string }
}

function DailyAllowancePage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()
  const invalidate = () => utils.admin.game.listDailyAllowanceItems.invalidate({ gameId })

  const { data: rows } = trpc.admin.game.listDailyAllowanceItems.useQuery({ gameId })
  const { data: items } = trpc.admin.item.list.useQuery({ gameId })

  const upsert = trpc.admin.game.upsertDailyAllowanceItem.useMutation({ onSuccess: () => { invalidate(); setForm(empty()) } })
  const remove = trpc.admin.game.deleteDailyAllowanceItem.useMutation({ onSuccess: invalidate })

  const empty = () => ({ itemDefId: "", quantity: "1", subscriberOnly: false })
  const [form, setForm] = useState(empty())
  const [editingId, setEditingId] = useState<string | null>(null)

  const usedItemIds = new Set((rows ?? []).map((r) => r.itemDef.id))
  const availableItems = (items ?? []).filter((i) => {
    if (editingId) return i.id === form.itemDefId || !usedItemIds.has(i.id)
    return !usedItemIds.has(i.id)
  })

  function startEdit(row: ItemRow) {
    setEditingId(row.id)
    setForm({ itemDefId: row.itemDef.id, quantity: String(row.quantity), subscriberOnly: row.subscriberOnly })
  }

  function cancel() {
    setEditingId(null)
    setForm(empty())
  }

  function submit() {
    const qty = parseInt(form.quantity)
    if (!form.itemDefId || isNaN(qty) || qty < 1) return
    upsert.mutate({
      id: editingId ?? undefined,
      gameId,
      itemDefId: form.itemDefId,
      quantity: qty,
      subscriberOnly: form.subscriberOnly,
    })
    setEditingId(null)
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="font-serif text-xl font-semibold text-foreground">Daily Allowance Items</h1>
      <p className="text-sm text-muted-foreground">
        Items granted alongside the daily currency allowance when a player logs in on a new day. Currency amounts are configured in Game Config.
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-secondary/40 px-3 py-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {editingId ? "Edit Entry" : "Add Entry"}
          </h2>
        </div>
        <div className="p-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Item</label>
            <select
              value={form.itemDefId}
              onChange={(e) => setForm((f) => ({ ...f, itemDefId: e.target.value }))}
              className="h-8 w-56 rounded-md border border-input bg-background px-3 text-sm"
              disabled={!!editingId}
            >
              <option value="">Select item…</option>
              {availableItems.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quantity</label>
            <Input
              type="number"
              min="1"
              step="1"
              className="h-8 w-24 text-sm"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-1.5 pb-1 cursor-pointer text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.subscriberOnly}
              onChange={(e) => setForm((f) => ({ ...f, subscriberOnly: e.target.checked }))}
            />
            Subscriber only
          </label>
          <div className="flex gap-2 pb-0.5">
            <Button className="h-8 text-sm" onClick={submit} disabled={upsert.isPending || !form.itemDefId}>
              {upsert.isPending ? "Saving…" : editingId ? "Update" : "Add"}
            </Button>
            {editingId && (
              <Button variant="outline" className="h-8 text-sm" onClick={cancel}>Cancel</Button>
            )}
          </div>
          {upsert.error && <p className="w-full text-sm text-destructive">{upsert.error.message}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantity</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subscriber Only</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!rows?.length && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">No items configured.</td>
              </tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-medium text-foreground">{row.itemDef.name}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.quantity}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.subscriberOnly ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(row)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove.mutate({ id: row.id })}
                      className="text-destructive hover:text-destructive/80 transition-colors"
                      disabled={remove.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
