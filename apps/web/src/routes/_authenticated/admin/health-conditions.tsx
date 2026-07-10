import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ConditionForm = {
  id?: string
  name: string
  conditionType: "ILLNESS" | "INJURY"
  isGenetic: boolean
  isFatal: boolean
  moodEffect: string
}

const emptyCondition = (): ConditionForm => ({ name: "", conditionType: "ILLNESS", isGenetic: false, isFatal: false, moodEffect: "" })

type BehaviorRow = { symptomText: string; careActionDefId: string }
const emptyBehavior = (): BehaviorRow => ({ symptomText: "", careActionDefId: "" })

function HealthConditionsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: conditions } = trpc.admin.health.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: careActions } = trpc.admin.care.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const utils = trpc.useUtils()

  const saveCondition = trpc.admin.health.save.useMutation({
    onSuccess: () => utils.admin.health.list.invalidate(),
  })
  const removeCondition = trpc.admin.health.remove.useMutation({
    onSuccess: () => {
      utils.admin.health.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<ConditionForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  const { data: behaviors } = trpc.admin.health.listBehaviors.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveBehavior = trpc.admin.health.saveBehavior.useMutation({
    onSuccess: () => {
      utils.admin.health.listBehaviors.invalidate({ conditionDefId: editing?.id })
      utils.admin.health.list.invalidate()
      setEditingBehaviorId(null)
      setEditingBehavior(null)
      setNewBehavior(emptyBehavior())
    },
  })
  const removeBehavior = trpc.admin.health.removeBehavior.useMutation({
    onSuccess: () => {
      utils.admin.health.listBehaviors.invalidate({ conditionDefId: editing?.id })
      utils.admin.health.list.invalidate()
    },
  })

  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editingBehavior, setEditingBehavior] = useState<BehaviorRow | null>(null)
  const [newBehavior, setNewBehavior] = useState<BehaviorRow>(emptyBehavior())

  function openEdit(condition: NonNullable<typeof conditions>[number]) {
    setEditing({ id: condition.id, name: condition.name, conditionType: condition.conditionType, isGenetic: condition.isGenetic, isFatal: condition.isFatal, moodEffect: condition.moodEffect?.toString() ?? "" })
    setFormExpanded(false)
    setEditingBehaviorId(null)
    setEditingBehavior(null)
    setNewBehavior(emptyBehavior())
  }

  function submitCondition() {
    if (!editing || !gameId) return
    saveCondition.mutate(
      { id: editing.id, gameId, name: editing.name, conditionType: editing.conditionType, isGenetic: editing.isGenetic, isFatal: editing.isFatal, moodEffect: editing.moodEffect !== "" ? parseFloat(editing.moodEffect) : null },
      {
        onSuccess: (saved) => {
          setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
          setFormExpanded(false)
        },
      }
    )
  }

  function submitBehavior(id?: string) {
    const form = id ? editingBehavior : newBehavior
    if (!form || !editing?.id || !form.symptomText.trim()) return
    saveBehavior.mutate({
      id,
      conditionDefId: editing.id,
      symptomText: form.symptomText.trim(),
      careActionDefId: form.careActionDefId || null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Health Condition"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Condition Details</h2>
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
              <div className="max-w-xs">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select
                  value={editing.conditionType}
                  onChange={(e) => setEditing({ ...editing, conditionType: e.target.value as "ILLNESS" | "INJURY" })}
                  className="mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm"
                >
                  <option value="ILLNESS">Illness</option>
                  <option value="INJURY">Injury</option>
                </select>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isGenetic}
                    onChange={(e) => setEditing({ ...editing, isGenetic: e.target.checked })}
                  />
                  Genetic
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isFatal}
                    onChange={(e) => setEditing({ ...editing, isFatal: e.target.checked })}
                  />
                  Fatal
                </label>
              </div>
              <div className="max-w-xs">
                <label className="text-xs font-medium text-muted-foreground">Mood Effect <span className="font-normal">(optional)</span></label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.moodEffect}
                  onChange={(e) => setEditing({ ...editing, moodEffect: e.target.value })}
                  placeholder="e.g. -0.2"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitCondition} disabled={saveCondition.isPending || !editing.name.trim()}>Save</Button>
                {editing.id && <Button variant="ghost" onClick={() => setFormExpanded(false)}>Cancel</Button>}
              </div>
              {saveCondition.error && <p className="text-sm text-destructive">{saveCondition.error.message}</p>}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {editing.name}</p>
              <div className="flex gap-4">
                <p><span className="text-muted-foreground">Type:</span> {editing.conditionType === "ILLNESS" ? "Illness" : "Injury"}</p>
                <p><span className="text-muted-foreground">Genetic:</span> {editing.isGenetic ? "Yes" : "No"}</p>
                <p><span className="text-muted-foreground">Fatal:</span> {editing.isFatal ? "Yes" : "No"}</p>
              </div>
            </div>
          )}
        </section>

        {editing.id && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Behaviors & Symptoms</h2>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Symptom Text</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked Care Action</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {behaviors?.map((b: NonNullable<typeof behaviors>[number]) =>
                  editingBehaviorId === b.id ? (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <Input
                          value={editingBehavior?.symptomText ?? ""}
                          onChange={(e) => setEditingBehavior((p) => p ? { ...p, symptomText: e.target.value } : null)}
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editingBehavior?.careActionDefId ?? ""}
                          onChange={(e) => setEditingBehavior((p) => p ? { ...p, careActionDefId: e.target.value } : null)}
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                        >
                          <option value="">None</option>
                          {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <Button size="sm" onClick={() => submitBehavior(b.id)} disabled={saveBehavior.isPending}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingBehaviorId(null); setEditingBehavior(null) }}>Cancel</Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">{b.symptomText}</td>
                      <td className="px-4 py-2 text-muted-foreground">{b.careActionDef?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingBehaviorId(b.id)
                          setEditingBehavior({ symptomText: b.symptomText, careActionDefId: b.careActionDefId ?? "" })
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => removeBehavior.mutate({ id: b.id })}>Delete</Button>
                      </td>
                    </tr>
                  )
                )}
                <tr>
                  <td className="px-4 py-3">
                    <Input
                      value={newBehavior.symptomText}
                      onChange={(e) => setNewBehavior({ ...newBehavior, symptomText: e.target.value })}
                      placeholder="e.g. Animal appears lethargic"
                      onKeyDown={(e) => e.key === "Enter" && submitBehavior()}
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={newBehavior.careActionDefId}
                      onChange={(e) => setNewBehavior({ ...newBehavior, careActionDefId: e.target.value })}
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">None</option>
                      {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => submitBehavior()} disabled={!newBehavior.symptomText.trim() || saveBehavior.isPending}>Add</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeCondition.error && <p className="text-sm text-destructive">{removeCondition.error.message}</p>}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this health condition? This will also remove all its behaviors and treatments.")) return
                removeCondition.mutate({ id: editing.id! })
              }}
              disabled={removeCondition.isPending}
            >
              Delete Condition
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Health Conditions</h1>
        <Button onClick={() => { setEditing(emptyCondition()); setFormExpanded(true) }}>+ New Condition</Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Genetic</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fatal</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behaviors</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {conditions?.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.conditionType === "ILLNESS" ? "Illness" : "Injury"}</td>
                <td className="px-4 py-2 text-center">
                  {c.isGenetic ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {c.isFatal ? <span className="text-destructive">✓</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-center text-muted-foreground">{c._count.behaviors}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                </td>
              </tr>
            ))}
            {conditions?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No health conditions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/health-conditions")({
  component: HealthConditionsPage,
})
