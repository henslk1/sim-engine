import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type StepForm = {
  name: string
  description: string
  stepKey: string
  stepIndex: string
  competitionDisciplineId: string
  competitionNpcCount: string
  triggerConditionDefId: string
}
const emptyForm = (): StepForm => ({
  name: "",
  description: "",
  stepKey: "",
  stepIndex: "",
  competitionDisciplineId: "",
  competitionNpcCount: "",
  triggerConditionDefId: "",
})

function TutorialStepsPage() {
  const { gameId } = Route.useParams()

  const { data: steps } = trpc.admin.tutorialStep.list.useQuery({ gameId: gameId! })
  const { data: disciplines } = trpc.admin.discipline.list.useQuery({ gameId: gameId! })
  const { data: conditions } = trpc.admin.health.list.useQuery({ gameId: gameId! })

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
    onSuccess: () => utils.admin.tutorialStep.list.invalidate({ gameId: gameId! }),
  })

  function submit() {
    if (!gameId || !editing.name.trim() || !editing.stepKey.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      stepKey: editing.stepKey.trim(),
      stepIndex: editing.stepIndex !== "" ? parseInt(editing.stepIndex) : 0,
      competitionDisciplineId: editing.competitionDisciplineId || null,
      competitionNpcCount: editing.competitionNpcCount !== "" ? parseInt(editing.competitionNpcCount) : null,
      triggerConditionDefId: editing.triggerConditionDefId || null,
    })
  }

  function set(key: keyof StepForm, value: string) {
    setEditing(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Tutorial Steps</h1>

      <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Step" : "New Step"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input value={editing.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Welcome to the game" className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Step Key</label>
              <Input value={editing.stepKey} onChange={(e) => set("stepKey", e.target.value)} placeholder="e.g. welcome" className="h-8 text-sm font-mono" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Step Index</label>
              <Input type="number" min="0" value={editing.stepIndex} onChange={(e) => set("stepIndex", e.target.value)} placeholder="0" className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
              <Input value={editing.description} onChange={(e) => set("description", e.target.value)} placeholder="Instructions shown to player" className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Competition Discipline</label>
              <select
                value={editing.competitionDisciplineId}
                onChange={(e) => set("competitionDisciplineId", e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— none —</option>
                {disciplines?.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Competition NPC Count</label>
              <Input type="number" min="0" value={editing.competitionNpcCount} onChange={(e) => set("competitionNpcCount", e.target.value)} placeholder="e.g. 4" className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Trigger Condition</label>
              <select
                value={editing.triggerConditionDefId}
                onChange={(e) => set("triggerConditionDefId", e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— none —</option>
                {conditions?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !editing.name.trim() || !editing.stepKey.trim()}>
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
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Competition</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {steps?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{s.stepIndex}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{s.stepKey}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {s.competitionDiscipline ? `${s.competitionDiscipline.name} ×${s.competitionNpcCount ?? "?"}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(s.id)
                      setEditing({
                        name: s.name,
                        description: s.description ?? "",
                        stepKey: s.stepKey,
                        stepIndex: s.stepIndex.toString(),
                        competitionDisciplineId: s.competitionDisciplineId ?? "",
                        competitionNpcCount: s.competitionNpcCount?.toString() ?? "",
                        triggerConditionDefId: s.triggerConditionDefId ?? "",
                      })
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
