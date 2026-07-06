import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type FilterForm = {
  filterKey: string
  displayLabel: string
  filterType: string
  isEnabled: boolean
  sortOrder: string
}
const emptyForm = (): FilterForm => ({
  filterKey: "",
  displayLabel: "",
  filterType: "",
  isEnabled: true,
  sortOrder: "",
})

function DirectoryFiltersPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: filters } = trpc.admin.directoryFilter.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

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
    if (!editing || !gameId || !editing.filterKey.trim() || !editing.displayLabel.trim() || !editing.filterType.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      filterKey: editing.filterKey.trim(),
      displayLabel: editing.displayLabel.trim(),
      filterType: editing.filterType.trim(),
      isEnabled: editing.isEnabled,
      sortOrder: editing.sortOrder !== "" ? parseInt(editing.sortOrder) : null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Directory Filters</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Filter Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Filter
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enabled</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters?.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-foreground">{f.filterKey}</td>
                <td className="px-4 py-2 text-foreground">{f.displayLabel}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.filterType}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.sortOrder ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.isEnabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(f.id)
                    setEditing({
                      filterKey: f.filterKey,
                      displayLabel: f.displayLabel,
                      filterType: f.filterType,
                      isEnabled: f.isEnabled,
                      sortOrder: f.sortOrder?.toString() ?? "",
                    })
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
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No directory filters defined yet.</td>
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
              {editingId ? "Edit Filter" : "Add Filter"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Filter Key</label>
                <Input
                  value={editing.filterKey}
                  onChange={(e) => setEditing({ ...editing, filterKey: e.target.value })}
                  placeholder="e.g. BREED"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Display Label</label>
                <Input
                  value={editing.displayLabel}
                  onChange={(e) => setEditing({ ...editing, displayLabel: e.target.value })}
                  placeholder="e.g. Breed"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Filter Type</label>
                <Input
                  value={editing.filterType}
                  onChange={(e) => setEditing({ ...editing, filterType: e.target.value })}
                  placeholder="e.g. SELECT, RANGE, BOOLEAN"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sort Order <span className="font-normal">(optional)</span></label>
                <Input
                  type="number"
                  step="1"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                  placeholder="e.g. 1"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isEnabled}
                  onChange={(e) => setEditing({ ...editing, isEnabled: e.target.checked })}
                  className="rounded border-input"
                />
                <span>Enabled</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.filterKey.trim() || !editing.displayLabel.trim() || !editing.filterType.trim()}
              >
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

export const Route = createFileRoute("/_authenticated/admin/directory-filters")({
  component: DirectoryFiltersPage,
})
