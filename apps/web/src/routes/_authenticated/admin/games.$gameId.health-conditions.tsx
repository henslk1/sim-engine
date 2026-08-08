import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, Fragment } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const TREATMENT_TYPES = ["OTC", "PRESCRIPTION", "VET_PROCEDURE", "ACTIVITY_RESTRICTION", "PLAYER_ACTION"] as const
type TreatmentType = typeof TREATMENT_TYPES[number]
const TREATMENT_LABELS: Record<TreatmentType, string> = {
  OTC: "OTC", PRESCRIPTION: "Prescription", VET_PROCEDURE: "Vet Procedure",
  ACTIVITY_RESTRICTION: "Activity Restriction", PLAYER_ACTION: "Player Action",
}

type ConditionForm = {
  id?: string
  name: string
  conditionType: "ILLNESS" | "INJURY"
  isGenetic: boolean
  isFatal: boolean
  moodEffect: string
  energyEffect: string
  onsetMinCycle: string
  fatalityChance: string
  fatalMaxCycle: string
}

const emptyCondition = (): ConditionForm => ({ name: "", conditionType: "ILLNESS", isGenetic: false, isFatal: false, moodEffect: "", energyEffect: "", onsetMinCycle: "", fatalityChance: "", fatalMaxCycle: "" })

type BehaviorRow = { symptomText: string; careActionDefId: string }
const emptyBehavior = (): BehaviorRow => ({ symptomText: "", careActionDefId: "" })

type TreatmentForm = { name: string; treatmentType: TreatmentType; durationCycles: string }
const emptyTreatment = (): TreatmentForm => ({ name: "", treatmentType: "OTC", durationCycles: "" })

type ItemRow = { itemDefId: string; quantity: string }
const emptyItem = (): ItemRow => ({ itemDefId: "", quantity: "1" })

function HealthConditionsPage() {
  const { gameId } = Route.useParams()

  const { data: conditions } = trpc.admin.health.list.useQuery({ gameId: gameId! }, {})
  const { data: careActions } = trpc.admin.care.list.useQuery({ gameId: gameId! }, {})
  const { data: itemDefs } = trpc.admin.item.list.useQuery({ gameId: gameId! }, {})

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
  const [rightTab, setRightTab] = useState<"behaviors" | "treatments">("behaviors")

  // Behavior state
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

  // Treatment state
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null)
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null)
  const [editingTreatment, setEditingTreatment] = useState<TreatmentForm | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [newItem, setNewItem] = useState<ItemRow>(emptyItem())

  const { data: treatments } = trpc.admin.treatment.listByCondition.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id && rightTab === "treatments" }
  )
  const { data: treatmentItems } = trpc.admin.treatment.listItems.useQuery(
    { treatmentDefId: expandedTreatmentId! },
    { enabled: !!expandedTreatmentId }
  )

  const saveTreatment = trpc.admin.treatment.save.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const removeTreatment = trpc.admin.treatment.remove.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setExpandedTreatmentId(null)
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const saveItem = trpc.admin.treatment.saveItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setEditingItemId(null)
      setEditingItem(null)
      setNewItem(emptyItem())
    },
  })
  const removeItem = trpc.admin.treatment.removeItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
    },
  })

  function openEdit(condition: NonNullable<typeof conditions>[number]) {
    setEditing({
      id: condition.id, name: condition.name, conditionType: condition.conditionType,
      isGenetic: condition.isGenetic, isFatal: condition.isFatal,
      moodEffect: condition.moodEffect?.toString() ?? "",
      energyEffect: condition.energyEffect?.toString() ?? "",
      onsetMinCycle: condition.onsetMinCycle?.toString() ?? "",
      fatalityChance: condition.fatalityChance?.toString() ?? "",
      fatalMaxCycle: condition.fatalMaxCycle?.toString() ?? "",
    })
    setRightTab("behaviors")
    setEditingBehaviorId(null); setEditingBehavior(null); setNewBehavior(emptyBehavior())
    setExpandedTreatmentId(null); setEditingTreatmentId(null); setEditingTreatment(null)
    setEditingItemId(null); setEditingItem(null); setNewItem(emptyItem())
  }

  function submitCondition() {
    if (!editing || !gameId) return
    saveCondition.mutate(
      {
        id: editing.id, gameId, name: editing.name, conditionType: editing.conditionType,
        isGenetic: editing.isGenetic, isFatal: editing.isFatal,
        moodEffect: editing.moodEffect !== "" ? parseFloat(editing.moodEffect) : null,
        energyEffect: editing.energyEffect !== "" ? parseFloat(editing.energyEffect) : null,
        onsetMinCycle: editing.onsetMinCycle !== "" ? parseInt(editing.onsetMinCycle) : null,
        fatalityChance: editing.fatalityChance !== "" ? parseFloat(editing.fatalityChance) : null,
        fatalMaxCycle: editing.fatalMaxCycle !== "" ? parseInt(editing.fatalMaxCycle) : null,
      },
      { onSuccess: (saved) => setEditing((prev) => (prev ? { ...prev, id: saved.id } : null)) }
    )
  }

  function submitBehavior(id?: string) {
    const form = id ? editingBehavior : newBehavior
    if (!form || !editing?.id || !form.symptomText.trim()) return
    saveBehavior.mutate({ id, conditionDefId: editing.id, symptomText: form.symptomText.trim(), careActionDefId: form.careActionDefId || null })
  }

  function submitTreatment() {
    if (!editingTreatment || !editing?.id || !editingTreatment.name.trim()) return
    saveTreatment.mutate({
      id: editingTreatmentId ?? undefined,
      conditionDefId: editing.id,
      name: editingTreatment.name.trim(),
      treatmentType: editingTreatment.treatmentType,
      durationCycles: editingTreatment.durationCycles ? parseInt(editingTreatment.durationCycles) : null,
    })
  }

  function submitItem(id?: string) {
    const form = id ? editingItem : newItem
    if (!form || !expandedTreatmentId || !form.itemDefId) return
    saveItem.mutate({ id, treatmentDefId: expandedTreatmentId, itemDefId: form.itemDefId, quantity: parseInt(form.quantity) || 1 })
  }

  if (editing !== null) {
    return (
      <div className="p-4 space-y-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back to list</button>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Health Condition"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
          {/* Left: condition details */}
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Condition Details</h2>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input className="h-8 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                <select value={editing.conditionType} onChange={(e) => setEditing({ ...editing, conditionType: e.target.value as "ILLNESS" | "INJURY" })}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ILLNESS">Illness</option>
                  <option value="INJURY">Injury</option>
                </select>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={editing.isGenetic} onChange={(e) => setEditing({ ...editing, isGenetic: e.target.checked })} />
                  Genetic
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={editing.isFatal} onChange={(e) => setEditing({ ...editing, isFatal: e.target.checked })} />
                  Fatal
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Mood Effect</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" value={editing.moodEffect}
                    onChange={(e) => setEditing({ ...editing, moodEffect: e.target.value })} placeholder="e.g. -0.2" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Effect</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" value={editing.energyEffect}
                    onChange={(e) => setEditing({ ...editing, energyEffect: e.target.value })} placeholder="e.g. -0.1" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Onset Min Cycle</label>
                <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.onsetMinCycle}
                  onChange={(e) => setEditing({ ...editing, onsetMinCycle: e.target.value })} placeholder="e.g. 24" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fatality Chance</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" min="0" max="1" value={editing.fatalityChance}
                    onChange={(e) => setEditing({ ...editing, fatalityChance: e.target.value })} placeholder="0–1" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fatal Max Cycle</label>
                  <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.fatalMaxCycle}
                    onChange={(e) => setEditing({ ...editing, fatalMaxCycle: e.target.value })} placeholder="e.g. 48" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitCondition} disabled={saveCondition.isPending || !editing.name.trim()}>Save</Button>
              </div>
              {saveCondition.error && <p className="text-sm text-destructive">{saveCondition.error.message}</p>}
              {editing.id && (
                <div className="border-t border-border pt-3">
                  {removeCondition.error && <p className="text-sm text-destructive">{removeCondition.error.message}</p>}
                  <Button variant="ghost" className="text-destructive hover:text-destructive w-full"
                    onClick={() => {
                      if (!confirm("Delete this health condition? This will also remove all its behaviors and treatments.")) return
                      removeCondition.mutate({ id: editing.id! })
                    }}
                    disabled={removeCondition.isPending}>
                    Delete Condition
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Right: tabbed panel */}
          {editing.id && (
            <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center gap-4 border-b border-border bg-secondary/40 px-3 py-2">
                {(["behaviors", "treatments"] as const).map(tab => (
                  <button key={tab} onClick={() => setRightTab(tab)}
                    className={`text-[10px] font-bold uppercase tracking-wider pb-0.5 border-b-2 transition-colors ${
                      rightTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}>
                    {tab === "behaviors" ? "Behaviors & Symptoms" : "Treatments"}
                  </button>
                ))}
              </div>

              {/* Behaviors tab */}
              {rightTab === "behaviors" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symptom Text</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Care Action</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {behaviors?.map((b: NonNullable<typeof behaviors>[number]) =>
                      editingBehaviorId === b.id ? (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input value={editingBehavior?.symptomText ?? ""} onChange={(e) => setEditingBehavior((p) => p ? { ...p, symptomText: e.target.value } : null)} className="h-7 text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={editingBehavior?.careActionDefId ?? ""} onChange={(e) => setEditingBehavior((p) => p ? { ...p, careActionDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                              <option value="">None</option>
                              {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" onClick={() => submitBehavior(b.id)} disabled={saveBehavior.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingBehaviorId(null); setEditingBehavior(null) }}>Cancel</Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">{b.symptomText}</td>
                          <td className="px-3 py-2 text-muted-foreground">{b.careActionDef?.name ?? "—"}</td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingBehaviorId(b.id); setEditingBehavior({ symptomText: b.symptomText, careActionDefId: b.careActionDefId ?? "" }) }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeBehavior.mutate({ id: b.id })}>Delete</Button>
                          </td>
                        </tr>
                      )
                    )}
                    <tr>
                      <td className="px-3 py-3">
                        <Input value={newBehavior.symptomText} onChange={(e) => setNewBehavior({ ...newBehavior, symptomText: e.target.value })} placeholder="e.g. Animal appears lethargic" onKeyDown={(e) => e.key === "Enter" && submitBehavior()} className="h-7 text-sm" />
                      </td>
                      <td className="px-3 py-3">
                        <select value={newBehavior.careActionDefId} onChange={(e) => setNewBehavior({ ...newBehavior, careActionDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                          <option value="">None</option>
                          {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" onClick={() => submitBehavior()} disabled={!newBehavior.symptomText.trim() || saveBehavior.isPending}>Add</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Treatments tab */}
              {rightTab === "treatments" && (
                <div className={editingTreatment !== null ? "grid grid-cols-[280px_1fr] divide-x divide-border" : ""}>
                  {/* Treatment form (when editing/adding) */}
                  {editingTreatment !== null && (
                    <div className="p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {editingTreatmentId ? "Edit Treatment" : "Add Treatment"}
                      </p>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                        <Input className="h-8 text-sm" value={editingTreatment.name} onChange={(e) => setEditingTreatment({ ...editingTreatment, name: e.target.value })} placeholder="e.g. Rest & Recovery" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                        <select value={editingTreatment.treatmentType} onChange={(e) => setEditingTreatment({ ...editingTreatment, treatmentType: e.target.value as TreatmentType })} className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                          {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Duration (cycles) — optional</label>
                        <Input className="h-8 text-sm" type="number" min="1" value={editingTreatment.durationCycles} onChange={(e) => setEditingTreatment({ ...editingTreatment, durationCycles: e.target.value })} placeholder="—" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitTreatment} disabled={saveTreatment.isPending || !editingTreatment.name.trim()}>
                          {editingTreatmentId ? "Save" : "Add Treatment"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingTreatmentId(null); setEditingTreatment(null) }}>Cancel</Button>
                      </div>
                      {saveTreatment.error && <p className="text-sm text-destructive">{saveTreatment.error.message}</p>}
                    </div>
                  )}

                  {/* Treatment list */}
                  <div>
                    <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Treatments</span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditingTreatment(emptyTreatment()); setEditingTreatmentId(null) }}>+ Add</Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {treatments?.map((t: NonNullable<typeof treatments>[number]) => (
                          <Fragment key={t.id}>
                            <tr className={`border-b border-border ${expandedTreatmentId === t.id ? "bg-muted/30" : ""}`}>
                              <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{TREATMENT_LABELS[t.treatmentType as TreatmentType]}</td>
                              <td className="px-3 py-2 text-muted-foreground">{t.durationCycles ?? "—"}</td>
                              <td className="px-3 py-2 text-center">
                                <Button size="sm" variant="ghost" className="text-xs h-6 px-2"
                                  onClick={() => {
                                    setExpandedTreatmentId(expandedTreatmentId === t.id ? null : t.id)
                                    setEditingItemId(null); setEditingItem(null); setNewItem(emptyItem())
                                  }}>
                                  {t._count.items} {expandedTreatmentId === t.id ? "▲" : "▼"}
                                </Button>
                              </td>
                              <td className="px-3 py-2 text-right space-x-1">
                                <Button size="sm" variant="ghost" onClick={() => {
                                  setEditingTreatmentId(t.id)
                                  setEditingTreatment({ name: t.name, treatmentType: t.treatmentType as TreatmentType, durationCycles: t.durationCycles?.toString() ?? "" })
                                }}>Edit</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => { if (!confirm("Delete this treatment?")) return; removeTreatment.mutate({ id: t.id }) }}>
                                  Delete
                                </Button>
                              </td>
                            </tr>
                            {expandedTreatmentId === t.id && (
                              <tr className="border-b border-border bg-muted/10">
                                <td colSpan={5} className="px-6 py-3">
                                  {!itemDefs?.length ? (
                                    <p className="text-sm text-muted-foreground">No items configured. Set up Items in the Economy section first.</p>
                                  ) : (
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-border">
                                          <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                                          <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                                          <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {treatmentItems?.map((item: NonNullable<typeof treatmentItems>[number]) =>
                                          editingItemId === item.id ? (
                                            <tr key={item.id} className="border-b border-border last:border-0">
                                              <td className="py-1.5 pr-4">
                                                <select value={editingItem?.itemDefId ?? ""} onChange={(e) => setEditingItem(p => p ? { ...p, itemDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                                  {itemDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                              </td>
                                              <td className="py-1.5 pr-4">
                                                <Input type="number" min="1" value={editingItem?.quantity ?? "1"} onChange={(e) => setEditingItem(p => p ? { ...p, quantity: e.target.value } : null)} className="h-7 text-sm w-20" />
                                              </td>
                                              <td className="py-1.5 text-right space-x-2">
                                                <Button size="sm" onClick={() => submitItem(item.id)} disabled={saveItem.isPending}>Save</Button>
                                                <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(null); setEditingItem(null) }}>Cancel</Button>
                                              </td>
                                            </tr>
                                          ) : (
                                            <tr key={item.id} className="border-b border-border last:border-0">
                                              <td className="py-1.5 pr-4 font-medium text-foreground">{item.itemDef.name}</td>
                                              <td className="py-1.5 pr-4 text-muted-foreground">{item.quantity}</td>
                                              <td className="py-1.5 text-right space-x-2">
                                                <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(item.id); setEditingItem({ itemDefId: item.itemDefId, quantity: item.quantity.toString() }) }}>Edit</Button>
                                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeItem.mutate({ id: item.id })}>Delete</Button>
                                              </td>
                                            </tr>
                                          )
                                        )}
                                        <tr>
                                          <td className="py-1.5 pr-4">
                                            <select value={newItem.itemDefId} onChange={(e) => setNewItem({ ...newItem, itemDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                              <option value="">Select item…</option>
                                              {itemDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                          </td>
                                          <td className="py-1.5 pr-4">
                                            <Input type="number" min="1" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="h-7 text-sm w-20" />
                                          </td>
                                          <td className="py-1.5 text-right">
                                            <Button size="sm" onClick={() => submitItem()} disabled={!newItem.itemDefId || saveItem.isPending}>Add</Button>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                        {treatments?.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No treatments yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Health Conditions</h1>
        <Button onClick={() => setEditing(emptyCondition())}>+ New Condition</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Genetic</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fatal</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Behaviors</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {conditions?.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.conditionType === "ILLNESS" ? "Illness" : "Injury"}</td>
                <td className="px-3 py-2 text-center">{c.isGenetic ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{c.isFatal ? <span className="text-destructive">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{c._count.behaviors}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                </td>
              </tr>
            ))}
            {conditions?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No health conditions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/health-conditions")({
  component: HealthConditionsPage,
})
