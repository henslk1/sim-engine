import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, Fragment } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const TREATMENT_TYPES = ["OTC", "PRESCRIPTION", "VET_PROCEDURE", "ACTIVITY_RESTRICTION", "PLAYER_ACTION"] as const
type TreatmentType = typeof TREATMENT_TYPES[number]

const TREATMENT_LABELS: Record<TreatmentType, string> = {
  OTC: "OTC",
  PRESCRIPTION: "Prescription",
  VET_PROCEDURE: "Vet Procedure",
  ACTIVITY_RESTRICTION: "Activity Restriction",
  PLAYER_ACTION: "Player Action",
}

const RESTRICTION_TYPES = ["TRAINING", "COMPETITION", "BREEDING", "CARE_ACTION", "ALL"] as const
type RestrictionType = typeof RESTRICTION_TYPES[number]

const RESTRICTION_LABELS: Record<RestrictionType, string> = {
  TRAINING: "Training",
  COMPETITION: "Competition",
  BREEDING: "Breeding",
  CARE_ACTION: "Care Actions",
  ALL: "All Activities",
}

type TreatmentForm = {
  name: string
  treatmentType: TreatmentType
  durationCycles: string
}

const emptyTreatment = (): TreatmentForm => ({ name: "", treatmentType: "OTC", durationCycles: "" })

type ItemRow = { itemDefId: string; quantity: string }
const emptyItem = (): ItemRow => ({ itemDefId: "", quantity: "1" })

type RestrictionRow = {
  restrictionType: RestrictionType
  maxIntensityTier: string
  durationCycles: string
}
const emptyRestriction = (): RestrictionRow => ({ restrictionType: "TRAINING", maxIntensityTier: "", durationCycles: "" })

function TreatmentsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: conditions } = trpc.admin.health.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: itemDefs } = trpc.admin.item.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const [selectedConditionId, setSelectedConditionId] = useState("")
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null)
  const [expandedView, setExpandedView] = useState<"items" | "restrictions" | null>(null)
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null)
  const [editingTreatment, setEditingTreatment] = useState<TreatmentForm | null>(null)

  // Items state
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [newItem, setNewItem] = useState<ItemRow>(emptyItem())

  // Restrictions state
  const [editingRestrictionId, setEditingRestrictionId] = useState<string | null>(null)
  const [editingRestriction, setEditingRestriction] = useState<RestrictionRow | null>(null)
  const [newRestriction, setNewRestriction] = useState<RestrictionRow>(emptyRestriction())

  const { data: treatments } = trpc.admin.treatment.listByCondition.useQuery(
    { conditionDefId: selectedConditionId },
    { enabled: !!selectedConditionId }
  )
  const { data: treatmentItems } = trpc.admin.treatment.listItems.useQuery(
    { treatmentDefId: expandedTreatmentId! },
    { enabled: !!expandedTreatmentId && expandedView === "items" }
  )
  const { data: treatmentRestrictions } = trpc.admin.treatment.listRestrictions.useQuery(
    { treatmentDefId: expandedTreatmentId! },
    { enabled: !!expandedTreatmentId && expandedView === "restrictions" }
  )

  const utils = trpc.useUtils()

  const saveTreatment = trpc.admin.treatment.save.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const removeTreatment = trpc.admin.treatment.remove.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
      setExpandedTreatmentId(null)
      setExpandedView(null)
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const saveItem = trpc.admin.treatment.saveItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
      setEditingItemId(null)
      setEditingItem(null)
      setNewItem(emptyItem())
    },
  })
  const removeItem = trpc.admin.treatment.removeItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
    },
  })
  const saveRestriction = trpc.admin.treatment.saveRestriction.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listRestrictions.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
      setEditingRestrictionId(null)
      setEditingRestriction(null)
      setNewRestriction(emptyRestriction())
    },
  })
  const removeRestriction = trpc.admin.treatment.removeRestriction.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listRestrictions.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: selectedConditionId })
    },
  })

  function handleConditionChange(id: string) {
    setSelectedConditionId(id)
    setExpandedTreatmentId(null)
    setExpandedView(null)
    setEditingTreatmentId(null)
    setEditingTreatment(null)
    setEditingItemId(null)
    setEditingItem(null)
    setNewItem(emptyItem())
    setEditingRestrictionId(null)
    setEditingRestriction(null)
    setNewRestriction(emptyRestriction())
  }

  function toggleExpand(treatmentId: string, view: "items" | "restrictions") {
    if (expandedTreatmentId === treatmentId && expandedView === view) {
      setExpandedTreatmentId(null)
      setExpandedView(null)
    } else {
      setExpandedTreatmentId(treatmentId)
      setExpandedView(view)
    }
    setEditingItemId(null)
    setEditingItem(null)
    setNewItem(emptyItem())
    setEditingRestrictionId(null)
    setEditingRestriction(null)
    setNewRestriction(emptyRestriction())
  }

  function submitTreatment() {
    if (!editingTreatment || !selectedConditionId || !editingTreatment.name.trim()) return
    saveTreatment.mutate({
      id: editingTreatmentId ?? undefined,
      conditionDefId: selectedConditionId,
      name: editingTreatment.name.trim(),
      treatmentType: editingTreatment.treatmentType,
      durationCycles: editingTreatment.durationCycles ? parseInt(editingTreatment.durationCycles) : null,
    })
  }

  function submitItem(id?: string) {
    const form = id ? editingItem : newItem
    if (!form || !expandedTreatmentId || !form.itemDefId) return
    saveItem.mutate({
      id,
      treatmentDefId: expandedTreatmentId,
      itemDefId: form.itemDefId,
      quantity: parseInt(form.quantity) || 1,
    })
  }

  function submitRestriction(id?: string) {
    const form = id ? editingRestriction : newRestriction
    if (!form || !expandedTreatmentId) return
    saveRestriction.mutate({
      id,
      treatmentDefId: expandedTreatmentId,
      restrictionType: form.restrictionType,
      maxIntensityTier: form.maxIntensityTier ? parseInt(form.maxIntensityTier) : null,
      durationCycles: form.durationCycles ? parseInt(form.durationCycles) : null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Treatments</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <label className="text-xs font-medium text-muted-foreground">Condition</label>
        <select
          value={selectedConditionId}
          onChange={(e) => handleConditionChange(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— Select a condition —</option>
          {conditions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </section>

      {selectedConditionId && (
        <>
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Treatments</h2>
              <Button size="sm" onClick={() => { setEditingTreatment(emptyTreatment()); setEditingTreatmentId(null) }}>
                + Add Treatment
              </Button>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duration</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Restrictions</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {treatments?.map((t: NonNullable<typeof treatments>[number]) => (
                  <Fragment key={t.id}>
                    <tr className={`border-b border-border ${expandedTreatmentId === t.id ? "bg-muted/30" : ""}`}>
                      <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{TREATMENT_LABELS[t.treatmentType as TreatmentType]}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.durationCycles ?? "—"}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{t._count.items}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{t._count.restrictionDefs}</td>
                      <td className="px-4 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => toggleExpand(t.id, "items")} className="text-xs">
                          {expandedTreatmentId === t.id && expandedView === "items" ? "▲" : "▼"} Items
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleExpand(t.id, "restrictions")} className="text-xs">
                          {expandedTreatmentId === t.id && expandedView === "restrictions" ? "▲" : "▼"} Restrictions
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingTreatmentId(t.id)
                          setEditingTreatment({ name: t.name, treatmentType: t.treatmentType as TreatmentType, durationCycles: t.durationCycles?.toString() ?? "" })
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (!confirm("Delete this treatment?")) return
                            removeTreatment.mutate({ id: t.id })
                          }}>Delete</Button>
                      </td>
                    </tr>
                    {expandedTreatmentId === t.id && expandedView === "items" && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={6} className="px-8 py-3">
                          {!itemDefs?.length ? (
                            <p className="text-sm text-muted-foreground">No items configured yet. Set up Items in the Economy section first.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {treatmentItems?.map((item: NonNullable<typeof treatmentItems>[number]) =>
                                  editingItemId === item.id ? (
                                    <tr key={item.id} className="border-b border-border last:border-0">
                                      <td className="py-2 pr-4">
                                        <select
                                          value={editingItem?.itemDefId ?? ""}
                                          onChange={(e) => setEditingItem((p) => p ? { ...p, itemDefId: e.target.value } : null)}
                                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                                        >
                                          {itemDefs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="py-2 pr-4">
                                        <Input type="number" min="1" value={editingItem?.quantity ?? "1"} onChange={(e) => setEditingItem((p) => p ? { ...p, quantity: e.target.value } : null)} className="h-7 text-sm w-20" />
                                      </td>
                                      <td className="py-2 text-right space-x-2">
                                        <Button size="sm" onClick={() => submitItem(item.id)} disabled={saveItem.isPending}>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(null); setEditingItem(null) }}>Cancel</Button>
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr key={item.id} className="border-b border-border last:border-0">
                                      <td className="py-2 pr-4 font-medium text-foreground">{item.itemDef.name}</td>
                                      <td className="py-2 pr-4 text-muted-foreground">{item.quantity}</td>
                                      <td className="py-2 text-right space-x-2">
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
                                  <td className="py-2 pr-4">
                                    <select
                                      value={newItem.itemDefId}
                                      onChange={(e) => setNewItem({ ...newItem, itemDefId: e.target.value })}
                                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                                    >
                                      <option value="">Select item…</option>
                                      {itemDefs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                  </td>
                                  <td className="py-2 pr-4">
                                    <Input type="number" min="1" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="h-7 text-sm w-20" />
                                  </td>
                                  <td className="py-2 text-right">
                                    <Button size="sm" onClick={() => submitItem()} disabled={!newItem.itemDefId || saveItem.isPending}>Add</Button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                    {expandedTreatmentId === t.id && expandedView === "restrictions" && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={6} className="px-8 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Restriction Type</th>
                                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Intensity Tier</th>
                                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duration (cycles)</th>
                                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {treatmentRestrictions?.map((r: NonNullable<typeof treatmentRestrictions>[number]) =>
                                editingRestrictionId === r.id ? (
                                  <tr key={r.id} className="border-b border-border last:border-0">
                                    <td className="py-2 pr-4">
                                      <select
                                        value={editingRestriction?.restrictionType ?? "TRAINING"}
                                        onChange={(e) => setEditingRestriction((p) => p ? { ...p, restrictionType: e.target.value as RestrictionType } : null)}
                                        className="h-7 rounded border border-input bg-background px-2 text-xs"
                                      >
                                        {RESTRICTION_TYPES.map((type) => <option key={type} value={type}>{RESTRICTION_LABELS[type]}</option>)}
                                      </select>
                                    </td>
                                    <td className="py-2 pr-4">
                                      <Input type="number" min="1" value={editingRestriction?.maxIntensityTier ?? ""} onChange={(e) => setEditingRestriction((p) => p ? { ...p, maxIntensityTier: e.target.value } : null)} className="h-7 text-sm w-20" placeholder="—" />
                                    </td>
                                    <td className="py-2 pr-4">
                                      <Input type="number" min="1" value={editingRestriction?.durationCycles ?? ""} onChange={(e) => setEditingRestriction((p) => p ? { ...p, durationCycles: e.target.value } : null)} className="h-7 text-sm w-20" placeholder="—" />
                                    </td>
                                    <td className="py-2 text-right space-x-2">
                                      <Button size="sm" onClick={() => submitRestriction(r.id)} disabled={saveRestriction.isPending}>Save</Button>
                                      <Button size="sm" variant="ghost" onClick={() => { setEditingRestrictionId(null); setEditingRestriction(null) }}>Cancel</Button>
                                    </td>
                                  </tr>
                                ) : (
                                  <tr key={r.id} className="border-b border-border last:border-0">
                                    <td className="py-2 pr-4 font-medium text-foreground">{RESTRICTION_LABELS[r.restrictionType as RestrictionType]}</td>
                                    <td className="py-2 pr-4 text-muted-foreground">{r.maxIntensityTier ?? "—"}</td>
                                    <td className="py-2 pr-4 text-muted-foreground">{r.durationCycles ?? "—"}</td>
                                    <td className="py-2 text-right space-x-2">
                                      <Button size="sm" variant="ghost" onClick={() => {
                                        setEditingRestrictionId(r.id)
                                        setEditingRestriction({
                                          restrictionType: r.restrictionType as RestrictionType,
                                          maxIntensityTier: r.maxIntensityTier?.toString() ?? "",
                                          durationCycles: r.durationCycles?.toString() ?? "",
                                        })
                                      }}>Edit</Button>
                                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                        onClick={() => removeRestriction.mutate({ id: r.id })}>Delete</Button>
                                    </td>
                                  </tr>
                                )
                              )}
                              <tr>
                                <td className="py-2 pr-4">
                                  <select
                                    value={newRestriction.restrictionType}
                                    onChange={(e) => setNewRestriction({ ...newRestriction, restrictionType: e.target.value as RestrictionType })}
                                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                                  >
                                    {RESTRICTION_TYPES.map((type) => <option key={type} value={type}>{RESTRICTION_LABELS[type]}</option>)}
                                  </select>
                                </td>
                                <td className="py-2 pr-4">
                                  <Input type="number" min="1" value={newRestriction.maxIntensityTier} onChange={(e) => setNewRestriction({ ...newRestriction, maxIntensityTier: e.target.value })} className="h-7 text-sm w-20" placeholder="—" />
                                </td>
                                <td className="py-2 pr-4">
                                  <Input type="number" min="1" value={newRestriction.durationCycles} onChange={(e) => setNewRestriction({ ...newRestriction, durationCycles: e.target.value })} className="h-7 text-sm w-20" placeholder="—" />
                                </td>
                                <td className="py-2 text-right">
                                  <Button size="sm" onClick={() => submitRestriction()} disabled={saveRestriction.isPending}>Add</Button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {treatments?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No treatments for this condition yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {removeTreatment.error && (
              <p className="px-4 pb-3 text-sm text-destructive">{removeTreatment.error.message}</p>
            )}
          </section>

          {editingTreatment !== null && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">
                  {editingTreatmentId ? "Edit Treatment" : "Add Treatment"}
                </h2>
              </header>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      value={editingTreatment.name}
                      onChange={(e) => setEditingTreatment({ ...editingTreatment, name: e.target.value })}
                      placeholder="e.g. Rest & Recovery"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      value={editingTreatment.treatmentType}
                      onChange={(e) => setEditingTreatment({ ...editingTreatment, treatmentType: e.target.value as TreatmentType })}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {TREATMENT_TYPES.map((type) => <option key={type} value={type}>{TREATMENT_LABELS[type]}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Duration (cycles) <span className="font-normal">— optional</span></label>
                  <Input
                    type="number"
                    min="1"
                    value={editingTreatment.durationCycles}
                    onChange={(e) => setEditingTreatment({ ...editingTreatment, durationCycles: e.target.value })}
                    placeholder="—"
                    className="mt-1 max-w-xs"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={submitTreatment}
                    disabled={saveTreatment.isPending || !editingTreatment.name.trim()}
                  >
                    {editingTreatmentId ? "Save" : "Add Treatment"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditingTreatmentId(null); setEditingTreatment(null) }}>
                    Cancel
                  </Button>
                </div>
                {saveTreatment.error && <p className="text-sm text-destructive">{saveTreatment.error.message}</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/treatments")({
  component: TreatmentsPage,
})
