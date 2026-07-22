import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type FilterForm = {
  name: string
  filterKey: string
  filterType: string
  sortOrder: string
}
const emptyForm = (): FilterForm => ({ name: "", filterKey: "", filterType: "SELECT", sortOrder: "" })

function DirectoryFiltersPage() {
  const { gameId } = Route.useParams()

  const { data: filters } = trpc.admin.directoryFilter.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<FilterForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.directoryFilter.save.useMutation({
    onSuccess: () => {
      utils.admin.directoryFilter.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.directoryFilter.remove.useMutation({
    onSuccess: () => {
      utils.admin.directoryFilter.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || !editing.filterKey.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      filterKey: editing.filterKey.trim(),
      filterType: editing.filterType,
      sortOrder: editing.sortOrder !== "" ? parseInt(editing.sortOrder) : 0,
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Directory Filters</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Filters</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + New Filter
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters?.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{f.name}</td>
                <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{f.filterKey}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.filterType}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.sortOrder}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(f.id)
                    setEditing({ name: f.name, filterKey: f.filterKey, filterType: f.filterType, sortOrder: f.sortOrder.toString() })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this filter?")) return; remove.mutate({ id: f.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {filters?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No directory filters yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Filter" : "New Filter"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Breed"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Filter Key</label>
                <Input
                  value={editing.filterKey}
                  onChange={(e) => setEditing({ ...editing, filterKey: e.target.value })}
                  placeholder="e.g. breed"
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Filter Type</label>
                <select
                  value={editing.filterType}
                  onChange={(e) => setEditing({ ...editing, filterType: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="SELECT">SELECT</option>
                  <option value="RANGE">RANGE</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                </select>
              </div>
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
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={save.isPending || !editing.name.trim() || !editing.filterKey.trim()}>
                {editingId ? "Save" : "Add Filter"}
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

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/directory-filters")({
  component: DirectoryFiltersPage,
})
