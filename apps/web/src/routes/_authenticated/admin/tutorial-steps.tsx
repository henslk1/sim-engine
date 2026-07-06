import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type StepForm = {
  stepKey: string
  name: string
  description: string
  stepIndex: string
}
const emptyForm = (): StepForm => ({ stepKey: "", name: "", description: "", stepIndex: "" })

function TutorialStepsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: steps } = trpc.admin.tutorialStep.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

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
    if (!editing || !gameId || !editing.stepKey.trim() || !editing.name.trim() || editing.stepIndex === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      stepKey: editing.stepKey.trim(),
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      stepIndex: parseInt(editing.stepIndex),
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Tutorial Steps</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Steps</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Step
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {steps?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{s.stepIndex}</td>
                <td className="px-4 py-2 font-mono text-xs text-foreground">{s.stepKey}</td>
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.description ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(s.id)
                    setEditing({
                      stepKey: s.stepKey,
                      name: s.name,
                      description: s.description ?? "",
                      stepIndex: s.stepIndex.toString(),
                    })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this tutorial step? This will remove all player progress records for this step.")) return; remove.mutate({ id: s.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {steps?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No tutorial steps defined yet.</td>
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
              {editingId ? "Edit Step" : "Add Step"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Step Index</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editing.stepIndex}
                  onChange={(e) => setEditing({ ...editing, stepIndex: e.target.value })}
                  placeholder="e.g. 1"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Step Key</label>
                <Input
                  value={editing.stepKey}
                  onChange={(e) => setEditing({ ...editing, stepKey: e.target.value })}
                  placeholder="e.g. BUY_FIRST_ANIMAL"
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Buy your first animal"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description <span className="font-normal">(optional)</span></label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.stepKey.trim() || !editing.name.trim() || editing.stepIndex === ""}
              >
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

export const Route = createFileRoute("/_authenticated/admin/tutorial-steps")({
  component: TutorialStepsPage,
})
