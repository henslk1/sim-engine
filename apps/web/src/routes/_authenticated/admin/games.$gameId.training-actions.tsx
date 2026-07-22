import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TrainingForm = { name: string; statDefId: string; baseGain: string }
const emptyForm = (): TrainingForm => ({ name: "", statDefId: "", baseGain: "" })

function TrainingActionsPage() {
  const { gameId } = Route.useParams()

  const { data: actions } = trpc.admin.training.list.useQuery({ gameId: gameId! })
  const { data: stats } = trpc.admin.stat.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TrainingForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.training.save.useMutation({
    onSuccess: () => {
      utils.admin.training.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.training.remove.useMutation({
    onSuccess: () => {
      utils.admin.training.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

  function openEdit(a: NonNullable<typeof actions>[number]) {
    setEditingId(a.id)
    setEditing({ name: a.name, statDefId: a.statDefId, baseGain: a.baseGain.toString() })
  }

  function submit() {
    if (!gameId || !editing.name.trim() || !editing.statDefId || !editing.baseGain) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      statDefId: editing.statDefId,
      baseGain: parseFloat(editing.baseGain),
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Training Actions</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[280px_1fr] gap-2 items-start">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Training Action" : "New Training Action"}
            </h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Flatwork"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stat</label>
              <select
                value={editing.statDefId}
                onChange={(e) => setEditing({ ...editing, statDefId: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select stat —</option>
                {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Base Gain</label>
              <Input
                className="h-8 text-sm"
                type="number"
                step="0.01"
                value={editing.baseGain}
                onChange={(e) => setEditing({ ...editing, baseGain: e.target.value })}
                placeholder="e.g. 1.5"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-8 text-sm" onClick={submit} disabled={save.isPending || !editing.name.trim() || !editing.statDefId || !editing.baseGain}>Save</Button>
              {editingId && (
                <Button className="h-8 text-sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>Cancel</Button>
              )}
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base Gain</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actions?.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{a.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.statDef.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.baseGain}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this training action?")) return; remove.mutate({ id: a.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {actions?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No training actions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </div>
      </div>
    </div>
  </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/training-actions")({
  component: TrainingActionsPage,
})
