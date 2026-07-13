import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type DisciplineForm = {
  id?: string
  name: string
  description: string
  isConformation: boolean
}
const emptyDiscipline = (): DisciplineForm => ({ name: "", description: "", isConformation: false })

type WeightRow = { weight: string }
const emptyWeight = (): WeightRow => ({ weight: "" })

function DisciplinesPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: stats } = trpc.admin.stat.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: traits } = trpc.admin.personality.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: items } = trpc.admin.item.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const utils = trpc.useUtils()

  const saveDiscipline = trpc.admin.discipline.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.discipline.list.invalidate()
      setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
      setFormExpanded(false)
    },
  })
  const removeDiscipline = trpc.admin.discipline.remove.useMutation({
    onSuccess: () => {
      utils.admin.discipline.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<DisciplineForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  const { data: equipmentRequirements } = trpc.admin.discipline.listEquipmentRequirements.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveEquipReq = trpc.admin.discipline.saveEquipmentRequirement.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listEquipmentRequirements.invalidate({ disciplineDefId: editing?.id })
      setNewEquipReq({ itemDefId: "", quantity: "1" })
    },
  })
  const removeEquipReq = trpc.admin.discipline.removeEquipmentRequirement.useMutation({
    onSuccess: () => utils.admin.discipline.listEquipmentRequirements.invalidate({ disciplineDefId: editing?.id }),
  })

  const { data: statWeights } = trpc.admin.discipline.listStatWeights.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const { data: personalityWeights } = trpc.admin.discipline.listPersonalityWeights.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )

  const saveStatWeight = trpc.admin.discipline.saveStatWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listStatWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
      setNewStatWeight({ statDefId: "", weight: "" })
      setEditingStatWeightId(null)
      setEditingStatWeight(emptyWeight())
    },
  })
  const removeStatWeight = trpc.admin.discipline.removeStatWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listStatWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
    },
  })

  const savePersonalityWeight = trpc.admin.discipline.savePersonalityWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listPersonalityWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
      setNewPersonalityWeight({ traitDefId: "", weight: "" })
      setEditingPersonalityWeightId(null)
      setEditingPersonalityWeight(emptyWeight())
    },
  })
  const removePersonalityWeight = trpc.admin.discipline.removePersonalityWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listPersonalityWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
    },
  })

  const [editingStatWeightId, setEditingStatWeightId] = useState<string | null>(null)
  const [editingStatWeight, setEditingStatWeight] = useState<WeightRow>(emptyWeight())
  const [newStatWeight, setNewStatWeight] = useState({ statDefId: "", weight: "" })

  const [editingPersonalityWeightId, setEditingPersonalityWeightId] = useState<string | null>(null)
  const [editingPersonalityWeight, setEditingPersonalityWeight] = useState<WeightRow>(emptyWeight())
  const [newPersonalityWeight, setNewPersonalityWeight] = useState({ traitDefId: "", weight: "" })
  const [newEquipReq, setNewEquipReq] = useState({ itemDefId: "", quantity: "1" })

  function openEdit(d: NonNullable<typeof disciplines>[number]) {
    setEditing({ id: d.id, name: d.name, description: d.description ?? "", isConformation: d.isConformation })
    setFormExpanded(false)
    setEditingStatWeightId(null)
    setEditingStatWeight(emptyWeight())
    setNewStatWeight({ statDefId: "", weight: "" })
    setEditingPersonalityWeightId(null)
    setEditingPersonalityWeight(emptyWeight())
    setNewPersonalityWeight({ traitDefId: "", weight: "" })
    setNewEquipReq({ itemDefId: "", quantity: "1" })
  }

  function submitDiscipline() {
    if (!editing || !gameId || !editing.name.trim()) return
    saveDiscipline.mutate({ ...editing, gameId, description: editing.description || null })
  }

  function submitNewStatWeight() {
    if (!newStatWeight.statDefId || !newStatWeight.weight || !editing?.id) return
    saveStatWeight.mutate({
      disciplineDefId: editing.id,
      statDefId: newStatWeight.statDefId,
      weight: parseFloat(newStatWeight.weight),
    })
  }

  function submitEditStatWeight(id: string) {
    if (!editing?.id || !editingStatWeight.weight) return
    const existing = statWeights?.find((w) => w.id === id)
    if (!existing) return
    saveStatWeight.mutate({
      id,
      disciplineDefId: editing.id,
      statDefId: existing.statDefId,
      weight: parseFloat(editingStatWeight.weight),
    })
  }

  function submitNewPersonalityWeight() {
    if (!newPersonalityWeight.traitDefId || !newPersonalityWeight.weight || !editing?.id) return
    savePersonalityWeight.mutate({
      disciplineDefId: editing.id,
      traitDefId: newPersonalityWeight.traitDefId,
      weight: parseFloat(newPersonalityWeight.weight),
    })
  }

  function submitEditPersonalityWeight(id: string) {
    if (!editing?.id || !editingPersonalityWeight.weight) return
    const existing = personalityWeights?.find((w) => w.id === id)
    if (!existing) return
    savePersonalityWeight.mutate({
      id,
      disciplineDefId: editing.id,
      traitDefId: existing.traitDefId,
      weight: parseFloat(editingPersonalityWeight.weight),
    })
  }

  const usedStatIds = new Set(statWeights?.map((w) => w.statDefId) ?? [])
  const availableStats = stats?.filter((s) => !usedStatIds.has(s.id)) ?? []
  const usedTraitIds = new Set(personalityWeights?.map((w) => w.traitDefId) ?? [])
  const availableTraits = traits?.filter((t) => !usedTraitIds.has(t.id)) ?? []

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

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
            {editing.id ? editing.name : "New Discipline"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Discipline Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>
                Edit Details
              </Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Dressage, Sprint Racing"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description <span className="font-normal">(optional)</span>
                </label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isConformation"
                  checked={editing.isConformation}
                  onChange={(e) => setEditing({ ...editing, isConformation: e.target.checked })}
                  className="h-4 w-4 rounded border border-input accent-primary"
                />
                <label htmlFor="isConformation" className="text-sm text-foreground">
                  Conformation discipline
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitDiscipline} disabled={saveDiscipline.isPending || !editing.name.trim()}>
                  Save
                </Button>
                {editing.id && (
                  <Button variant="ghost" onClick={() => setFormExpanded(false)}>
                    Cancel
                  </Button>
                )}
              </div>
              {saveDiscipline.error && (
                <p className="text-sm text-destructive">{saveDiscipline.error.message}</p>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {editing.name}</p>
              {editing.description && (
                <p><span className="text-muted-foreground">Description:</span> {editing.description}</p>
              )}
              <p><span className="text-muted-foreground">Type:</span> {editing.isConformation ? "Conformation" : "Sport"}</p>
            </div>
          )}
        </section>

        {editing.id && (
          <>
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">Stat Weights</h2>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statWeights?.map((w) =>
                    editingStatWeightId === w.id ? (
                      <tr key={w.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-foreground">{w.statDef.name}</td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingStatWeight.weight}
                            onChange={(e) => setEditingStatWeight({ weight: e.target.value })}
                            className="h-7 text-sm max-w-[120px]"
                          />
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" onClick={() => submitEditStatWeight(w.id)} disabled={saveStatWeight.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingStatWeightId(null); setEditingStatWeight(emptyWeight()) }}>
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={w.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{w.statDef.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{w.weight}</td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingStatWeightId(w.id)
                            setEditingStatWeight({ weight: w.weight.toString() })
                          }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            onClick={() => removeStatWeight.mutate({ id: w.id })}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    )
                  )}
                  <tr>
                    <td className="px-4 py-3">
                      <select
                        value={newStatWeight.statDefId}
                        onChange={(e) => setNewStatWeight({ ...newStatWeight, statDefId: e.target.value })}
                        className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Select stat —</option>
                        {availableStats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={newStatWeight.weight}
                        onChange={(e) => setNewStatWeight({ ...newStatWeight, weight: e.target.value })}
                        placeholder="e.g. 0.5"
                        className="h-7 text-sm max-w-[120px]"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={submitNewStatWeight}
                        disabled={saveStatWeight.isPending || !newStatWeight.statDefId || !newStatWeight.weight}
                      >
                        Add
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              {removeStatWeight.error && <p className="px-4 pb-3 text-sm text-destructive">{removeStatWeight.error.message}</p>}
            </section>

            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">Personality Weights</h2>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trait</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {personalityWeights?.map((w) =>
                    editingPersonalityWeightId === w.id ? (
                      <tr key={w.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-foreground">{w.traitDef.name}</td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingPersonalityWeight.weight}
                            onChange={(e) => setEditingPersonalityWeight({ weight: e.target.value })}
                            className="h-7 text-sm max-w-[120px]"
                          />
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" onClick={() => submitEditPersonalityWeight(w.id)} disabled={savePersonalityWeight.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingPersonalityWeightId(null); setEditingPersonalityWeight(emptyWeight()) }}>
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={w.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{w.traitDef.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{w.weight}</td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingPersonalityWeightId(w.id)
                            setEditingPersonalityWeight({ weight: w.weight.toString() })
                          }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            onClick={() => removePersonalityWeight.mutate({ id: w.id })}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    )
                  )}
                  <tr>
                    <td className="px-4 py-3">
                      <select
                        value={newPersonalityWeight.traitDefId}
                        onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, traitDefId: e.target.value })}
                        className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Select trait —</option>
                        {availableTraits.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={newPersonalityWeight.weight}
                        onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, weight: e.target.value })}
                        placeholder="e.g. 0.3"
                        className="h-7 text-sm max-w-[120px]"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={submitNewPersonalityWeight}
                        disabled={savePersonalityWeight.isPending || !newPersonalityWeight.traitDefId || !newPersonalityWeight.weight}
                      >
                        Add
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              {removePersonalityWeight.error && <p className="px-4 pb-3 text-sm text-destructive">{removePersonalityWeight.error.message}</p>}
            </section>

            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">Equipment Requirements</h2>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentRequirements?.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground">{r.itemDef.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.quantity}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => removeEquipReq.mutate({ id: r.id })}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-3">
                      <select value={newEquipReq.itemDefId}
                        onChange={(e) => setNewEquipReq(r => ({ ...r, itemDefId: e.target.value }))}
                        className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">— Select item —</option>
                        {items?.filter(i => !equipmentRequirements?.some(r => r.itemDef.id === i.id))
                          .map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input type="number" step="1" min="1"
                        value={newEquipReq.quantity}
                        onChange={(e) => setNewEquipReq(r => ({ ...r, quantity: e.target.value }))}
                        placeholder="1"
                        className="h-7 text-sm max-w-[80px]" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm"
                        onClick={() => {
                          if (!editing?.id || !newEquipReq.itemDefId) return
                          saveEquipReq.mutate({
                            disciplineDefId: editing.id,
                            itemDefId: newEquipReq.itemDefId,
                            quantity: parseInt(newEquipReq.quantity) || 1,
                          })
                        }}
                        disabled={saveEquipReq.isPending || !newEquipReq.itemDefId}>
                        Add
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              {saveEquipReq.error && <p className="px-4 pb-3 text-sm text-destructive">{saveEquipReq.error.message}</p>}
              {removeEquipReq.error && <p className="px-4 pb-3 text-sm text-destructive">{removeEquipReq.error.message}</p>}
            </section>
          </>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeDiscipline.error && (
              <p className="text-sm text-destructive">{removeDiscipline.error.message}</p>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this discipline? This will remove all its tiers and scoring weights.")) return
                removeDiscipline.mutate({ id: editing.id! })
              }}
              disabled={removeDiscipline.isPending}
            >
              Delete Discipline
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Disciplines</h1>
        <Button onClick={() => { setEditing(emptyDiscipline()); setFormExpanded(true) }}>
          + New Discipline
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat Wts</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trait Wts</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {disciplines?.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.isConformation ? "Conformation" : "Sport"}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.description ?? "—"}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{d._count.statWeights}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{d._count.personalityWeights}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>Edit</Button>
                </td>
              </tr>
            ))}
            {disciplines?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No disciplines yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/disciplines")({
  component: DisciplinesPage,
})
