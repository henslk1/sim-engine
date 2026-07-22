import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TitleForm = {
  name: string
  description: string
  disciplineDefId: string
  rankOrder: string
}
const emptyForm = (): TitleForm => ({ name: "", description: "", disciplineDefId: "", rankOrder: "" })

function TitlesPage() {
  const { gameId } = Route.useParams()

  const { data: titles } = trpc.admin.title.list.useQuery({ gameId: gameId! })
  const { data: disciplines } = trpc.admin.discipline.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TitleForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.title.save.useMutation({
    onSuccess: () => {
      utils.admin.title.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.title.remove.useMutation({
    onSuccess: () => {
      utils.admin.title.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

  function openEdit(t: NonNullable<typeof titles>[number]) {
    setEditingId(t.id)
    setEditing({
      name: t.name,
      description: t.description ?? "",
      disciplineDefId: t.disciplineDefId ?? "",
      rankOrder: t.rankOrder.toString(),
    })
  }

  function submit() {
    if (!gameId || !editing.name.trim() || editing.rankOrder === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      disciplineDefId: editing.disciplineDefId || null,
      rankOrder: parseInt(editing.rankOrder),
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Titles</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[280px_1fr] gap-2 items-start">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Title" : "New Title"}
            </h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Grand Champion"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Rank Order</label>
              <Input
                className="h-8 text-sm"
                type="number"
                min="0"
                value={editing.rankOrder}
                onChange={(e) => setEditing({ ...editing, rankOrder: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Discipline <span className="font-normal normal-case">— optional</span></label>
              <select
                value={editing.disciplineDefId}
                onChange={(e) => setEditing({ ...editing, disciplineDefId: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Any discipline —</option>
                {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description <span className="font-normal normal-case">— optional</span></label>
              <Input
                className="h-8 text-sm"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Shown to players"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-8 text-sm" onClick={submit} disabled={save.isPending || !editing.name.trim() || editing.rankOrder === ""}>Save</Button>
              {editingId && (
                <Button className="h-8 text-sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>Cancel</Button>
              )}
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Titles</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discipline</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rank Order</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {titles?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.disciplineDef?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.rankOrder}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this title?")) return; remove.mutate({ id: t.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {titles?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No titles yet.</td>
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

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/titles")({
  component: TitlesPage,
})
