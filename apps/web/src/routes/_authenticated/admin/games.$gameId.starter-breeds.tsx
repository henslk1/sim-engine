import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ColorForm = { name: string; isActive: boolean, image: string }
const emptyColorForm = (): ColorForm => ({ name: "", isActive: true, image: "" })

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/starter-breeds")({
  component: StarterBreedsPage,
})

function StarterBreedsPage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()

  const { data: starterBreeds = [] } = trpc.admin.starterBreed.list.useQuery({ gameId: gameId! })
  const { data: allBreeds = [] } = trpc.admin.breed.list.useQuery({ gameId: gameId! })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingColorId, setEditingColorId] = useState<string | null>(null)
  const [colorForm, setColorForm] = useState<ColorForm>(emptyColorForm())

  const selected = starterBreeds.find(s => s.id === selectedId) ?? null
  const availableBreeds = allBreeds.filter(b => !starterBreeds.some(s => s.breedId === b.id))

  const addBreed = trpc.admin.starterBreed.save.useMutation({
    onSuccess: (created) => {
      utils.admin.starterBreed.list.invalidate({ gameId: gameId! })
      setSelectedId(created.id)
    },
  })
  const toggleBreed = trpc.admin.starterBreed.save.useMutation({
    onSuccess: () => utils.admin.starterBreed.list.invalidate({ gameId: gameId! }),
  })
  const removeBreed = trpc.admin.starterBreed.remove.useMutation({
    onSuccess: () => {
      utils.admin.starterBreed.list.invalidate({ gameId: gameId! })
      setSelectedId(null)
    },
  })
  const saveColor = trpc.admin.starterBreed.saveColorOption.useMutation({
    onSuccess: () => {
      utils.admin.starterBreed.list.invalidate({ gameId: gameId! })
      setEditingColorId(null)
      setColorForm(emptyColorForm())
    },
  })
  const removeColor = trpc.admin.starterBreed.removeColorOption.useMutation({
    onSuccess: () => utils.admin.starterBreed.list.invalidate({ gameId: gameId! }),
  })

  function submitColor() {
    if (!selected || !colorForm.name.trim()) return
    saveColor.mutate({
      id: editingColorId ?? undefined,
      starterBreedOptionId: selected.id,
      name: colorForm.name.trim(),
      image: colorForm.image || null,
      isActive: colorForm.isActive,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Starter Breeds</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[280px_1fr] gap-2 items-start">

          {/* Breed list */}
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Configured Breeds</h2>
            </div>
            <div className="divide-y divide-border">
              {starterBreeds.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/40 ${selectedId === s.id ? "bg-muted/60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{s.breed.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.isActive ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.colorOptions.length} color{s.colorOptions.length !== 1 ? "s" : ""}
                  </div>
                </button>
              ))}
              {starterBreeds.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No starter breeds configured.</p>
              )}
            </div>
            {availableBreeds.length > 0 && (
              <div className="border-t border-border p-2">
                <select
                  className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return
                    addBreed.mutate({ gameId: gameId!, breedId: e.target.value, isActive: true })
                    e.target.value = ""
                  }}
                >
                  <option value="">+ Add breed…</option>
                  {availableBreeds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Selected breed detail */}
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            {selected ? (
              <>
                <div className="border-b border-border bg-secondary/40 px-3 py-2 flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {selected.breed.name}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => toggleBreed.mutate({ id: selected.id, gameId: gameId!, breedId: selected.breedId, isActive: !selected.isActive })}
                    >
                      {selected.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Remove this starter breed and all its color options?")) return; removeBreed.mutate({ id: selected.id }) }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color Options</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.colorOptions.map(c => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          {editingColorId === c.id ? (
                            <>
                              <td className="py-1.5 pr-2" colSpan={2}>
                                <div className="flex gap-1.5">
                                  <Input
                                    className="h-7 text-sm"
                                    value={colorForm.name}
                                    onChange={e => setColorForm({ ...colorForm, name: e.target.value })}
                                    placeholder="Name"
                                    autoFocus
                                  />
                                  <Input
                                    className="h-7 text-sm"
                                    value={colorForm.image}
                                    onChange={e => setColorForm({ ...colorForm, image: e.target.value })}
                                    placeholder="Image URL"
                                  />
                                </div>
                              </td>
                              <td className="py-1.5 text-right space-x-1">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={submitColor}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingColorId(null); setColorForm(emptyColorForm()) }}>Cancel</Button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-1.5 font-medium text-foreground">{c.name}</td>
                              <td className="py-1.5">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.isActive ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
                                  {c.isActive ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="py-1.5 text-right space-x-1">
                                <Button size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => { setEditingColorId(c.id); setColorForm({ name: c.name, isActive: c.isActive, image: c.image ?? "" }) }}>
                                  Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                                  onClick={() => { if (!confirm("Delete this color option?")) return; removeColor.mutate({ id: c.id }) }}>
                                  Delete
                                </Button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                      {selected.colorOptions.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-4 text-xs text-muted-foreground">No color options yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {!editingColorId && (
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <Input
                        className="h-8 text-sm"
                        placeholder="e.g. Bay"
                        value={colorForm.name}
                        onChange={e => setColorForm({ ...colorForm, name: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") submitColor() }}
                      />
                      <Input
                        className="h-8 text-sm"
                        placeholder="Image URL"
                        value={colorForm.image}
                        onChange={e => setColorForm({ ...colorForm, image: e.target.value })}
                      />
                      <Button
                        className="h-8 text-sm shrink-0"
                        onClick={submitColor}
                        disabled={saveColor.isPending || !colorForm.name.trim()}
                      >
                        Add Color
                      </Button>
                    </div>
                  )}
                  {saveColor.error && <p className="text-sm text-destructive">{saveColor.error.message}</p>}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
                Select a breed from the list to manage its color options.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
