import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type StageForm = {
  id?: string
  name: string
  stageIndex: number
  minCycle: number
  maxCycle: number
  canCompete: boolean
  canBreed: boolean
  canSurrogate: boolean
  canTrain: boolean
  canReceiveCare: boolean
  hasUniqueActionSet: boolean
  profileLayout: string
  immunityCapMultiplier: number
  energyCostMultiplier: number
  deathChanceStartCycle: string
  deathChancePerCycle: string
}

const emptyForm: StageForm = {
  name: "", stageIndex: 0, minCycle: 0, maxCycle: 0,
  canCompete: false, canBreed: false, canSurrogate: false,
  canTrain: false, canReceiveCare: false, hasUniqueActionSet: false,
  profileLayout: "", immunityCapMultiplier: 1.0, energyCostMultiplier: 1,
  deathChanceStartCycle: "", deathChancePerCycle: "",
}

const checkboxFields: [keyof StageForm, string][] = [
  ["canCompete", "Can Compete"], ["canBreed", "Can Breed"], ["canSurrogate", "Can Surrogate"],
  ["canTrain", "Can Train"], ["canReceiveCare", "Can Receive Care"], ["hasUniqueActionSet", "Has Unique Action Set"],
]

type ActivityForm = { name: string; traitDefId: string; traitEffect: string; energyCost: string; description: string }
const emptyActivity = (): ActivityForm => ({ name: "", traitDefId: "", traitEffect: "", energyCost: "", description: "" })

function StageActivitiesSection({ stageId, gameId }: { stageId: string; gameId: string }) {
  const { data: activities } = trpc.admin.stageActivity.listByStage.useQuery({ lifeStageDefId: stageId })
  const { data: traits } = trpc.admin.personality.list.useQuery({ gameId }, {})
  const utils = trpc.useUtils()

  const saveActivity = trpc.admin.stageActivity.save.useMutation({
    onSuccess: () => {
      utils.admin.stageActivity.listByStage.invalidate({ lifeStageDefId: stageId })
      setEditingId(null); setEditingForm(null); setNewForm(emptyActivity())
    },
  })
  const removeActivity = trpc.admin.stageActivity.remove.useMutation({
    onSuccess: () => utils.admin.stageActivity.listByStage.invalidate({ lifeStageDefId: stageId }),
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState<ActivityForm | null>(null)
  const [newForm, setNewForm] = useState<ActivityForm>(emptyActivity())

  function submitActivity(id?: string) {
    const form = id ? editingForm : newForm
    if (!form || !form.name.trim()) return
    saveActivity.mutate({
      id,
      lifeStageDefId: stageId,
      name: form.name.trim(),
      traitDefId: form.traitDefId || null,
      traitEffect: form.traitEffect ? parseFloat(form.traitEffect) : null,
      energyCost: form.energyCost ? parseFloat(form.energyCost) : null,
      description: form.description.trim() || null,
    })
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border bg-secondary/40 px-3 py-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stage Activities</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trait</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effect</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Energy Cost</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {activities?.map((a: NonNullable<typeof activities>[number]) =>
            editingId === a.id ? (
              <tr key={a.id} className="border-b border-border bg-muted/20">
                <td className="px-3 py-2">
                  <Input value={editingForm?.name ?? ""} onChange={(e) => setEditingForm(p => p ? { ...p, name: e.target.value } : null)} className="h-7 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <select value={editingForm?.traitDefId ?? ""} onChange={(e) => setEditingForm(p => p ? { ...p, traitDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                    <option value="">None</option>
                    {traits?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Input type="number" step="0.01" value={editingForm?.traitEffect ?? ""} onChange={(e) => setEditingForm(p => p ? { ...p, traitEffect: e.target.value } : null)} className="h-7 text-sm w-20" placeholder="0.05" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" step="0.5" min="0" value={editingForm?.energyCost ?? ""} onChange={(e) => setEditingForm(p => p ? { ...p, energyCost: e.target.value } : null)} className="h-7 text-sm w-20" placeholder="5" />
                </td>
                <td className="px-3 py-2">
                  <Input value={editingForm?.description ?? ""} onChange={(e) => setEditingForm(p => p ? { ...p, description: e.target.value } : null)} className="h-7 text-sm" />
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button size="sm" onClick={() => submitActivity(a.id)} disabled={saveActivity.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditingForm(null) }}>Cancel</Button>
                </td>
              </tr>
            ) : (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{a.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.traitDef?.name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.traitEffect ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.energyCost ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-45">{a.description ?? "—"}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(a.id)
                    setEditingForm({ name: a.name, traitDefId: a.traitDefId ?? "", traitEffect: a.traitEffect?.toString() ?? "", energyCost: a.energyCost?.toString() ?? "", description: a.description ?? "" })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeActivity.mutate({ id: a.id })}>Delete</Button>
                </td>
              </tr>
            )
          )}
          {/* New activity row */}
          <tr>
            <td className="px-3 py-2">
              <Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="Activity name" className="h-7 text-sm" />
            </td>
            <td className="px-3 py-2">
              <select value={newForm.traitDefId} onChange={(e) => setNewForm({ ...newForm, traitDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                <option value="">None</option>
                {traits?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </td>
            <td className="px-3 py-2">
              <Input type="number" step="0.01" value={newForm.traitEffect} onChange={(e) => setNewForm({ ...newForm, traitEffect: e.target.value })} className="h-7 text-sm w-20" placeholder="0.05" />
            </td>
            <td className="px-3 py-2">
              <Input type="number" step="0.5" min="0" value={newForm.energyCost} onChange={(e) => setNewForm({ ...newForm, energyCost: e.target.value })} className="h-7 text-sm w-20" placeholder="5" />
            </td>
            <td className="px-3 py-2">
              <Input value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="Optional description" className="h-7 text-sm" />
            </td>
            <td className="px-3 py-2 text-right">
              <Button size="sm" onClick={() => submitActivity()} disabled={!newForm.name.trim() || saveActivity.isPending}>Add</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function LifeStagePage() {
  const { gameId } = Route.useParams()

  const { data: stages } = trpc.admin.lifestage.list.useQuery({ gameId: gameId! }, {})
  const utils = trpc.useUtils()

  const save = trpc.admin.lifestage.save.useMutation({
    onSuccess: () => utils.admin.lifestage.list.invalidate(),
  })
  const remove = trpc.admin.lifestage.remove.useMutation({
    onSuccess: () => {
      utils.admin.lifestage.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<StageForm | null>(null)

  function startEdit(stage: NonNullable<typeof stages>[number]) {
    setEditing({
      id: stage.id, name: stage.name, stageIndex: stage.stageIndex,
      minCycle: stage.minCycle, maxCycle: stage.ageCap,
      canCompete: stage.canCompete, canBreed: stage.canBreed,
      canSurrogate: stage.canSurrogate, canTrain: stage.canTrain,
      canReceiveCare: stage.canReceiveCare, hasUniqueActionSet: stage.hasUniqueActionSet,
      profileLayout: stage.profileLayout, immunityCapMultiplier: stage.immunityCapMultiplier,
      energyCostMultiplier: stage.energyCostMultiplier,
      deathChanceStartCycle: stage.deathChanceStartCycle?.toString() ?? "",
      deathChancePerCycle: stage.deathChancePerCycle?.toString() ?? "",
    })
  }

  function update(field: keyof StageForm, value: string | number | boolean) {
    setEditing((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  function handleSave() {
    if (!editing || !gameId) return
    const { maxCycle, deathChanceStartCycle, deathChancePerCycle, ...rest } = editing
    save.mutate(
      {
        ...rest, gameId, ageCap: maxCycle,
        deathChanceStartCycle: deathChanceStartCycle !== "" ? parseInt(deathChanceStartCycle) : null,
        deathChancePerCycle: deathChancePerCycle !== "" ? parseFloat(deathChancePerCycle) : null,
      },
      { onSuccess: (saved) => setEditing((prev) => (prev ? { ...prev, id: saved.id } : null)) }
    )
  }

  if (editing !== null) {
    return (
      <div className="p-4 space-y-3 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back to list</button>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Life Stage"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
          {/* Left: stage details */}
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stage Details</h2>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input className="h-8 text-sm" value={editing.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stage Index</label>
                  <Input className="h-8 text-sm" type="number" value={editing.stageIndex} onChange={(e) => update("stageIndex", parseInt(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Profile Layout</label>
                  <Input className="h-8 text-sm" value={editing.profileLayout} onChange={(e) => update("profileLayout", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Cycle</label>
                  <Input className="h-8 text-sm" type="number" value={editing.minCycle} onChange={(e) => update("minCycle", parseInt(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Max Cycle</label>
                  <Input className="h-8 text-sm" type="number" value={editing.maxCycle} onChange={(e) => update("maxCycle", parseInt(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Immunity Cap ×</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" min="0" max="1" value={editing.immunityCapMultiplier} onChange={(e) => update("immunityCapMultiplier", parseFloat(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Cost ×</label>
                  <Input className="h-8 text-sm" type="number" step="0.05" min="0" value={editing.energyCostMultiplier} onChange={(e) => update("energyCostMultiplier", parseFloat(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Death Start Cycle</label>
                  <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.deathChanceStartCycle} onChange={(e) => update("deathChanceStartCycle", e.target.value)} placeholder="optional" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Death Chance/Cycle</label>
                  <Input className="h-8 text-sm" type="number" step="0.001" min="0" max="1" value={editing.deathChancePerCycle} onChange={(e) => update("deathChancePerCycle", e.target.value)} placeholder="optional" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Abilities</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {checkboxFields.map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={editing[field] as boolean} onChange={(e) => update(field, e.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={save.isPending || !editing.name.trim()}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
              {editing.id && (
                <div className="border-t border-border pt-3">
                  <Button variant="ghost" className="text-destructive hover:text-destructive w-full"
                    onClick={() => {
                      if (!confirm("Delete this life stage? Animals assigned to it will lose their stage")) return
                      remove.mutate({ id: editing.id! })
                    }}
                    disabled={remove.isPending}>
                    Delete Stage
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Right: activities (only once saved) */}
          {editing.id ? (
            <StageActivitiesSection stageId={editing.id} gameId={gameId!} />
          ) : (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stage Activities</h2>
              </div>
              <p className="p-6 text-center text-sm text-muted-foreground">Save the stage first to add activities.</p>
            </section>
          )}
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Life Stages</h1>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>Add Stage</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cycles</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compete</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Surrogate</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Train</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Care</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unique</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layout</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stages?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{s.stageIndex}</td>
                <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.minCycle}–{s.maxCycle}</td>
                <td className="px-3 py-2 text-center">{s.canCompete ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canBreed ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canSurrogate ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canTrain ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canReceiveCare ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.hasUniqueActionSet ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.profileLayout}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                </td>
              </tr>
            ))}
            {stages?.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">No life stages defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/life-stages")({
  component: LifeStagePage,
})
