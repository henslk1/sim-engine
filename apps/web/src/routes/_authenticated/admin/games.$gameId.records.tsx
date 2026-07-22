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
  const [editing, setEditing] = useState<RecordForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.record.save.useMutation({
    onSuccess: () => {
      utils.admin.record.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.record.remove.useMutation({
    onSuccess: () => {
      utils.admin.record.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || !editing.recordType.trim() || !editing.subjectType.trim()) return
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
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Records</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Record Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Record
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discipline</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Breed</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records?.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.recordType}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.subjectType}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.disciplineDef?.name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.breed?.name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.statDef?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
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
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No record definitions yet.</td>
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
              {editingId ? "Edit Record" : "Add Record"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Fastest Sprint"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Record Type</label>
                <Input
                  value={editing.recordType}
                  onChange={(e) => setEditing({ ...editing, recordType: e.target.value })}
                  placeholder="e.g. SPEED, SCORE"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Subject Type</label>
                <Input
                  value={editing.subjectType}
                  onChange={(e) => setEditing({ ...editing, subjectType: e.target.value })}
                  placeholder="e.g. ANIMAL, PLAYER"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Discipline <span className="font-normal">(optional)</span></label>
                <select
                  value={editing.disciplineDefId}
                  onChange={(e) => setEditing({ ...editing, disciplineDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Breed <span className="font-normal">(optional)</span></label>
                <select
                  value={editing.breedId}
                  onChange={(e) => setEditing({ ...editing, breedId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {breeds?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Stat <span className="font-normal">(optional)</span></label>
                <select
                  value={editing.statDefId}
                  onChange={(e) => setEditing({ ...editing, statDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || !editing.recordType.trim() || !editing.subjectType.trim()}
              >
                {editingId ? "Save" : "Add Record"}
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

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/records")({
  component: RecordsPage,
})
