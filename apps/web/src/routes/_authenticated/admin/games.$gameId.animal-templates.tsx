import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TemplateForm = {
  id?: string
  isTutorialBase: boolean
  name: string
  sex: string
  breedId: string
  breedName: string
  fertility: string
  startingAgeInCycles: string
  statMode: string
  statFloor: string
  personalityMode: string
  personalityMin: string
  personalityMax: string
  alleleQualityBias: string
  lore: string
  baseTutorialTemplateId: string
}

const emptyForm = (isTutorialBase: boolean): TemplateForm => ({
  isTutorialBase,
  name: "", sex: "FEMALE", breedId: "", breedName: "",
  fertility: "", startingAgeInCycles: "",
  statMode: "BREED_MAX", statFloor: "",
  personalityMode: "RANDOM", personalityMin: "", personalityMax: "",
  alleleQualityBias: "",
  lore: "",
  baseTutorialTemplateId: "",
})

type StatRow = { statDefId: string; innateValue: string; trainedValue: string }
type TierRow = { disciplineId: string; tier: string }
type GenoRow = { locusId: string; alleleOneId: string; alleleTwoId: string; isTestedByOwner: boolean }
type PersonalityRow = { traitDefId: string; value: string }

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
  const { data: allTraits = [] } = trpc.admin.personality.list.useQuery({ gameId: gameId! })
  const { data: allCompTierDefs = [] } = trpc.admin.competitionTier.listByGame.useQuery({ gameId: gameId! })

  const tiersByDiscipline = allCompTierDefs.reduce<Record<string, typeof allCompTierDefs>>((acc, t) => {
    ;(acc[t.disciplineDefId] ??= []).push(t)
    return acc
  }, {})

  const [tab, setTab] = useState<"templates" | "base">("templates")
  const [subTab, setSubTab] = useState<"stats" | "personality" | "tiers" | "genotype">("stats")
  const [editing, setEditing] = useState<TemplateForm | null>(null)
  const [personalityEdits, setPersonalityEdits] = useState<Map<string, string>>(new Map())
  const [statEdits, setStatEdits] = useState<Map<string, { innate: string; trained: string }>>(new Map())
  const [tierEdits, setTierEdits] = useState<Map<string, string>>(new Map())
  const [newStat, setNewStat] = useState<StatRow>({ statDefId: "", innateValue: "", trainedValue: "" })
  const [newTier, setNewTier] = useState<TierRow>({ disciplineId: "", tier: "0" })
  const [newGeno, setNewGeno] = useState<GenoRow>({ locusId: "", alleleOneId: "", alleleTwoId: "", isTestedByOwner: false })
  const [newPersonality, setNewPersonality] = useState<PersonalityRow>({ traitDefId: "", value: "" })

  const { data: genoAlleles = [] } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: newGeno.locusId },
    { enabled: !!newGeno.locusId }
  )

  const regularTemplates = templates.filter(t => !t.isTutorialBase)
  const baseTemplates = templates.filter(t => t.isTutorialBase)

  const template = templates.find(t => t.id === editing?.id)
  const existingStatIds = new Set(template?.stats.map(s => s.statDefId) ?? [])
  const existingDisciplineIds = new Set(template?.compTiers.map(c => c.disciplineId) ?? [])
  const existingLocusIds = new Set(template?.genotype.map(g => g.locusId) ?? [])
  const existingTraitIds = new Set(template?.personalityValues.map(p => p.traitDefId) ?? [])
  const availableStats = allStats.filter(s => !existingStatIds.has(s.id))
  const availableDisciplines = allDisciplines.filter(d => !existingDisciplineIds.has(d.id))
  const availableLoci = allLoci.filter(l => !existingLocusIds.has(l.id))
  const availableTraits = allTraits.filter(t => !existingTraitIds.has(t.id))

  const baseTemplatesForSelector = templates.filter(t => t.isTutorialBase && t.sex === editing?.sex && t.id !== editing?.id)

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
      setNewGeno({ locusId: "", alleleOneId: "", alleleTwoId: "", isTestedByOwner: false })
    },
  })
  const removeGeno = trpc.admin.animalTemplate.removeGenotype.useMutation({
    onSuccess: () => utils.admin.animalTemplate.list.invalidate({ gameId: gameId! }),
  })
  const savePersonality = trpc.admin.animalTemplate.savePersonality.useMutation({
    onSuccess: () => {
      utils.admin.animalTemplate.list.invalidate({ gameId: gameId! })
      setNewPersonality({ traitDefId: "", value: "" })
    },
  })
  const removePersonality = trpc.admin.animalTemplate.removePersonality.useMutation({
    onSuccess: () => utils.admin.animalTemplate.list.invalidate({ gameId: gameId! }),
  })

  function openEdit(t: typeof templates[number]) {
    setEditing({
      id: t.id,
      isTutorialBase: t.isTutorialBase,
      name: t.name ?? "",
      sex: t.sex,
      breedId: t.breedId ?? "",
      breedName: t.breedName ?? "",
      fertility: t.fertility?.toString() ?? "",
      startingAgeInCycles: t.startingAgeInCycles?.toString() ?? "",
      statMode: t.statMode,
      statFloor: t.statFloor?.toString() ?? "",
      personalityMode: t.personalityMode,
      personalityMin: t.personalityMin?.toString() ?? "",
      personalityMax: t.personalityMax?.toString() ?? "",
      alleleQualityBias: t.alleleQualityBias?.toString() ?? "",
      lore: t.lore ?? "",
      baseTutorialTemplateId: t.baseTutorialTemplate?.id ?? "",
    })
    setNewStat({ statDefId: "", innateValue: "", trainedValue: "" })
    setNewTier({ disciplineId: "", tier: "0" })
    setNewGeno({ locusId: "", alleleOneId: "", alleleTwoId: "", isTestedByOwner: false })
    setNewPersonality({ traitDefId: "", value: "" })
    setPersonalityEdits(new Map())
    setStatEdits(new Map())
    setTierEdits(new Map())
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
      personalityMode: "RANDOM",
      personalityMin: null,
      personalityMax: null,
      alleleQualityBias: editing.alleleQualityBias !== "" ? parseFloat(editing.alleleQualityBias) : null,
      lore: editing.lore.trim() || null,
      isTutorialBase: editing.isTutorialBase,
      baseTutorialTemplateId: editing.isTutorialBase ? null : (editing.baseTutorialTemplateId || null),
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
      isTestedByOwner: newGeno.isTestedByOwner,
    })
  }

  function submitPersonality() {
    if (!editing?.id || !newPersonality.traitDefId || newPersonality.value === "") return
    savePersonality.mutate({
      templateId: editing.id,
      traitDefId: newPersonality.traitDefId,
      value: parseFloat(newPersonality.value),
    })
  }

  function set<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setEditing(prev => prev ? { ...prev, [key]: value } : null)
  }

  if (editing !== null) {
    const isBase = editing.isTutorialBase
    return (
      <div className="p-4 flex flex-col gap-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {editing.id
              ? (editing.name || editing.breedName || (isBase ? "Base Template" : "Template"))
              : (isBase ? "New Base Template" : "New Animal Template")}
          </h1>
          {isBase && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Base
            </span>
          )}
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
                  <Input value={editing.name} onChange={e => set("name", e.target.value)} placeholder={isBase ? "e.g. Tutorial Male Base" : "e.g. Bay Starter Mare"} className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lore / History</label>
                  <textarea
                    value={editing.lore}
                    onChange={e => set("lore", e.target.value)}
                    placeholder="Optional backstory shown on this animal's profile…"
                    rows={4}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sex</label>
                  <select value={editing.sex} onChange={e => set("sex", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                  </select>
                </div>
                {!isBase && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Base Template</label>
                      <select value={editing.baseTutorialTemplateId} onChange={e => set("baseTutorialTemplateId", e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">— none (standalone) —</option>
                        {baseTemplatesForSelector.map(t => (
                          <option key={t.id} value={t.id}>{t.name || t.id}</option>
                        ))}
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
                  </>
                )}
                {(isBase || !editing.baseTutorialTemplateId) && (
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
                )}
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
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele Quality Bias</label>
                  <Input type="number" min="-1" max="1" step="0.01" value={editing.alleleQualityBias} onChange={e => set("alleleQualityBias", e.target.value)} placeholder="-1 to 1" className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Button onClick={submitTemplate} disabled={save.isPending}>
                    {editing.id ? "Save" : (isBase ? "Create Base Template" : "Create Template")}
                  </Button>
                  {editing.id && (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this template? This removes all stat, tier, genotype, and personality entries too.")) return
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
              <div className="flex flex-col gap-0 rounded-lg border border-border bg-card shadow-sm overflow-hidden">

                {/* Sub-tab bar */}
                <div className="flex border-b border-border bg-secondary/40">
                  {(["stats", "personality", "tiers", "genotype"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSubTab(t)}
                      className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${subTab === t ? "border-b-2 border-foreground text-foreground bg-card" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "stats" ? "Stats" : t === "personality" ? "Personality" : t === "tiers" ? "Comp Tiers" : "Genotype"}
                    </button>
                  ))}
                </div>

                {/* Stats */}
                {subTab === "stats" && <section>
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
                      {template?.stats.map(s => {
                        const edit = statEdits.get(s.statDefId)
                        const innate = edit?.innate ?? s.innateValue?.toString() ?? ""
                        const trained = edit?.trained ?? s.trainedValue?.toString() ?? ""
                        return (
                          <tr key={s.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 font-medium text-foreground">{s.statDef.name}</td>
                            <td className="px-3 py-1.5">
                              <Input type="number" step="0.01" value={innate}
                                onChange={e => setStatEdits(m => new Map(m).set(s.statDefId, { innate: e.target.value, trained }))}
                                placeholder="—" className="h-7 text-sm w-24" />
                            </td>
                            <td className="px-3 py-1.5">
                              <Input type="number" step="0.01" value={trained}
                                onChange={e => setStatEdits(m => new Map(m).set(s.statDefId, { innate, trained: e.target.value }))}
                                placeholder="—" className="h-7 text-sm w-24" />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" onClick={() => saveStat.mutate({
                                  templateId: editing.id!, statDefId: s.statDefId,
                                  innateValue: innate !== "" ? parseFloat(innate) : null,
                                  trainedValue: trained !== "" ? parseFloat(trained) : null,
                                })} disabled={saveStat.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => removeStat.mutate({ templateId: editing.id!, statDefId: s.statDefId })}>
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
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
                </section>}

                {/* Personality Values */}
                {subTab === "personality" && <section>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trait</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.personalityValues.map(p => {
                        const val = personalityEdits.get(p.traitDefId) ?? p.value.toString()
                        return (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 font-medium text-foreground">{p.traitDef.name}</td>
                            <td className="px-3 py-1.5">
                              <Input type="number" step="1" min="0" max="100" value={val}
                                onChange={e => setPersonalityEdits(m => new Map(m).set(p.traitDefId, e.target.value))}
                                className="h-7 text-sm w-24" />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" onClick={() => savePersonality.mutate({
                                  templateId: editing.id!, traitDefId: p.traitDefId,
                                  value: parseFloat(val) || 0,
                                })} disabled={savePersonality.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => removePersonality.mutate({ templateId: editing.id!, traitDefId: p.traitDefId })}>
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="px-3 py-1.5">
                          <select value={newPersonality.traitDefId} onChange={e => setNewPersonality(p => ({ ...p, traitDefId: e.target.value }))}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                            <option value="">Select trait…</option>
                            {availableTraits.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" step="1" min="0" max="100" value={newPersonality.value}
                            onChange={e => setNewPersonality(p => ({ ...p, value: e.target.value }))}
                            placeholder="0–100" className="h-7 text-sm" />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" onClick={submitPersonality}
                            disabled={!newPersonality.traitDefId || newPersonality.value === "" || savePersonality.isPending}>
                            Add
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>}

                {/* Competition Tiers */}
                {subTab === "tiers" && <section>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discipline</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Starting Tier</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.compTiers.map(c => {
                        const discId = c.discipline.id
                        const tier = tierEdits.get(discId) ?? c.tier.toString()
                        const disciplineTiers = tiersByDiscipline[discId] ?? []
                        return (
                          <tr key={c.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 font-medium text-foreground">{c.discipline.name}</td>
                            <td className="px-3 py-1.5">
                              <select value={tier}
                                onChange={e => setTierEdits(m => new Map(m).set(discId, e.target.value))}
                                className="h-7 rounded-md border border-input bg-background px-2 text-sm">
                                {disciplineTiers.map(t => (
                                  <option key={t.id} value={t.tierIndex}>{t.name} ({t.tierIndex})</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" onClick={() => saveTier.mutate({
                                  templateId: editing.id!, disciplineId: discId,
                                  tier: parseInt(tier) || 0,
                                })} disabled={saveTier.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => removeTier.mutate({ templateId: editing.id!, disciplineId: discId })}>
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="px-3 py-1.5">
                          <select value={newTier.disciplineId} onChange={e => setNewTier(p => ({ ...p, disciplineId: e.target.value }))}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                            <option value="">Select discipline…</option>
                            {availableDisciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={newTier.tier}
                            onChange={e => setNewTier(p => ({ ...p, tier: e.target.value }))}
                            disabled={!newTier.disciplineId}
                            className="h-7 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
                            <option value="">Select tier…</option>
                            {(tiersByDiscipline[newTier.disciplineId] ?? []).map(t => (
                              <option key={t.id} value={t.tierIndex}>{t.name} ({t.tierIndex})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" onClick={submitTier} disabled={!newTier.disciplineId || saveTier.isPending}>Add</Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>}

                {/* Genotype */}
                {subTab === "genotype" && <section>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Locus</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 1</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 2</th>
                        <th className="px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tested</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template?.genotype.map(g => (
                        <tr key={g.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 font-medium text-foreground">{g.locus.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{g.alleleOne.symbol}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{g.alleleTwo.symbol}</td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={g.isTestedByOwner}
                              onChange={e => saveGeno.mutate({
                                templateId: editing.id!,
                                locusId: g.locusId,
                                alleleOneId: g.alleleOneId,
                                alleleTwoId: g.alleleTwoId,
                                isTestedByOwner: e.target.checked,
                              })}
                              className="h-4 w-4"
                            />
                          </td>
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
                          {(() => {
                            const PANEL_ORDER = ["HEALTH", "COLOR", "VARIANCE", "CONFORMATION"] as const
                            const PANEL_LABELS: Record<string, string> = { HEALTH: "Health", COLOR: "Color", VARIANCE: "Variance", CONFORMATION: "Conformation" }
                            const getPrimary = (l: typeof availableLoci[number]) => PANEL_ORDER.find(t => l.panelEntries.some(e => e.panelDef.panelType === t)) ?? null
                            const grouped = PANEL_ORDER.map(type => ({ type, loci: availableLoci.filter(l => getPrimary(l) === type) }))
                            const other = availableLoci.filter(l => getPrimary(l) === null)
                            return (
                              <select value={newGeno.locusId}
                                onChange={e => setNewGeno({ locusId: e.target.value, alleleOneId: "", alleleTwoId: "", isTestedByOwner: false })}
                                className="h-7 rounded-md border border-input bg-background px-2 text-sm w-full">
                                <option value="">Select locus…</option>
                                {grouped.map(({ type, loci }) => loci.length === 0 ? null : (
                                  <optgroup key={type} label={PANEL_LABELS[type]}>
                                    {loci.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                  </optgroup>
                                ))}
                                {other.length > 0 && (
                                  <optgroup label="Other">
                                    {other.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                  </optgroup>
                                )}
                              </select>
                            )
                          })()}
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
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={newGeno.isTestedByOwner}
                            onChange={e => setNewGeno(p => ({ ...p, isTestedByOwner: e.target.checked }))}
                            className="h-4 w-4"
                          />
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
                </section>}

              </div>
            )}

          </div>
        </div>
      </div>
    )
  }

  const activeList = tab === "templates" ? regularTemplates : baseTemplates

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Animal Templates</h1>
        <Button onClick={() => setEditing(emptyForm(tab === "base"))}>
          {tab === "base" ? "+ New Base Template" : "+ New Template"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "templates" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Animal Templates ({regularTemplates.length})
        </button>
        <button
          onClick={() => setTab("base")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "base" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Base Templates ({baseTemplates.length})
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
                {tab === "templates" && (
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base Template</th>
                )}
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat Mode</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stats</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t.name ?? <span className="italic text-muted-foreground">unnamed</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{t.sex.toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.breed?.name ?? t.breedName ?? "—"}</td>
                  {tab === "templates" && (
                    <td className="px-3 py-2 text-muted-foreground">{t.baseTutorialTemplate?.name ?? "—"}</td>
                  )}
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{t.statMode}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{t.stats.length}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {activeList.length === 0 && (
                <tr>
                  <td colSpan={tab === "templates" ? 7 : 6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {tab === "base" ? "No base templates yet. Create one to share stats and configuration across tutorial animals." : "No templates yet."}
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
