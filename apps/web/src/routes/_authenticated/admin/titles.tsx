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
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: titles } = trpc.admin.title.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: disciplines } = trpc.admin.discipline.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TitleForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const utils = trpc.useUtils()

  const save = trpc.admin.title.save.useMutation({
    onSuccess: () => {
      utils.admin.title.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setFormExpanded(false)
    },
  })
  const remove = trpc.admin.title.remove.useMutation({
    onSuccess: () => {
      utils.admin.title.list.invalidate({ gameId: gameId! })
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

  function openEdit(t: NonNullable<typeof titles>[number]) {
    setEditingId(t.id)
    setEditing({
      name: t.name,
      description: t.description ?? "",
      disciplineDefId: t.disciplineDefId ?? "",
      rankOrder: t.rankOrder.toString(),
    })
    setFormExpanded(true)
  }

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || editing.rankOrder === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      disciplineDefId: editing.disciplineDefId || null,
      rankOrder: parseInt(editing.rankOrder),
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Titles</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Titles</h2>
          <Button size="sm" onClick={openAdd}>+ New Title</Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discipline</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rank Order</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {titles?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.disciplineDef?.name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.rankOrder}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
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
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No titles yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {formExpanded && editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Title" : "New Title"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Grand Champion"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rank Order</label>
                <Input
                  type="number"
                  min="0"
                  value={editing.rankOrder}
                  onChange={(e) => setEditing({ ...editing, rankOrder: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Discipline <span className="font-normal">— optional</span></label>
                <select
                  value={editing.disciplineDefId}
                  onChange={(e) => setEditing({ ...editing, disciplineDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Any discipline —</option>
                  {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || editing.rankOrder === ""}
              >
                {editingId ? "Save" : "Add Title"}
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

export const Route = createFileRoute("/_authenticated/admin/titles")({
  component: TitlesPage,
})
