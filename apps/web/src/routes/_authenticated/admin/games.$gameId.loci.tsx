import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type LocusForm = {
  id?: string
  name: string
  displayGroup: string
  biasTarget: "FAVORABILITY" | "RARITY" | "NONE"
  minTestCycle: number | null
}
const emptyLocus = (): LocusForm => ({ name: "", displayGroup: "", biasTarget: "NONE", minTestCycle: null })

type AlleleRow = { symbol: string; isAvailable: boolean }
const emptyAllele = (): AlleleRow => ({ symbol: "", isAvailable: false })

function LociPage() {
  const { gameId } = Route.useParams()

  const { data: loci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()
  const saveLocus = trpc.admin.locus.save.useMutation({
    onSuccess: () => utils.admin.locus.list.invalidate(),
  })
  const removeLocus = trpc.admin.locus.remove.useMutation({
    onSuccess: () => {
      utils.admin.locus.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<LocusForm | null>(null)

  const { data: alleles } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveAllele = trpc.admin.locus.saveAllele.useMutation({
    onSuccess: () => {
      utils.admin.locus.listAlleles.invalidate({ locusId: editing?.id })
      utils.admin.locus.list.invalidate()
    },
  })
  const removeAllele = trpc.admin.locus.removeAllele.useMutation({
    onSuccess: () => {
      utils.admin.locus.listAlleles.invalidate({ locusId: editing?.id })
      utils.admin.locus.list.invalidate()
    },
  })

  const [editingAlleleId, setEditingAlleleId] = useState<string | null>(null)
  const [editingAllele, setEditingAllele] = useState<AlleleRow>(emptyAllele())
  const [newAllele, setNewAllele] = useState<AlleleRow>(emptyAllele())

  function openEdit(locus: NonNullable<typeof loci>[number]) {
    setEditing({ id: locus.id, name: locus.name, displayGroup: locus.displayGroup ?? "", biasTarget: locus.biasTarget, minTestCycle: locus.minTestCycle ?? null })
    setEditingAlleleId(null)
    setEditingAllele(emptyAllele())
    setNewAllele(emptyAllele())
  }

  function submitLocus() {
    if (!editing || !gameId) return
    saveLocus.mutate(
      { ...editing, gameId, displayGroup: editing.displayGroup || null },
      {
        onSuccess: (saved) => {
          setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
        },
      }
    )
  }

  function submitNewAllele() {
    if (!newAllele.symbol.trim() || !editing?.id) return
    saveAllele.mutate(
      { locusId: editing.id, symbol: newAllele.symbol.trim(), isAvailable: newAllele.isAvailable },
      { onSuccess: () => setNewAllele(emptyAllele()) }
    )
  }

  function submitEditAllele(id: string) {
    if (!editing?.id) return
    saveAllele.mutate(
      { id, locusId: editing.id, symbol: editingAllele.symbol, isAvailable: editingAllele.isAvailable },
      {
        onSuccess: () => {
          setEditingAlleleId(null)
          setEditingAllele(emptyAllele())
        },
      }
    )
  }

  if (editing !== null) {
    return (
      <div className="p-4 space-y-3 max-w-4xl mx-auto">
        <div className="flex items-center gap-1.5 text-sm">
          <button
            onClick={() => setEditing(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Loci & Alleles
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{editing.name || "New Locus"}</span>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Locus Details</h2>
            </div>
            <div className="p-3 space-y-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Display Group <span className="font-normal normal-case">(optional)</span>
                </label>
                <Input
                  value={editing.displayGroup}
                  onChange={(e) => setEditing({ ...editing, displayGroup: e.target.value })}
                  placeholder='e.g. "Bird Half"'
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bias Target</label>
                <select
                  value={editing.biasTarget}
                  onChange={(e) =>
                    setEditing({ ...editing, biasTarget: e.target.value as LocusForm["biasTarget"] })
                  }
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="NONE">None</option>
                  <option value="FAVORABILITY">Favorability</option>
                  <option value="RARITY">Rarity</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Min Test Cycle <span className="font-normal normal-case">(optional)</span>
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editing.minTestCycle ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      minTestCycle: e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                  placeholder="e.g. 6"
                  className="h-8 text-sm"
                />
              </div>
              {saveLocus.error && (
                <p className="text-sm text-destructive">{saveLocus.error.message}</p>
              )}
              <Button
                className="w-full h-8 text-sm"
                onClick={submitLocus}
                disabled={saveLocus.isPending || !editing.name.trim()}
              >
                Save
              </Button>
              {editing.id && (
                <>
                  {removeLocus.error && (
                    <p className="text-sm text-destructive">{removeLocus.error.message}</p>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full h-8 text-sm text-destructive hover:text-destructive"
                    onClick={() => {
                      if (
                        !confirm(
                          "Delete this locus? This will also delete all alleles and expression rules."
                        )
                      )
                        return
                      removeLocus.mutate({ id: editing.id! })
                    }}
                    disabled={removeLocus.isPending}
                  >
                    Delete Locus
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alleles</h2>
            </div>
            {editing.id ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Symbol
                      </th>
                      <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Available
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {alleles?.map((a) =>
                      editingAlleleId === a.id ? (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input
                              value={editingAllele.symbol}
                              onChange={(e) => setEditingAllele({ ...editingAllele, symbol: e.target.value })}
                              className="h-7 text-sm font-mono"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={editingAllele.isAvailable}
                              onChange={(e) =>
                                setEditingAllele({ ...editingAllele, isAvailable: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button
                              size="sm"
                              onClick={() => submitEditAllele(a.id)}
                              disabled={saveAllele.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingAlleleId(null)
                                setEditingAllele(emptyAllele())
                              }}
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono text-foreground">{a.symbol}</td>
                          <td className="px-3 py-2 text-center">
                            {a.availabilityState?.isAvailable ? (
                              <span className="text-primary font-semibold">✓</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingAlleleId(a.id)
                                setEditingAllele({
                                  symbol: a.symbol,
                                  isAvailable: a.availabilityState?.isAvailable ?? false,
                                })
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (
                                  !confirm(
                                    `Delete allele "${a.symbol}"? Expression rules referencing it must be removed first.`
                                  )
                                )
                                  return
                                removeAllele.mutate({ id: a.id })
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      )
                    )}
                    <tr>
                      <td className="px-3 py-2">
                        <Input
                          value={newAllele.symbol}
                          onChange={(e) => setNewAllele({ ...newAllele, symbol: e.target.value })}
                          placeholder="Symbol (e.g. E, e, Ccr)"
                          onKeyDown={(e) => e.key === "Enter" && submitNewAllele()}
                          className="h-7 text-sm font-mono"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={newAllele.isAvailable}
                          onChange={(e) => setNewAllele({ ...newAllele, isAvailable: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          onClick={submitNewAllele}
                          disabled={saveAllele.isPending || !newAllele.symbol.trim()}
                        >
                          Add
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {removeAllele.error && (
                  <p className="px-3 pb-3 text-sm text-destructive">{removeAllele.error.message}</p>
                )}
              </>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">Save the locus first to add alleles.</p>
            )}
          </div>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Loci & Alleles</h1>
        <Button onClick={() => setEditing(emptyLocus())}>+ New Locus</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Display Group
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bias Target
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Min Test Cycle
              </th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Alleles
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loci?.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{l.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.displayGroup ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.biasTarget}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {l.minTestCycle != null ? `Cycle ${l.minTestCycle}` : "—"}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{l._count.alleles}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {loci?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No loci yet. Add your first locus to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/loci")({
  component: LociPage,
})
