import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type RecordForm = {
  name: string
  description: string
  recordType: string
  subjectType: string
  disciplineDefId: string
  breedId: string
  statDefId: string
}
const emptyForm = (): RecordForm => ({
  name: "",
  description: "",
  recordType: "",
  subjectType: "",
  disciplineDefId: "",
  breedId: "",
  statDefId: "",
})

function RecordsPage() {
  const { gameId } = Route.useParams()

  const { data: records } = trpc.admin.record.list.useQuery(
    { gameId: gameId! }
  )
  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! }
  )
  const { data: breeds } = trpc.admin.breed.list.useQuery(
    { gameId: gameId! }
  )
  const { data: stats } = trpc.admin.stat.list.useQuery(
    { gameId: gameId! }
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<RecordForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.record.save.useMutation({
    onSuccess: () => {
      utils.admin.record.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.record.remove.useMutation({
    onSuccess: () => {
      utils.admin.record.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.name.trim() || !editing.recordType.trim() || !editing.subjectType.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      recordType: editing.recordType.trim(),
      subjectType: editing.subjectType.trim(),
      disciplineDefId: editing.disciplineDefId || null,
      breedId: editing.breedId || null,
      statDefId: editing.statDefId || null,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Records</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Record" : "Add Record"}
            </h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Fastest Sprint"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Brief description"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Record Type</label>
              <Input
                value={editing.recordType}
                onChange={(e) => setEditing({ ...editing, recordType: e.target.value })}
                placeholder="e.g. SPEED, SCORE"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Subject Type</label>
              <Input
                value={editing.subjectType}
                onChange={(e) => setEditing({ ...editing, subjectType: e.target.value })}
                placeholder="e.g. ANIMAL, PLAYER"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Discipline</label>
              <select
                value={editing.disciplineDefId}
                onChange={(e) => setEditing({ ...editing, disciplineDefId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Breed</label>
              <select
                value={editing.breedId}
                onChange={(e) => setEditing({ ...editing, breedId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {breeds?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stat</label>
              <select
                value={editing.statDefId}
                onChange={(e) => setEditing({ ...editing, statDefId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || !editing.recordType.trim() || !editing.subjectType.trim()}
              >
                {editingId ? "Save" : "Add Record"}
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
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Record Definitions</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
              + New
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discipline</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records?.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.recordType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.subjectType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.disciplineDef?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.breed?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.statDef?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(r.id)
                      setEditing({
                        name: r.name,
                        description: r.description ?? "",
                        recordType: r.recordType,
                        subjectType: r.subjectType,
                        disciplineDefId: r.disciplineDefId ?? "",
                        breedId: r.breedId ?? "",
                        statDefId: r.statDefId ?? "",
                      })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this record? This will remove all entries.")) return; remove.mutate({ id: r.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {records?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No record definitions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </section>
      </div>
    </div>
  </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/records")({
  component: RecordsPage,
})
