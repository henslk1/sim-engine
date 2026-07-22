import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ActivityForm = {
  name: string
  traitDefId: string
  traitEffect: string
  energyCost: string
  description: string
}
const emptyForm = (): ActivityForm => ({ name: "", traitDefId: "", traitEffect: "", energyCost: "", description: "" })

function StageActivitiesPage() {
  const { gameId } = Route.useParams()

  const { data: lifeStages } = trpc.admin.lifestage.list.useQuery({ gameId: gameId! })
  const { data: traits } = trpc.admin.personality.list.useQuery({ gameId: gameId! })

  const [selectedStageId, setSelectedStageId] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ActivityForm>(emptyForm())

  const { data: activities } = trpc.admin.stageActivity.listByStage.useQuery(
    { lifeStageId: selectedStageId },
    { enabled: !!selectedStageId }
  )
  const utils = trpc.useUtils()

  const save = trpc.admin.stageActivity.save.useMutation({
    onSuccess: () => {
      utils.admin.stageActivity.listByStage.invalidate({ lifeStageId: selectedStageId })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.stageActivity.remove.useMutation({
    onSuccess: () => {
      utils.admin.stageActivity.listByStage.invalidate({ lifeStageId: selectedStageId })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

  function handleStageChange(id: string) {
    setSelectedStageId(id)
    setEditingId(null)
    setEditing(emptyForm())
  }

  function submit() {
    if (!gameId || !selectedStageId || !editing.name.trim() || !editing.traitDefId || editing.traitEffect === "" || editing.energyCost === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      lifeStageId: selectedStageId,
      traitDefId: editing.traitDefId,
      name: editing.name.trim(),
      traitEffect: parseFloat(editing.traitEffect),
      energyCost: parseFloat(editing.energyCost),
      description: editing.description.trim() || null,
    })
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Stage Activities</h1>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Life Stage</label>
        <select
          value={selectedStageId}
          onChange={(e) => handleStageChange(e.target.value)}
          className="h-8 w-64 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">— Select a life stage —</option>
          {lifeStages?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {selectedStageId && (
        <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {editingId ? "Edit Activity" : "Add Activity"}
              </h2>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Playful Roughhousing"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Trait</label>
                <select
                  value={editing.traitDefId}
                  onChange={(e) => setEditing({ ...editing, traitDefId: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Select trait —</option>
                  {traits?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Trait Effect</label>
                <Input
                  type="number"
                  step="0.1"
                  value={editing.traitEffect}
                  onChange={(e) => setEditing({ ...editing, traitEffect: e.target.value })}
                  placeholder="e.g. 2 or -1"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.energyCost}
                  onChange={(e) => setEditing({ ...editing, energyCost: e.target.value })}
                  placeholder="e.g. 10"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Shown to players"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={submit}
                  disabled={save.isPending || !editing.name.trim() || !editing.traitDefId || editing.traitEffect === "" || editing.energyCost === ""}
                >
                  {editingId ? "Save" : "Add Activity"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>
                  Cancel
                </Button>
              </div>
              {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Activities</h2>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
                + New
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trait</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effect</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Energy</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities?.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{a.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.traitDef.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.traitEffect > 0 ? `+${a.traitEffect}` : a.traitEffect}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.energyCost}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingId(a.id)
                        setEditing({
                          name: a.name,
                          traitDefId: a.traitDefId,
                          traitEffect: a.traitEffect.toString(),
                          energyCost: a.energyCost.toString(),
                          description: a.description ?? "",
                        })
                      }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => { if (!confirm("Delete this activity?")) return; remove.mutate({ id: a.id }) }}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {activities?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No activities for this stage yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
          </section>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/stage-activities")({
  component: StageActivitiesPage,
})
