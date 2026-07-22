import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function StatPage() {
  const { gameId } = Route.useParams()

  const { data: stat } = trpc.admin.stat.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()
  const save = trpc.admin.stat.save.useMutation({
    onSuccess: () => utils.admin.stat.list.invalidate(),
  })
  const remove = trpc.admin.stat.remove.useMutation({
    onSuccess: () => utils.admin.stat.list.invalidate(),
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
    if (!confirm("Delete this stat? This will fail if breeds are assigned to it.")) return
    remove.mutate({ id })
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Stats</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-secondary/40 px-3 py-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stat List</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stat?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                {editingId === s.id ? (
                  <>
                    <td className="px-3 py-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitEdit(s.id)}
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <Button size="sm" onClick={() => submitEdit(s.id)} disabled={save.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-foreground">{s.name}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(s.id, s.name)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">Delete</Button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New stat name"
                  onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                  className="h-7 text-sm"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" onClick={submitAdd} disabled={save.isPending || !newName.trim()}>Add</Button>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/stats")({
  component: StatPage,
})
