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
  const { gameId } = Route.useParams()

  const { data: panels } = trpc.admin.panel.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: allLoci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()
  const savePanel = trpc.admin.panel.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.panel.list.invalidate()
      setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
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

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Genetic Panels</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <div className="space-y-3">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Panels</h2>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyPanel()); setStagedLocusIds(null) }}>
                + New
              </Button>
            </div>
            {panels?.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">No panels yet.</p>
            )}
            <ul className="divide-y divide-border">
              {panels?.map((p) => (
                <li
                  key={p.id}
                  onClick={() => openEdit(p)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 ${editing?.id === p.id ? "bg-muted/50" : ""}`}
                >
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{p.panelType} · {p._count.loci}</span>
                </li>
              ))}
            </ul>
          </section>

          {editing !== null && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {editing.id ? "Edit Panel" : "New Panel"}
                </h2>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Panel Type</label>
                  <select
                    value={editing.panelType}
                    onChange={(e) => setEditing({ ...editing, panelType: e.target.value as PanelForm["panelType"] })}
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="HEALTH">Health</option>
                    <option value="CONFORMATION">Conformation</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={submitPanel} disabled={savePanel.isPending || !editing.name.trim()}>
                    Save
                  </Button>
                  {editing.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this genetic panel?")) return
                        removePanel.mutate({ id: editing.id! })
                      }}
                      disabled={removePanel.isPending}
                    >
                      Delete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setStagedLocusIds(null) }}>
                    Cancel
                  </Button>
                </div>
                {savePanel.error && <p className="text-sm text-destructive">{savePanel.error.message}</p>}
                {removePanel.error && <p className="text-sm text-destructive">{removePanel.error.message}</p>}
              </div>
            </section>
          )}
        </div>

        {editing?.id ? (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Loci Included</h2>
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
            </div>
            {!allLoci?.length ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No loci configured yet. Add loci in Loci & Alleles first.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {allLoci.map((locus) => (
                  <li key={locus.id} className="flex items-center justify-between px-3 py-2">
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
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-12 text-center text-sm text-muted-foreground">
            Select a panel to manage its loci
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/genetic-panels")({
  component: GeneticPanelsPage,
})
