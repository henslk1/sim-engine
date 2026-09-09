import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ColorForm = { name: string; phenotypes: string[]; isActive: boolean; image: string }
const emptyColorForm = (): ColorForm => ({ name: "", phenotypes: [], isActive: true, image: "" })

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/starter-breeds")({
  component: StarterBreedsPage,
})

function StarterBreedsPage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()

  const { data: starterBreeds = [] } = trpc.admin.starterBreed.list.useQuery({ gameId: gameId! })
  const { data: allBreeds = [] } = trpc.admin.breed.list.useQuery({ gameId: gameId! })
  const { data: tutorialAnimals = [] } = trpc.admin.starterBreed.listTemplates.useQuery({ gameId: gameId! })
  const { data: availablePhenotypes = [] } = trpc.admin.starterBreed.listPhenotypes.useQuery({ gameId: gameId! })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingColorId, setEditingColorId] = useState<string | null>(null)
  const [colorForm, setColorForm] = useState<ColorForm>(emptyColorForm())
  const [templateForm, setTemplateForm] = useState({ maleId: "", femaleId: "" })

  const selected = starterBreeds.find(s => s.id === selectedId) ?? null
  const availableBreeds = allBreeds.filter(b => !starterBreeds.some(s => s.breedId === b.id))

  useEffect(() => {
    setTemplateForm({
      maleId: selected?.tutorialMaleTemplateId ?? "",
      femaleId: selected?.tutorialFemaleTemplateId ?? "",
    })
    setEditingColorId(null)
    setColorForm(emptyColorForm())
  }, [selected?.id])

  const addBreed = trpc.admin.starterBreed.save.useMutation({
    onSuccess: (created) => {
      utils.admin.starterBreed.list.invalidate({ gameId: gameId! })
      setSelectedId(created.id)
    },
  })
  const toggleBreed = trpc.admin.starterBreed.save.useMutation({
    onSuccess: () => utils.admin.starterBreed.list.invalidate({ gameId: gameId! }),
  })
  const saveTemplates = trpc.admin.starterBreed.save.useMutation({
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

  function submitTemplates() {
    if (!selected) return
    saveTemplates.mutate({
      id: selected.id,
      gameId: gameId!,
      breedId: selected.breedId,
      isActive: selected.isActive,
      tutorialMaleTemplateId: templateForm.maleId || null,
      tutorialFemaleTemplateId: templateForm.femaleId || null,
    })
  }

  function submitColor() {
    if (!selected || !colorForm.name.trim() || colorForm.phenotypes.length === 0) return
    saveColor.mutate({
      id: editingColorId ?? undefined,
      starterBreedOptionId: selected.id,
      name: colorForm.name.trim(),
      phenotypes: colorForm.phenotypes,
      image: colorForm.image || null,
      isActive: colorForm.isActive,
    })
  }

  function togglePhenotype(p: string) {
    setColorForm(f => ({
      ...f,
      phenotypes: f.phenotypes.includes(p) ? f.phenotypes.filter(x => x !== p) : [...f.phenotypes, p],
    }))
  }

  const isEditing = editingColorId !== null
  const colorFormTitle = isEditing
    ? `Edit: ${selected?.colorOptions.find(c => c.id === editingColorId)?.name ?? ""}`
    : "Add Color"

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
                      onClick={() => toggleBreed.mutate({ id: selected.id, gameId: gameId!, breedId: selected.breedId, isActive: !selected.isActive, tutorialMaleTemplateId: selected.tutorialMaleTemplateId, tutorialFemaleTemplateId: selected.tutorialFemaleTemplateId })}
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

                {/* Tutorial Templates */}
                <div className="p-3 space-y-2 border-b border-border">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tutorial Templates</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Male Template</label>
                      <select
                        value={templateForm.maleId}
                        onChange={(e) => setTemplateForm(f => ({ ...f, maleId: e.target.value }))}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">— none —</option>
                        {tutorialAnimals.filter(a => a.sex === "MALE").map(a => (
                          <option key={a.id} value={a.id}>{a.name ?? a.breedName ?? a.breed?.name ?? "(unnamed)"}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Female Template</label>
                      <select
                        value={templateForm.femaleId}
                        onChange={(e) => setTemplateForm(f => ({ ...f, femaleId: e.target.value }))}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">— none —</option>
                        {tutorialAnimals.filter(a => a.sex === "FEMALE").map(a => (
                          <option key={a.id} value={a.id}>{a.name ?? a.breedName ?? a.breed?.name ?? "(unnamed)"}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={submitTemplates} disabled={saveTemplates.isPending}>
                    Save Templates
                  </Button>
                  {saveTemplates.error && <p className="text-xs text-destructive">{saveTemplates.error.message}</p>}
                </div>

                {/* Color Options */}
                <div className="p-3 space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color Options</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phenotypes</th>
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.colorOptions.map(c => (
                        <tr key={c.id} className={`border-b border-border last:border-0 ${editingColorId === c.id ? "bg-primary/5" : ""}`}>
                          <td className="py-1.5 font-medium text-foreground">{c.name}</td>
                          <td className="py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {c.phenotypes.map(p => (
                                <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{p}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-1.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.isActive ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
                              {c.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="py-1.5 text-right space-x-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => {
                                setEditingColorId(c.id)
                                setColorForm({ name: c.name, phenotypes: c.phenotypes, isActive: c.isActive, image: c.image ?? "" })
                              }}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => { if (!confirm("Delete this color option?")) return; removeColor.mutate({ id: c.id }) }}>
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {selected.colorOptions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-xs text-muted-foreground">No color options yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Add / Edit form */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{colorFormTitle}</h4>
                    <div className="flex gap-2">
                      <Input
                        className="h-8 text-sm"
                        placeholder="Display name (e.g. Bay Leopard)"
                        value={colorForm.name}
                        onChange={e => setColorForm(f => ({ ...f, name: e.target.value }))}
                      />
                      <Input
                        className="h-8 text-sm"
                        placeholder="Image URL"
                        value={colorForm.image}
                        onChange={e => setColorForm(f => ({ ...f, image: e.target.value }))}
                      />
                    </div>

                    {/* Phenotype picker */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Phenotypes {colorForm.phenotypes.length > 0 && <span className="text-primary">({colorForm.phenotypes.join(", ")})</span>}
                      </p>
                      {availablePhenotypes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No expression rules found for this game.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2 max-h-36 overflow-y-auto">
                          {availablePhenotypes.map(p => {
                            const checked = colorForm.phenotypes.includes(p)
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => togglePhenotype(p)}
                                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                                  checked
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                                }`}
                              >
                                {p}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="h-8 text-sm"
                        onClick={submitColor}
                        disabled={saveColor.isPending || !colorForm.name.trim() || colorForm.phenotypes.length === 0}
                      >
                        {isEditing ? "Save Changes" : "Add Color"}
                      </Button>
                      {isEditing && (
                        <Button
                          variant="ghost"
                          className="h-8 text-sm"
                          onClick={() => { setEditingColorId(null); setColorForm(emptyColorForm()) }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    {saveColor.error && <p className="text-sm text-destructive">{saveColor.error.message}</p>}
                  </div>
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
