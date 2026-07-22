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
  const [editing, setEditing] = useState<StepForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.tutorialStep.save.useMutation({
    onSuccess: () => {
      utils.admin.tutorialStep.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.tutorialStep.remove.useMutation({
    onSuccess: () => {
      utils.admin.tutorialStep.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.title.trim() || !editing.stepKey.trim()) return
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
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Tutorial Steps</h1>

      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Step" : "New Step"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Title</label>
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. Welcome to the game"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Step Key</label>
              <Input
                value={editing.stepKey}
                onChange={(e) => setEditing({ ...editing, stepKey: e.target.value })}
                placeholder="e.g. welcome"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Body</label>
              <Input
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Step instructions shown to player"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sort Order</label>
              <Input
                type="number"
                min="0"
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isRequired}
                onChange={(e) => setEditing({ ...editing, isRequired: e.target.checked })}
              />
              Required
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !editing.title.trim() || !editing.stepKey.trim()}>
                {editingId ? "Save" : "Add Step"}
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
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Steps</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
              + New Step
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sort</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Required</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {steps?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{s.title}</td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{s.stepKey}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.sortOrder}</td>
                  <td className="px-3 py-2 text-center">
                    {s.isRequired ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
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
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No tutorial steps yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/tutorial-steps")({
  component: TutorialStepsPage,
})
