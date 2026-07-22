import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type StepForm = {
  title: string
  body: string
  stepKey: string
  sortOrder: string
  isRequired: boolean
}
const emptyForm = (): StepForm => ({ title: "", body: "", stepKey: "", sortOrder: "", isRequired: true })

function TutorialStepsPage() {
  const { gameId } = Route.useParams()

  const { data: steps } = trpc.admin.tutorialStep.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<StepForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.tutorialStep.save.useMutation({
    onSuccess: () => {
      utils.admin.tutorialStep.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.tutorialStep.remove.useMutation({
    onSuccess: () => {
      utils.admin.tutorialStep.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.title.trim() || !editing.stepKey.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      title: editing.title.trim(),
      body: editing.body.trim() || null,
      stepKey: editing.stepKey.trim(),
      sortOrder: editing.sortOrder !== "" ? parseInt(editing.sortOrder) : 0,
      isRequired: editing.isRequired,
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Tutorial Steps</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Steps</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + New Step
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {steps?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{s.title}</td>
                <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{s.stepKey}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.sortOrder}</td>
                <td className="px-4 py-2 text-center">
                  {s.isRequired ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(s.id)
                    setEditing({ title: s.title, body: s.body ?? "", stepKey: s.stepKey, sortOrder: s.sortOrder.toString(), isRequired: s.isRequired })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this step?")) return; remove.mutate({ id: s.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {steps?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No tutorial steps yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Step" : "New Step"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Welcome to the game"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Step Key</label>
                <Input
                  value={editing.stepKey}
                  onChange={(e) => setEditing({ ...editing, stepKey: e.target.value })}
                  placeholder="e.g. welcome"
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Body <span className="font-normal">— optional</span></label>
              <Input
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Step instructions shown to player"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
                <Input
                  type="number"
                  min="0"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isRequired}
                    onChange={(e) => setEditing({ ...editing, isRequired: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={save.isPending || !editing.title.trim() || !editing.stepKey.trim()}>
                {editingId ? "Save" : "Add Step"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
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

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/tutorial-steps")({
  component: TutorialStepsPage,
})
