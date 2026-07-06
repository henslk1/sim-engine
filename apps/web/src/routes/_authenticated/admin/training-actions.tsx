import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TrainingForm = { name: string; statDefId: string; baseGain: string }
const emptyForm = (): TrainingForm => ({ name: "", statDefId: "", baseGain: "" })

function TrainingActionsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: actions } = trpc.admin.training.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: stats } = trpc.admin.stat.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TrainingForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const utils = trpc.useUtils()

  const save = trpc.admin.training.save.useMutation({
    onSuccess: () => {
      utils.admin.training.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setFormExpanded(false)
    },
  })
  const remove = trpc.admin.training.remove.useMutation({
    onSuccess: () => {
      utils.admin.training.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setFormExpanded(false)
    },
  })

  function openAdd() {
    setEditingId(null)
    setEditing(emptyForm())
    setFormExpanded(true)
  }

  function openEdit(a: NonNullable<typeof actions>[number]) {
    setEditingId(a.id)
    setEditing({ name: a.name, statDefId: a.statDefId, baseGain: a.baseGain.toString() })
    setFormExpanded(true)
  }

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || !editing.statDefId || !editing.baseGain) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      statDefId: editing.statDefId,
      baseGain: parseFloat(editing.baseGain),
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Training Actions</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Actions</h2>
          <Button size="sm" onClick={openAdd}>+ New Training Action</Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base Gain</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {actions?.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{a.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{a.statDef.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{a.baseGain}</td>
                <td className="px-4 py-2 text-right space-x-1">
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
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No training actions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {formExpanded && editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Training Action" : "New Training Action"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Flatwork"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Stat</label>
                <select
                  value={editing.statDefId}
                  onChange={(e) => setEditing({ ...editing, statDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select stat —</option>
                  {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Base Gain</label>
              <Input
                type="number"
                step="0.01"
                value={editing.baseGain}
                onChange={(e) => setEditing({ ...editing, baseGain: e.target.value })}
                placeholder="e.g. 1.5"
                className="mt-1 max-w-xs"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || !editing.statDefId || !editing.baseGain}
              >
                {editingId ? "Save" : "Add Training Action"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null); setFormExpanded(false) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/training-actions")({
  component: TrainingActionsPage,
})
