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
  const [editing, setEditing] = useState<FilterForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.directoryFilter.save.useMutation({
    onSuccess: () => {
      utils.admin.directoryFilter.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.directoryFilter.remove.useMutation({
    onSuccess: () => {
      utils.admin.directoryFilter.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.name.trim() || !editing.filterKey.trim()) return
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
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Directory Filters</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Filter" : "New Filter"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Breed"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Filter Key</label>
              <Input
                value={editing.filterKey}
                onChange={(e) => setEditing({ ...editing, filterKey: e.target.value })}
                placeholder="e.g. breed"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Filter Type</label>
              <select
                value={editing.filterType}
                onChange={(e) => setEditing({ ...editing, filterType: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="SELECT">SELECT</option>
                <option value="RANGE">RANGE</option>
                <option value="BOOLEAN">BOOLEAN</option>
              </select>
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
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !editing.name.trim() || !editing.filterKey.trim()}>
                {editingId ? "Save" : "Add Filter"}
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
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filters</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
              + New Filter
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sort</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filters?.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{f.name}</td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{f.filterKey}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.filterType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.sortOrder}</td>
                  <td className="px-3 py-2 text-right space-x-1">
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
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No directory filters yet.</td>
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

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/directory-filters")({
  component: DirectoryFiltersPage,
})
