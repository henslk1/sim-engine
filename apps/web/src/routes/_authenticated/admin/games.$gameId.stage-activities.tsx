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
  const [editing, setEditing] = useState<ActivityForm | null>(null)

  const { data: activities } = trpc.admin.stageActivity.listByStage.useQuery(
    { lifeStageId: selectedStageId },
    { enabled: !!selectedStageId }
  )
  const utils = trpc.useUtils()

  const save = trpc.admin.stageActivity.save.useMutation({
    onSuccess: () => {
      utils.admin.stageActivity.listByStage.invalidate({ lifeStageId: selectedStageId })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.stageActivity.remove.useMutation({
    onSuccess: () => {
      utils.admin.stageActivity.listByStage.invalidate({ lifeStageId: selectedStageId })
      setEditingId(null)
      setEditing(null)
    },
  })

  function handleStageChange(id: string) {
    setSelectedStageId(id)
    setEditingId(null)
    setEditing(null)
  }

  function submit() {
    if (!editing || !gameId || !selectedStageId || !editing.name.trim() || !editing.traitDefId || editing.traitEffect === "" || editing.energyCost === "") return
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
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Stage Activities</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <label className="text-xs font-medium text-muted-foreground">Life Stage</label>
        <select
          value={selectedStageId}
          onChange={(e) => handleStageChange(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— Select a life stage —</option>
          {lifeStages?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </section>

      {selectedStageId && (
        <>
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Activities</h2>
              <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
                + Add Activity
              </Button>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trait</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effect</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Energy</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities?.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.traitDef.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.traitEffect > 0 ? `+${a.traitEffect}` : a.traitEffect}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.energyCost}</td>
                    <td className="px-4 py-2 text-right space-x-1">
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
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No activities for this stage yet.</td>
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
                  {editingId ? "Edit Activity" : "Add Activity"}
                </h2>
              </header>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="e.g. Playful Roughhousing"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Trait</label>
                    <select
                      value={editing.traitDefId}
                      onChange={(e) => setEditing({ ...editing, traitDefId: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— Select trait —</option>
                      {traits?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Trait Effect <span className="font-normal">— signed, e.g. 2 or -1</span></label>
                    <Input
                      type="number"
                      step="0.1"
                      value={editing.traitEffect}
                      onChange={(e) => setEditing({ ...editing, traitEffect: e.target.value })}
                      placeholder="e.g. 2"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Energy Cost</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editing.energyCost}
                      onChange={(e) => setEditing({ ...editing, energyCost: e.target.value })}
                      placeholder="e.g. 10"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description <span className="font-normal">— optional</span></label>
                  <Input
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Shown to players"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={submit}
                    disabled={save.isPending || !editing.name.trim() || !editing.traitDefId || editing.traitEffect === "" || editing.energyCost === ""}
                  >
                    {editingId ? "Save" : "Add Activity"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
                    Cancel
                  </Button>
                </div>
                {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/stage-activities")({
  component: StageActivitiesPage,
})
