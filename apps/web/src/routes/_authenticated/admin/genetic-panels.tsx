import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type PanelForm = {
  id?: string
  name: string
  panelType: "HEALTH" | "CONFORMATION"
}
const emptyPanel = (): PanelForm => ({ name: "", panelType: "HEALTH" })

function GeneticPanelsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: panels } = trpc.admin.panel.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: allLoci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const utils = trpc.useUtils()
  const savePanel = trpc.admin.panel.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.panel.list.invalidate()
      setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
      setFormExpanded(false)
    },
  })
  const removePanel = trpc.admin.panel.remove.useMutation({
    onSuccess: () => {
      utils.admin.panel.list.invalidate()
      setEditing(null)
    },
  })
  const addPanelLocus = trpc.admin.panel.addPanelLocus.useMutation()
  const removePanelLocus = trpc.admin.panel.removePanelLocus.useMutation()

  const [editing, setEditing] = useState<PanelForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const [stagedLocusIds, setStagedLocusIds] = useState<Set<string> | null>(null)

  const { data: panelLoci } = trpc.admin.panel.listPanelLoci.useQuery(
    { panelDefId: editing?.id! },
    { enabled: !!editing?.id }
  )

  const serverLocusIds = new Set(panelLoci?.map((pl) => pl.locusId) ?? [])
  const locusIds = stagedLocusIds ?? serverLocusIds
  const lociIsDirty =
    stagedLocusIds !== null &&
    (stagedLocusIds.size !== serverLocusIds.size ||
      [...stagedLocusIds].some((id) => !serverLocusIds.has(id)))

  function openEdit(panel: NonNullable<typeof panels>[number]) {
    setEditing({ id: panel.id, name: panel.name, panelType: panel.panelType })
    setFormExpanded(false)
    setStagedLocusIds(null)
  }

  function submitPanel() {
    if (!editing || !gameId) return
    savePanel.mutate({ ...editing, gameId })
  }

  function toggleLocus(locusId: string) {
    const current = stagedLocusIds ?? serverLocusIds
    const next = new Set(current)
    if (next.has(locusId)) next.delete(locusId)
    else next.add(locusId)
    setStagedLocusIds(next)
  }

  async function saveLoci() {
    if (!editing?.id || !panelLoci) return
    const toAdd = [...locusIds].filter((id) => !serverLocusIds.has(id))
    const toRemove = panelLoci.filter((pl) => !locusIds.has(pl.locusId))
    await Promise.all([
      ...toAdd.map((locusId) => addPanelLocus.mutateAsync({ panelDefId: editing.id!, locusId })),
      ...toRemove.map((pl) => removePanelLocus.mutateAsync({ id: pl.id })),
    ])
    await utils.admin.panel.listPanelLoci.invalidate({ panelDefId: editing.id })
    utils.admin.panel.list.invalidate()
    setStagedLocusIds(null)
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Panel"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Panel Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>
                Edit Details
              </Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Panel Type</label>
                <select
                  value={editing.panelType}
                  onChange={(e) =>
                    setEditing({ ...editing, panelType: e.target.value as PanelForm["panelType"] })
                  }
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="HEALTH">Health</option>
                  <option value="CONFORMATION">Conformation</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitPanel} disabled={savePanel.isPending || !editing.name.trim()}>
                  Save
                </Button>
                {editing.id && (
                  <Button variant="ghost" onClick={() => setFormExpanded(false)}>
                    Cancel
                  </Button>
                )}
              </div>
              {savePanel.error && (
                <p className="text-sm text-destructive">{savePanel.error.message}</p>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p>
                <span className="text-muted-foreground">Name:</span> {editing.name}
              </p>
              <p>
                <span className="text-muted-foreground">Type:</span> {editing.panelType}
              </p>
            </div>
          )}
        </section>

        {editing.id && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Loci Included</h2>
              {lociIsDirty && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveLoci}
                    disabled={addPanelLocus.isPending || removePanelLocus.isPending}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStagedLocusIds(null)}>
                    Revert
                  </Button>
                </div>
              )}
            </header>
            {!allLoci?.length ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No loci configured yet. Add loci in Loci & Alleles first.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {allLoci.map((locus) => (
                  <li key={locus.id} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-foreground">
                      {locus.name}
                      {locus.displayGroup && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({locus.displayGroup})
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={locusIds.has(locus.id)}
                      onChange={() => toggleLocus(locus.id)}
                      disabled={addPanelLocus.isPending || removePanelLocus.isPending}
                      className="h-4 w-4 accent-primary"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removePanel.error && (
              <p className="text-sm text-destructive">{removePanel.error.message}</p>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this genetic panel?")) return
                removePanel.mutate({ id: editing.id! })
              }}
              disabled={removePanel.isPending}
            >
              Delete Panel
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Genetic Panels</h1>
        <Button
          onClick={() => {
            setEditing(emptyPanel())
            setFormExpanded(true)
          }}
        >
          + New Panel
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type
              </th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Loci
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {panels?.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{p.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.panelType}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{p._count.loci}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {panels?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No panels yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/genetic-panels")({
  component: GeneticPanelsPage,
})
