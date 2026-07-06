import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const COST_TYPES = ["FREE", "CURRENCY", "ITEM"] as const
type CostType = typeof COST_TYPES[number]

type CareActionForm = {
  id?: string
  name: string
  costType: CostType
  currencyAmount: string
  careScoreGain: string
  energyRestore: string
  moodBoost: string
}

const emptyCareAction = (): CareActionForm => ({
  name: "",
  costType: "FREE",
  currencyAmount: "",
  careScoreGain: "0",
  energyRestore: "0",
  moodBoost: "0",
})

type ItemRow = { itemDefId: string; quantity: string }
const emptyItem = (): ItemRow => ({ itemDefId: "", quantity: "1" })

type LongTermRow = { name: string; intervalCycles: string; gracePeriodCycles: string }
const emptyLongTerm = (): LongTermRow => ({ name: "", intervalCycles: "", gracePeriodCycles: "0" })

function CareActionsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: actions } = trpc.admin.care.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: longTermDefs } = trpc.admin.care.listLongTerm.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: itemDefs } = trpc.admin.item.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const itemOptions = (itemDefs ?? []) as Array<{ id: string; name: string }>

  const utils = trpc.useUtils()

  const saveAction = trpc.admin.care.save.useMutation({
    onSuccess: () => utils.admin.care.list.invalidate(),
  })
  const removeAction = trpc.admin.care.remove.useMutation({
    onSuccess: () => {
      utils.admin.care.list.invalidate()
      setEditing(null)
    },
  })
  const saveLongTerm = trpc.admin.care.saveLongTerm.useMutation({
    onSuccess: () => {
      utils.admin.care.listLongTerm.invalidate()
      setEditingLongTermId(null)
      setEditingLongTerm(null)
    },
  })
  const removeLongTerm = trpc.admin.care.removeLongTerm.useMutation({
    onSuccess: () => utils.admin.care.listLongTerm.invalidate(),
  })

  const [editing, setEditing] = useState<CareActionForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const [editingLongTermId, setEditingLongTermId] = useState<string | null>(null)
  const [editingLongTerm, setEditingLongTerm] = useState<LongTermRow | null>(null)

  const { data: actionItems } = trpc.admin.care.listItems.useQuery(
    { careActionDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveItem = trpc.admin.care.saveItem.useMutation({
    onSuccess: () => {
      utils.admin.care.listItems.invalidate({ careActionDefId: editing?.id })
      utils.admin.care.list.invalidate()
      setEditingItemId(null)
      setEditingItem(null)
      setNewItem(emptyItem())
    },
  })
  const removeItem = trpc.admin.care.removeItem.useMutation({
    onSuccess: () => {
      utils.admin.care.listItems.invalidate({ careActionDefId: editing?.id })
      utils.admin.care.list.invalidate()
    },
  })

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [newItem, setNewItem] = useState<ItemRow>(emptyItem())

  function openEdit(action: NonNullable<typeof actions>[number]) {
    setEditing({
      id: action.id,
      name: action.name,
      costType: action.costType,
      currencyAmount: action.currencyAmount?.toString() ?? "",
      careScoreGain: action.careScoreGain.toString(),
      energyRestore: action.energyRestore.toString(),
      moodBoost: action.moodBoost.toString(),
    })
    setFormExpanded(true)
    setEditingItemId(null)
    setEditingItem(null)
    setNewItem(emptyItem())
  }

  function submitAction() {
    if (!editing || !gameId) return
    saveAction.mutate(
      {
        id: editing.id,
        gameId,
        name: editing.name,
        costType: editing.costType,
        currencyAmount: editing.currencyAmount ? parseInt(editing.currencyAmount) : null,
        careScoreGain: parseFloat(editing.careScoreGain) || 0,
        energyRestore: parseFloat(editing.energyRestore) || 0,
        moodBoost: parseFloat(editing.moodBoost) || 0,
      },
      {
        onSuccess: (saved) => {
          setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
          setFormExpanded(false)
        },
      }
    )
  }

  function submitItem(id?: string) {
    const item = id ? editingItem : newItem
    if (!item || !editing?.id || !item.itemDefId) return
    saveItem.mutate({
      id,
      careActionDefId: editing.id,
      itemDefId: item.itemDefId,
      quantity: parseInt(item.quantity) || 1,
    })
  }

  function submitLongTerm() {
    if (!editingLongTerm || !gameId || !editingLongTerm.name.trim() || !editingLongTerm.intervalCycles) return
    saveLongTerm.mutate({
      id: editingLongTermId ?? undefined,
      gameId,
      name: editingLongTerm.name.trim(),
      intervalCycles: parseInt(editingLongTerm.intervalCycles),
      gracePeriodCycles: parseInt(editingLongTerm.gracePeriodCycles) || 0,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Care Action"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Care Action Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>Edit Details</Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cost Type</label>
                  <select
                    value={editing.costType}
                    onChange={(e) => setEditing({ ...editing, costType: e.target.value as CostType })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="FREE">Free</option>
                    <option value="CURRENCY">Currency</option>
                    <option value="ITEM">Item</option>
                  </select>
                </div>
                {editing.costType === "CURRENCY" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Currency Amount</label>
                    <Input
                      type="number"
                      min="0"
                      value={editing.currencyAmount}
                      onChange={(e) => setEditing({ ...editing, currencyAmount: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Care Score Gain</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.careScoreGain}
                    onChange={(e) => setEditing({ ...editing, careScoreGain: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Energy Restore</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.energyRestore}
                    onChange={(e) => setEditing({ ...editing, energyRestore: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mood Boost</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.moodBoost}
                    onChange={(e) => setEditing({ ...editing, moodBoost: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitAction} disabled={saveAction.isPending || !editing.name.trim()}>Save</Button>
                {editing.id && (
                  <Button variant="ghost" onClick={() => setFormExpanded(false)}>Cancel</Button>
                )}
              </div>
              {saveAction.error && <p className="text-sm text-destructive">{saveAction.error.message}</p>}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {editing.name}</p>
              <p>
                <span className="text-muted-foreground">Cost Type:</span> {editing.costType}
                {editing.costType === "CURRENCY" && editing.currencyAmount ? ` (${editing.currencyAmount})` : ""}
              </p>
              <p><span className="text-muted-foreground">Care Score Gain:</span> {editing.careScoreGain}</p>
              <p><span className="text-muted-foreground">Energy Restore:</span> {editing.energyRestore}</p>
              <p><span className="text-muted-foreground">Mood Boost:</span> {editing.moodBoost}</p>
            </div>
          )}
        </section>

        {editing.id && editing.costType === "ITEM" && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Required Items</h2>
            </header>
            {!itemOptions.length ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No items configured yet. Set up Items in the Economy section first.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actionItems?.map((item: NonNullable<typeof actionItems>[number]) =>
                    editingItemId === item.id ? (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <select
                            value={editingItem?.itemDefId ?? ""}
                            onChange={(e) => setEditingItem((p) => p ? { ...p, itemDefId: e.target.value } : null)}
                            className="h-7 rounded border border-input bg-background px-2 text-xs"
                          >
                            {itemOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={editingItem?.quantity ?? "1"}
                            onChange={(e) => setEditingItem((p) => p ? { ...p, quantity: e.target.value } : null)}
                            className="h-7 text-sm w-24"
                          />
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" onClick={() => submitItem(item.id)} disabled={saveItem.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(null); setEditingItem(null) }}>Cancel</Button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{item.itemDef.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.quantity}</td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingItemId(item.id)
                            setEditingItem({ itemDefId: item.itemDefId, quantity: item.quantity.toString() })
                          }}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            onClick={() => removeItem.mutate({ id: item.id })}>Delete</Button>
                        </td>
                      </tr>
                    )
                  )}
                  <tr>
                    <td className="px-4 py-3">
                      <select
                        value={newItem.itemDefId}
                        onChange={(e) => setNewItem({ ...newItem, itemDefId: e.target.value })}
                        className="h-7 rounded border border-input bg-background px-2 text-xs"
                      >
                        <option value="">Select item…</option>
                        {itemOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="1"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                        className="h-7 text-sm w-24"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => submitItem()} disabled={!newItem.itemDefId || saveItem.isPending}>Add</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeAction.error && <p className="text-sm text-destructive">{removeAction.error.message}</p>}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this care action?")) return
                removeAction.mutate({ id: editing.id! })
              }}
              disabled={removeAction.isPending}
            >
              Delete Care Action
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Care Actions</h1>
          <Button onClick={() => { setEditing(emptyCareAction()); setFormExpanded(true) }}>+ New Care Action</Button>
        </div>
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score Gain</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actions?.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{a.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.costType}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.careScoreGain}</td>
                  <td className="px-4 py-2 text-center text-muted-foreground">{a._count.items}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {actions?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No care actions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Long-term Care Actions</h2>
            <Button size="sm" onClick={() => { setEditingLongTerm(emptyLongTerm()); setEditingLongTermId(null) }}>
              + New Long-term Care Action
            </Button>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interval (cycles)</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grace Period (cycles)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {longTermDefs?.map((lt: NonNullable<typeof longTermDefs>[number]) => (
                <tr key={lt.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{lt.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lt.intervalCycles}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lt.gracePeriodCycles}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingLongTermId(lt.id)
                      setEditingLongTerm({ name: lt.name, intervalCycles: lt.intervalCycles.toString(), gracePeriodCycles: lt.gracePeriodCycles.toString() })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this long-term care action?")) return
                        removeLongTerm.mutate({ id: lt.id })
                      }}>Delete</Button>
                  </td>
                </tr>
              ))}
              {longTermDefs?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No long-term care actions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {editingLongTerm !== null && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                {editingLongTermId ? "Edit Long-term Care Action" : "New Long-term Care Action"}
              </h2>
            </header>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editingLongTerm.name}
                  onChange={(e) => setEditingLongTerm({ ...editingLongTerm, name: e.target.value })}
                  placeholder="e.g. Vaccination"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Interval (cycles)</label>
                  <Input
                    type="number"
                    min="1"
                    value={editingLongTerm.intervalCycles}
                    onChange={(e) => setEditingLongTerm({ ...editingLongTerm, intervalCycles: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Grace Period (cycles)</label>
                  <Input
                    type="number"
                    min="0"
                    value={editingLongTerm.gracePeriodCycles}
                    onChange={(e) => setEditingLongTerm({ ...editingLongTerm, gracePeriodCycles: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={submitLongTerm}
                  disabled={saveLongTerm.isPending || !editingLongTerm.name.trim() || !editingLongTerm.intervalCycles}
                >
                  Save
                </Button>
                <Button variant="ghost" onClick={() => { setEditingLongTermId(null); setEditingLongTerm(null) }}>
                  Cancel
                </Button>
              </div>
              {saveLongTerm.error && <p className="text-sm text-destructive">{saveLongTerm.error.message}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/care-actions")({
  component: CareActionsPage,
})
