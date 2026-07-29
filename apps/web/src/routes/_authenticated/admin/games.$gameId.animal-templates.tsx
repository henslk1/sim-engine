import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TemplateForm = {
  id?: string
  name: string
  sex: string
  breedId: string
  breedName: string
  fertility: string
  startingAgeInCycles: string
  statMode: string
  statFloor: string
  healthClear: boolean
  personalityMode: string
  personalityMin: string
  personalityMax: string
  alleleQualityBias: string
}

const emptyForm = (): TemplateForm => ({
  name: "", sex: "FEMALE", breedId: "", breedName: "",
  fertility: "", startingAgeInCycles: "",
  statMode: "BREED_MAX", statFloor: "",
  healthClear: true,
  personalityMode: "RANDOM", personalityMin: "", personalityMax: "",
  alleleQualityBias: "",
})

type StatRow = { statDefId: string; innateValue: string; trainedValue: string }
type TierRow = { disciplineId: string; tier: string }
type GenoRow = { locusId: string; alleleOneId: string; alleleTwoId: string }

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/animal-templates")({
  component: AnimalTemplatesPage,
})

function AnimalTemplatesPage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()

  const { data: templates = [] } = trpc.admin.animalTemplate.list.useQuery({ gameId: gameId! })
  const { data: allBreeds = [] } = trpc.admin.breed.list.useQuery({ gameId: gameId! })
  const { data: allStats = [] } = trpc.admin.stat.list.useQuery({ gameId: gameId! })
  const { data: allDisciplines = [] } = trpc.admin.discipline.list.useQuery({ gameId: gameId! })
  const { data: allLoci = [] } = trpc.admin.locus.list.useQuery({ gameId: gameId! })

  const [editing, setEditing] = useState<TemplateForm | null>(null)
  const [newStat, setNewStat] = useState<StatRow>({ statDefId: "", innateValue: "", trainedValue: "" })
  const [newTier, setNewTier] = useState<TierRow>({ disciplineId: "", tier: "0" })
  const [newGeno, setNewGeno] = useState<GenoRow>({ locusId: "", alleleOneId: "", alleleTwoId: "" })

  const { data: genoAlleles = [] } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: newGeno.locusId },
    { enabled: !!newGeno.locusId }
  )

  const template = templates.find(t => t.id === editing?.id)
  const existingStatIds = new Set(template?.stats.map(s => s.statDefId) ?? [])
  const existingDisciplineIds = new Set(template?.compTiers.map(c => c.disciplineId) ?? [])
  const existingLocusIds = new Set(template?.genotype.map(g => g.locusId) ?? [])
  const availableStats = allStats.filter(s => !existingStatIds.has(s.id))
  const availableDisciplines = allDisciplines.filter(d => !existingDisciplineIds.has(d.id))
  const availableLoci = allLoci.filter(l => !existingLocusIds.has(l.id))

  const save = trpc.admin.animalTemplate.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setEditing(prev => prev ? { ...prev, id: saved.id } : null)
    },
  })
  const remove = trpc.admin.animalTemplate.remove.useMutation({
    onSuccess: () => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setEditing(null)
    },
  })
  const saveStat = trpc.admin.animalTemplate.saveStat.useMutation({
    onSuccess: () => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setNewStat({ statDefId: "", innateValue: "", trainedValue: "" })
    },
  })
  const removeStat = trpc.admin.animalTemplate.removeStat.useMutation({
    onSuccess: () => utils.admin.animalTemplate.list.invalidate({ gameId: gameId! }),
  })
  const saveTier = trpc.admin.animalTemplate.saveCompTier.useMutation({
    onSuccess: () => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setNewTier({ disciplineId: "", tier: "0" })
    },
  })
  const removeTier = trpc.admin.animalTemplate.removeCompTier.useMutation({
    onSuccess: () => utils.admin.animalTemplate.list.invalidate({ gameId: gameId! }),
  })
  const saveGeno = trpc.admin.animalTemplate.saveGenotype.useMutation({
    onSuccess: () => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setNewGeno({ locusId: "", alleleOneId: "", alleleTwoId: "" })
    },
  })
  const removeGeno = trpc.admin.animalTemplate.removeGenotype.useMutation({
    onSuccess: () => utils.admin.animalTemplate.list.invalidate({ gameId: gameId! }),
  })

  function openEdit(t: typeof templates[number]) {
    setEditing({
      id: t.id,
      name: t.name ?? "",
      sex: t.sex,
      breedId: t.breedId ?? "",
      breedName: t.breedName ?? "",
      fertility: t.fertility?.toString() ?? "",
      startingAgeInCycles: t.startingAgeInCycles?.toString() ?? "",
      statMode: t.statMode,
      statFloor: t.statFloor?.toString() ?? "",
      healthClear: t.healthClear,
      personalityMode: t.personalityMode,
      personalityMin: t.personalityMin?.toString() ?? "",
      personalityMax: t.personalityMax?.toString() ?? "",
      alleleQualityBias: t.alleleQualityBias?.toString() ?? "",
    })
    setNewStat({ statDefId: "", innateValue: "", trainedValue: "" })
    setNewTier({ disciplineId: "", tier: "0" })
    setNewGeno({ locusId: "", alleleOneId: "", alleleTwoId: "" })
  }

  function submitTemplate() {
    if (!editing || !gameId) return
    save.mutate({
      id: editing.id,
      gameId,
      sex: editing.sex as "MALE" | "FEMALE",
      name: editing.name.trim() || null,
      breedId: editing.breedId || null,
      breedName: editing.breedName.trim() || null,
      fertility: editing.fertility !== "" ? parseFloat(editing.fertility) : null,
      startingAgeInCycles: editing.startingAgeInCycles !== "" ? parseInt(editing.startingAgeInCycles) : null,
      statMode: editing.statMode as "BREED_MAX" | "FLOOR" | "EXACT",
      statFloor: editing.statFloor !== "" ? parseFloat(editing.statFloor) : null,
      healthClear: editing.healthClear,
      personalityMode: editing.personalityMode as "RANDOM" | "RANGE",
      personalityMin: editing.personalityMin !== "" ? parseFloat(editing.personalityMin) : null,
      personalityMax: editing.personalityMax !== "" ? parseFloat(editing.personalityMax) : null,
      alleleQualityBias: editing.alleleQualityBias !== "" ? parseFloat(editing.alleleQualityBias) : null,
    })
  }

  function submitStat() {
    if (!editing?.id || !newStat.statDefId) return
    saveStat.mutate({
      templateId: editing.id,
      statDefId: newStat.statDefId,
      innateValue: newStat.innateValue !== "" ? parseFloat(newStat.innateValue) : null,
      trainedValue: newStat.trainedValue !== "" ? parseFloat(newStat.trainedValue) : null,
    })
  }

  function submitTier() {
    if (!editing?.id || !newTier.disciplineId) return
    saveTier.mutate({
      templateId: editing.id,
      disciplineId: newTier.disciplineId,
      tier: parseInt(newTier.tier) || 0,
    })
  }

  function submitGeno() {
    if (!editing?.id || !newGeno.locusId || !newGeno.alleleOneId || !newGeno.alleleTwoId) return
    saveGeno.mutate({
      templateId: editing.id,
      locusId: newGeno.locusId,
      alleleOneId: newGeno.alleleOneId,
      alleleTwoId: newGeno.alleleTwoId,
    })
  }

  function set<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setEditing(prev => prev ? { ...prev, [key]: value } : null)
  }

  if (editing !== null) {
    return (
      <div className="p-4 flex flex-col gap-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {editing.id ? (editing.name || editing.breedName || "Template") : "New Animal Template"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2">
          <div className="grid grid-cols-[300px_1fr] gap-2 items-start">

            {/* Main form */}
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Template Details</h2>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                  <Input value={editing.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Bay Starter Mare" className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sex</label>
                  <select value={editing.sex} onChange={e => set("sex", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Breed</label>
                  <select value={editing.breedId} onChange={e => set("breedId", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">— none —</option>
                    {allBreeds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Breed Name (override)</label>
                  <Input value={editing.breedName} onChange={e => set("breedName", e.target.value)} placeholder="e.g. Thoroughbred" className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fertility</label>
                    <Input type="number" min="0" max="1" step="0.01" value={editing.fertility} onChange={e => set("fertility", e.target.value)} placeholder="0–1" className="h-8 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Starting Age (cycles)</label>
                    <Input type="number" min="0" value={editing.startingAgeInCycles} onChange={e => set("startingAgeInCycles", e.target.value)} placeholder="e.g. 12" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stat Mode</label>
                  <select value={editing.statMode} onChange={e => set("statMode", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="BREED_MAX">Breed Max</option>
                    <option value="FLOOR">Floor</option>
                    <option value="EXACT">Exact</option>
                  </select>
                </div>
                {editing.statMode === "FLOOR" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stat Floor</label>
                    <Input type="number" step="0.01" value={editing.statFloor} onChange={e => set("statFloor", e.target.value)} placeholder="e.g. 0.5" className="h-8 text-sm" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="healthClear" checked={editing.healthClear} onChange={e => set("healthClear", e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="healthClear" className="text-sm text-foreground">Health Clear</label>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Personality Mode</label>
                  <select value={editing.personalityMode} onChange={e => set("personalityMode", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="RANDOM">Random</option>
                    <option value="RANGE">Range</option>
                  </select>
                </div>
                {editing.personalityMode === "RANGE" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Personality Min</label>
                      <Input type="number" step="0.01" value={editing.personalityMin} onChange={e => set("personalityMin", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Personality Max</label>
                      <Input type="number" step="0.01" value={editing.personalityMax} onChange={e => set("personalityMax", e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele Quality Bias</label>
                  <Input type="number" min="-1" max="1" step="0.01" value={editing.alleleQualityBias} onChange={e => set("alleleQualityBias", e.target.value)} placeholder="-1 to 1" className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Button onClick={submitTemplate} disabled={save.isPending}>
                    {editing.id ? "Save" : "Create Template"}
                  </Button>
                  {editing.id && (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this template? This removes all stat, tier, and genotype entries too.")) return
                        remove.mutate({ id: editing.id! })
                      }}
                      disabled={remove.isPending}
                    >
                      Delete Template
                    </Button>
                  )}
                </div>
                {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
              </div>
            </section>

            {/* Sub-tables — only shown after template is saved */}
            {editing.id && (
              <div className="flex flex-col gap-2">

                {/* Stats */}
                <section className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stats</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Innate</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trained</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.stats.map(s => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 font-medium text-foreground">{s.statDef.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{s.innateValue ?? "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{s.trainedValue ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => removeStat.mutate({ templateId: editing.id!, statDefId: s.statDefId })}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="px-3 py-1.5">
                          <select value={newStat.statDefId} onChange={e => setNewStat(p => ({ ...p, statDefId: e.target.value }))}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                            <option value="">Select stat…</option>
                            {availableStats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" step="0.01" value={newStat.innateValue}
                            onChange={e => setNewStat(p => ({ ...p, innateValue: e.target.value }))}
                            placeholder="Innate" className="h-7 text-sm" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" step="0.01" value={newStat.trainedValue}
                            onChange={e => setNewStat(p => ({ ...p, trainedValue: e.target.value }))}
                            placeholder="Trained" className="h-7 text-sm" />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" onClick={submitStat} disabled={!newStat.statDefId || saveStat.isPending}>Add</Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Competition Tiers */}
                <section className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Competition Tiers</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discipline</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Starting Tier</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.compTiers.map(c => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 font-medium text-foreground">{c.discipline.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.tier}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => removeTier.mutate({ templateId: editing.id!, disciplineId: c.disciplineId })}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="px-3 py-1.5">
                          <select value={newTier.disciplineId} onChange={e => setNewTier(p => ({ ...p, disciplineId: e.target.value }))}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                            <option value="">Select discipline…</option>
                            {availableDisciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" min="0" value={newTier.tier}
                            onChange={e => setNewTier(p => ({ ...p, tier: e.target.value }))}
                            className="h-7 text-sm w-16" />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" onClick={submitTier} disabled={!newTier.disciplineId || saveTier.isPending}>Add</Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Genotype */}
                <section className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Genotype</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Locus</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 1</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 2</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.genotype.map(g => (
                        <tr key={g.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 font-medium text-foreground">{g.locus.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{g.alleleOne.symbol}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{g.alleleTwo.symbol}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => removeGeno.mutate({ templateId: editing.id!, locusId: g.locusId })}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="px-3 py-1.5">
                          <select value={newGeno.locusId}
                            onChange={e => setNewGeno({ locusId: e.target.value, alleleOneId: "", alleleTwoId: "" })}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                            <option value="">Select locus…</option>
                            {availableLoci.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={newGeno.alleleOneId}
                            onChange={e => setNewGeno(p => ({ ...p, alleleOneId: e.target.value }))}
                            disabled={!newGeno.locusId}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full disabled:opacity-50">
                            <option value="">Allele 1…</option>
                            {genoAlleles.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={newGeno.alleleTwoId}
                            onChange={e => setNewGeno(p => ({ ...p, alleleTwoId: e.target.value }))}
                            disabled={!newGeno.locusId}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full disabled:opacity-50">
                            <option value="">Allele 2…</option>
                            {genoAlleles.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" onClick={submitGeno}
                            disabled={!newGeno.locusId || !newGeno.alleleOneId || !newGeno.alleleTwoId || saveGeno.isPending}>
                            Add
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

              </div>
            )}

          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Animal Templates</h1>
        <Button onClick={() => setEditing(emptyForm())}>+ New Template</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat Mode</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stats</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t.name ?? <span className="italic text-muted-foreground">unnamed</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{t.sex.toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.breed?.name ?? t.breedName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{t.statMode}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{t.stats.length}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No templates yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
