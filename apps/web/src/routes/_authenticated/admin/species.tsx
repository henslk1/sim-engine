import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function SpeciesPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: species } = trpc.admin.species.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const utils = trpc.useUtils()
  const save = trpc.admin.species.save.useMutation({
    onSuccess: () => utils.admin.species.list.invalidate(),
  })
  const remove = trpc.admin.species.remove.useMutation({
    onSuccess: () => utils.admin.species.list.invalidate(),
  })

  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  function startEdit(id: string, currentName: string) {
    setEditingId(id)
    setEditName(currentName)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName("")
  }

  function submitEdit(id: string) {
    save.mutate(
      { id, gameId: gameId!, name: editName },
      { onSuccess: () => { setEditingId(null); setEditName("") } }
    )
  }

  function submitAdd() {
    if (!newName.trim() || !gameId) return
    save.mutate({ gameId, name: newName.trim() }, {
      onSuccess: () => setNewName(""),
    })
  }

  function handleRemove(id: string) {
    if (!confirm("Delete this species? This will fail if breeds are assigned to it.")) return
    remove.mutate({ id })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Species</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Species List</h2>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {species?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                {editingId === s.id ? (
                  <>
                    <td className="px-4 py-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitEdit(s.id)}
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <Button size="sm" onClick={() => submitEdit(s.id)} disabled={save.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 text-foreground">{s.name}</td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(s.id, s.name)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">Delete</Button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New species name"
                  onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                  className="h-7 text-sm"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" onClick={submitAdd} disabled={save.isPending || !newName.trim()}>Add</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/species")({
  component: SpeciesPage,
})
