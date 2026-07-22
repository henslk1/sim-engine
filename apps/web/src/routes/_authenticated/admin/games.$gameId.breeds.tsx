import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/breeds")({
  component: BreedsPage,
})

// ── Types ─────────────────────────────────────────────────────────────────────

type BreedForm = {
  id?: string
  name: string
  speciesId: string
  categoryBadge: "BASE" | "SECONDARY" | "CUSTOM"
  image: string
  lore: string
  isUnregistered: boolean
  convergenceGenerations: string
  lifeExpectancyBaseline: string
  immunityMin: string
  immunityMax: string
}

const emptyBreed: BreedForm = {
  name: "", speciesId: "", categoryBadge: "BASE", image: "", lore: "",
  isUnregistered: false, convergenceGenerations: "", lifeExpectancyBaseline: "",
  immunityMin: "", immunityMax: "",
}

type ActivePanel = "stats" | "loci" | "standards" | "personality"

// ── Primitives ────────────────────────────────────────────────────────────────

function TH({ children, right, center }: { children?: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th className={cn("px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", right ? "text-right" : center ? "text-center" : "text-left")}>
      {children}
    </th>
  )
}

function II({ value, onChange, onBlur, step, min, max, disabled }: {
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: () => void
  step?: string
  min?: string
  max?: string
  disabled?: boolean
}) {
  return (
    <Input
      className="h-7 text-xs w-full"
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  )
}

// ── Stat Row ──────────────────────────────────────────────────────────────────

type StatProfile = { id: string; statDefId: string; weight: number; naturalMin: number; naturalMax: number; baseline: number }

function StatRow({ stat, profile, onSave }: {
  stat: { id: string; name: string }
  profile: StatProfile | undefined
  onSave: (statDefId: string, id: string | undefined, data: { weight: number; naturalMin: number; naturalMax: number; baseline: number }) => void
}) {
  const [weight, setWeight] = useState(profile?.weight.toString() ?? "1")
  const [naturalMin, setNaturalMin] = useState(profile?.naturalMin.toString() ?? "0")
  const [naturalMax, setNaturalMax] = useState(profile?.naturalMax.toString() ?? "100")
  const [baseline, setBaseline] = useState(profile?.baseline.toString() ?? "50")

  useEffect(() => {
    setWeight(profile?.weight.toString() ?? "1")
    setNaturalMin(profile?.naturalMin.toString() ?? "0")
    setNaturalMax(profile?.naturalMax.toString() ?? "100")
    setBaseline(profile?.baseline.toString() ?? "50")
  }, [profile?.id])

  function save() {
    onSave(stat.id, profile?.id, {
      weight: parseFloat(weight) || 0,
      naturalMin: parseFloat(naturalMin) || 0,
      naturalMax: parseFloat(naturalMax) || 0,
      baseline: parseFloat(baseline) || 0,
    })
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-1.5 text-sm font-medium text-foreground">{stat.name}</td>
      <td className="px-2 py-1.5"><II value={weight} step="0.01" onChange={e => setWeight(e.target.value)} onBlur={save} /></td>
      <td className="px-2 py-1.5"><II value={naturalMin} step="0.01" onChange={e => setNaturalMin(e.target.value)} onBlur={save} /></td>
      <td className="px-2 py-1.5"><II value={naturalMax} step="0.01" onChange={e => setNaturalMax(e.target.value)} onBlur={save} /></td>
      <td className="px-2 py-1.5"><II value={baseline} step="0.01" onChange={e => setBaseline(e.target.value)} onBlur={save} /></td>
    </tr>
  )
}

// ── Personality Row ───────────────────────────────────────────────────────────

type PersonalityProfile = { id: string; traitDefId: string; naturalMin: number; naturalMax: number; baseline: number }

function PersonalityRow({ trait, profile, onSave }: {
  trait: { id: string; name: string }
  profile: PersonalityProfile | undefined
  onSave: (traitDefId: string, id: string | undefined, data: { naturalMin: number; naturalMax: number; baseline: number }) => void
}) {
  const [naturalMin, setNaturalMin] = useState(profile?.naturalMin.toString() ?? "0")
  const [naturalMax, setNaturalMax] = useState(profile?.naturalMax.toString() ?? "1")
  const [baseline, setBaseline] = useState(profile?.baseline.toString() ?? "0.5")

  useEffect(() => {
    setNaturalMin(profile?.naturalMin.toString() ?? "0")
    setNaturalMax(profile?.naturalMax.toString() ?? "1")
    setBaseline(profile?.baseline.toString() ?? "0.5")
  }, [profile?.id])

  function save() {
    onSave(trait.id, profile?.id, {
      naturalMin: parseFloat(naturalMin) || 0,
      naturalMax: parseFloat(naturalMax) || 0,
      baseline: parseFloat(baseline) || 0,
    })
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-1.5 text-sm font-medium text-foreground">{trait.name}</td>
      <td className="px-2 py-1.5"><II value={naturalMin} step="0.01" onChange={e => setNaturalMin(e.target.value)} onBlur={save} /></td>
      <td className="px-2 py-1.5"><II value={naturalMax} step="0.01" onChange={e => setNaturalMax(e.target.value)} onBlur={save} /></td>
      <td className="px-2 py-1.5"><II value={baseline} step="0.01" onChange={e => setBaseline(e.target.value)} onBlur={save} /></td>
    </tr>
  )
}

// ── Allele Freq Row ───────────────────────────────────────────────────────────

type AlleleFreq = { id: string; alleleId: string; frequency: number; isDq: boolean }

function AlleleFreqRow({ allele, freq, onSave }: {
  allele: { id: string; symbol: string }
  freq: AlleleFreq | undefined
  onSave: (alleleId: string, id: string | undefined, frequency: number, isDq: boolean) => void
}) {
  const [freqVal, setFreqVal] = useState(freq?.frequency.toString() ?? "0")

  useEffect(() => { setFreqVal(freq?.frequency.toString() ?? "0") }, [freq?.id])

  function saveFreq() {
    const f = parseFloat(freqVal)
    if (!isNaN(f)) onSave(allele.id, freq?.id, f, freq?.isDq ?? false)
  }

  function toggleDq() {
    const f = parseFloat(freqVal) || 0
    onSave(allele.id, freq?.id, freq?.frequency ?? f, !(freq?.isDq ?? false))
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-1.5 font-mono text-sm font-medium text-foreground">{allele.symbol}</td>
      <td className="px-2 py-1.5 w-28"><II value={freqVal} step="0.01" min="0" max="1" onChange={e => setFreqVal(e.target.value)} onBlur={saveFreq} /></td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={freq?.isDq ?? false} onChange={toggleDq} className="cursor-pointer" />
      </td>
    </tr>
  )
}

// ── Locus Allele Group ────────────────────────────────────────────────────────

type LocusAllele = { id: string; symbol: string; locus: { id: string; name: string } }

function LocusAlleleGroup({ locus, locusAlleles, alleleFrequencies, onSave }: {
  locus: { id: string; name: string }
  locusAlleles: LocusAllele[]
  alleleFrequencies: AlleleFreq[]
  onSave: (alleleId: string, id: string | undefined, frequency: number, isDq: boolean) => void
}) {
  return (
    <div>
      <div className="border-t border-border bg-muted/30 px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locus.name}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr><TH>Allele</TH><TH>Frequency</TH><TH center>DQ</TH></tr>
        </thead>
        <tbody>
          {locusAlleles.map(allele => (
            <AlleleFreqRow
              key={allele.id}
              allele={allele}
              freq={alleleFrequencies.find(af => af.alleleId === allele.id)}
              onSave={onSave}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Expression Row (Standards) ────────────────────────────────────────────────

type ConformStandard = { id: string; locusId: string; idealExpressionLabel: string; weight: number }

function ExpressionRow({ phenotype, existing, locusId, onSave, onRemove }: {
  phenotype: string
  existing: ConformStandard | undefined
  locusId: string
  onSave: (id: string | undefined, locusId: string, label: string, weight: number) => void
  onRemove: (id: string) => void
}) {
  const inStandard = !!existing
  const [weight, setWeight] = useState(existing?.weight.toString() ?? "1")

  useEffect(() => { if (existing) setWeight(existing.weight.toString()) }, [existing?.weight])

  function handleToggle(checked: boolean) {
    if (checked) onSave(undefined, locusId, phenotype, parseFloat(weight) || 1)
    else if (existing) onRemove(existing.id)
  }

  function saveWeight() {
    if (inStandard && existing) onSave(existing.id, locusId, phenotype, parseFloat(weight) || 1)
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-1.5 w-8">
        <input type="checkbox" checked={inStandard} onChange={e => handleToggle(e.target.checked)} className="cursor-pointer" />
      </td>
      <td className="px-3 py-1.5 text-sm text-foreground">{phenotype}</td>
      <td className="px-2 py-1.5 w-28">
        <II value={weight} step="0.01" min="0" onChange={e => setWeight(e.target.value)} onBlur={saveWeight} disabled={!inStandard} />
      </td>
      {/* DQ: needs isDq Boolean @default(false) on BreedConformationStandard + mutation */}
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" disabled title="Needs isDq on BreedConformationStandard schema" />
      </td>
    </tr>
  )
}

// ── Locus Standards Group ─────────────────────────────────────────────────────

function LocusStandardsGroup({ locus, conformStandards, onSave, onRemove }: {
  locus: { id: string; name: string }
  conformStandards: ConformStandard[]
  onSave: (id: string | undefined, locusId: string, label: string, weight: number) => void
  onRemove: (id: string) => void
}) {
  const { data: rules } = trpc.admin.expression.listByLocus.useQuery({ locusId: locus.id })
  const phenotypes = useMemo(() => [...new Set(rules?.map(r => r.phenotype) ?? [])], [rules])

  return (
    <div>
      <div className="border-t border-border bg-muted/30 px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locus.name}</span>
      </div>
      {phenotypes.length === 0 ? (
        <p className="px-4 py-2 text-xs text-muted-foreground/60">No expression rules defined yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr><TH>In Standard</TH><TH>Expression</TH><TH>Weight</TH><TH center>DQ</TH></tr>
          </thead>
          <tbody>
            {phenotypes.map(phenotype => (
              <ExpressionRow
                key={phenotype}
                phenotype={phenotype}
                existing={conformStandards.find(cs => cs.locusId === locus.id && cs.idealExpressionLabel === phenotype)}
                locusId={locus.id}
                onSave={onSave}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function BreedsPage() {
  const { gameId } = Route.useParams()
  const [editing, setEditing] = useState<BreedForm | null>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>("stats")

  const { data: breeds } = trpc.admin.breed.list.useQuery({ gameId: gameId! })
  const { data: species } = trpc.admin.species.list.useQuery({ gameId: gameId! })
  const { data: stats } = trpc.admin.stat.list.useQuery({ gameId: gameId! })
  const { data: loci } = trpc.admin.breed.listLoci.useQuery({ gameId: gameId! })
  const { data: personalityTraits } = trpc.admin.personality.list.useQuery({ gameId: gameId! })
  const { data: alleles } = trpc.admin.breed.listAlleles.useQuery({ gameId: gameId! })

  const { data: statProfiles } = trpc.admin.breed.listStatProfiles.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )
  const { data: conformStandards } = trpc.admin.breed.listConformationStandards.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )
  const { data: personalityProfiles } = trpc.admin.breed.listPersonalityProfiles.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )
  const { data: alleleFrequencies } = trpc.admin.breed.listAlleleFrequencies.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )

  const utils = trpc.useUtils()

  const saveBreed = trpc.admin.breed.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.breed.list.invalidate()
      setEditing(prev => prev ? { ...prev, id: saved.id } : null)
    },
  })
  const removeBreed = trpc.admin.breed.remove.useMutation({ onSuccess: () => utils.admin.breed.list.invalidate() })
  const saveStatProfile = trpc.admin.breed.saveStatProfile.useMutation({ onSuccess: () => utils.admin.breed.listStatProfiles.invalidate() })
  const saveConform = trpc.admin.breed.saveConformationStandard.useMutation({ onSuccess: () => utils.admin.breed.listConformationStandards.invalidate() })
  const removeConform = trpc.admin.breed.removeConformationStandard.useMutation({ onSuccess: () => utils.admin.breed.listConformationStandards.invalidate() })
  const savePersonalityProfile = trpc.admin.breed.savePersonalityProfile.useMutation({ onSuccess: () => utils.admin.breed.listPersonalityProfiles.invalidate() })
  const saveAlleleFreq = trpc.admin.breed.saveAlleleFrequency.useMutation({
    onSuccess: () => utils.admin.breed.listAlleleFrequencies.invalidate({ breedId: editing?.id }),
  })

  function handleSaveBreed() {
    if (!editing || !gameId) return
    saveBreed.mutate({
      id: editing.id, gameId,
      name: editing.name, speciesId: editing.speciesId, categoryBadge: editing.categoryBadge,
      image: editing.image || null, lore: editing.lore || null, isUnregistered: editing.isUnregistered,
      convergenceGenerations: editing.convergenceGenerations ? parseInt(editing.convergenceGenerations) : null,
      lifeExpectancyBaseline: editing.lifeExpectancyBaseline ? parseInt(editing.lifeExpectancyBaseline) : null,
      immunityMin: editing.immunityMin !== "" ? parseFloat(editing.immunityMin) : null,
      immunityMax: editing.immunityMax !== "" ? parseFloat(editing.immunityMax) : null,
    })
  }

  function handleSaveStatProfile(statDefId: string, id: string | undefined, data: { weight: number; naturalMin: number; naturalMax: number; baseline: number }) {
    if (!editing?.id) return
    saveStatProfile.mutate({ id, breedId: editing.id, statDefId, ...data })
  }

  function handleSaveConform(id: string | undefined, locusId: string, label: string, weight: number) {
    if (!editing?.id) return
    saveConform.mutate({ id, breedId: editing.id, locusId, idealExpressionLabel: label, weight })
  }

  function handleSavePersonalityProfile(traitDefId: string, id: string | undefined, data: { naturalMin: number; naturalMax: number; baseline: number }) {
    if (!editing?.id) return
    savePersonalityProfile.mutate({ id, breedId: editing.id, traitDefId, ...data })
  }

  function handleSaveAlleleFreq(alleleId: string, id: string | undefined, frequency: number, isDq: boolean) {
    if (!editing?.id) return
    saveAlleleFreq.mutate({ id, breedId: editing.id, alleleId, frequency, isDq })
  }

  const locusAlleleGroups = useMemo(() => {
    const map = new Map<string, { locus: { id: string; name: string }; alleles: LocusAllele[] }>()
    for (const a of alleles ?? []) {
      if (!map.has(a.locus.id)) map.set(a.locus.id, { locus: a.locus, alleles: [] })
      map.get(a.locus.id)!.alleles.push(a)
    }
    return Array.from(map.values())
  }, [alleles])

  // ── List view ─────────────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <h1 className="font-serif text-xl font-semibold text-foreground px-1">Breeds</h1>
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-[300px_1fr] divide-x divide-border">
            {/* Left: breed list */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">All Breeds</h2>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ ...emptyBreed })}>+ New</Button>
              </div>
              <div className="divide-y divide-border overflow-y-auto">
                {breeds?.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setEditing({
                      id: b.id, name: b.name, speciesId: b.speciesId, categoryBadge: b.categoryBadge,
                      image: b.image ?? "", lore: b.lore ?? "", isUnregistered: b.isUnregistered,
                      convergenceGenerations: b.convergenceGenerations?.toString() ?? "",
                      lifeExpectancyBaseline: b.lifeExpectancyBaseline?.toString() ?? "",
                      immunityMin: b.immunityMin?.toString() ?? "", immunityMax: b.immunityMax?.toString() ?? "",
                    })}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="text-sm font-medium text-foreground">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.species.name} · {b.categoryBadge}</div>
                  </button>
                ))}
                {breeds?.length === 0 && (
                  <p className="px-3 py-6 text-sm text-center text-muted-foreground">No breeds yet.</p>
                )}
              </div>
            </div>
            {/* Right: placeholder */}
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
              <p className="text-sm text-muted-foreground">Select a breed to view and edit its details, genetics, and standards.</p>
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...emptyBreed })}>Add New Breed</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Edit view — 2-col layout ──────────────────────────────────────────────────

  const TABS: { key: ActivePanel; label: string }[] = [
    { key: "stats", label: "Stats" },
    { key: "loci", label: "Loci & Genetics" },
    { key: "standards", label: "Breed Standards" },
    { key: "personality", label: "Personality" },
  ]

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4 px-1">
        <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">← Breeds</button>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-serif text-xl font-semibold text-foreground">{editing.id ? editing.name : "New Breed"}</h1>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-[300px_1fr] divide-x divide-border items-start">

        {/* Left: Breed Details */}
        <div>
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Breed Details</h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input className="h-8 text-sm" value={editing.name} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Species</label>
              <select value={editing.speciesId} onChange={e => setEditing(p => p && { ...p, speciesId: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select species…</option>
                {species?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Category</label>
                <select value={editing.categoryBadge} onChange={e => setEditing(p => p && { ...p, categoryBadge: e.target.value as BreedForm["categoryBadge"] })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="BASE">Base</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Convergence Gens</label>
                <Input className="h-8 text-sm" type="number" min="1" value={editing.convergenceGenerations}
                  onChange={e => setEditing(p => p && { ...p, convergenceGenerations: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Life Exp.</label>
                <Input className="h-8 text-sm" type="number" min="1" placeholder="144" value={editing.lifeExpectancyBaseline}
                  onChange={e => setEditing(p => p && { ...p, lifeExpectancyBaseline: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Imm. Min</label>
                <Input className="h-8 text-sm" type="number" step="0.1" placeholder="10" value={editing.immunityMin}
                  onChange={e => setEditing(p => p && { ...p, immunityMin: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Imm. Max</label>
                <Input className="h-8 text-sm" type="number" step="0.1" placeholder="90" value={editing.immunityMax}
                  onChange={e => setEditing(p => p && { ...p, immunityMax: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Image URL</label>
              <Input className="h-8 text-sm" value={editing.image} onChange={e => setEditing(p => p && { ...p, image: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lore</label>
              <textarea value={editing.lore} onChange={e => setEditing(p => p && { ...p, lore: e.target.value })}
                rows={3} className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={editing.isUnregistered}
                onChange={e => setEditing(p => p && { ...p, isUnregistered: e.target.checked })} />
              Unregistered
            </label>
            {saveBreed.error && <p className="text-sm text-destructive">{saveBreed.error.message}</p>}
            <Button className="w-full h-8 text-sm" onClick={handleSaveBreed} disabled={saveBreed.isPending}>
              {saveBreed.isPending ? "Saving…" : editing.id ? "Save Breed" : "Create Breed"}
            </Button>
          </div>
        </div>

        {/* Right: Tabbed panels */}
        {editing.id ? (
          <div className="overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-border bg-secondary/40">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActivePanel(tab.key)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    activePanel === tab.key
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Stats */}
            {activePanel === "stats" && (
              !stats?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No stats configured for this game yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr><TH>Stat</TH><TH>Weight</TH><TH>Natural Min</TH><TH>Natural Max</TH><TH>Baseline</TH></tr>
                  </thead>
                  <tbody>
                    {stats.map(stat => (
                      <StatRow key={stat.id} stat={stat}
                        profile={statProfiles?.find(sp => sp.statDefId === stat.id)}
                        onSave={handleSaveStatProfile} />
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* Loci & Genetics */}
            {activePanel === "loci" && (
              !loci?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Configure loci in the Genetics section first.</p>
              ) : (
                <div className="grid grid-cols-2 divide-x divide-border">
                  {locusAlleleGroups.map(({ locus, alleles: la }) => (
                    <LocusAlleleGroup key={locus.id} locus={locus} locusAlleles={la}
                      alleleFrequencies={alleleFrequencies ?? []} onSave={handleSaveAlleleFreq} />
                  ))}
                </div>
              )
            )}

            {/* Breed Standards */}
            {activePanel === "standards" && (
              !loci?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Configure loci in the Genetics section first.</p>
              ) : (
                <div>
                  <p className="px-3 py-2 text-xs text-muted-foreground/60 border-b border-border">
                    Check an expression to include it in this breed's conformation standard. DQ column pending schema update.
                  </p>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    {loci.map(locus => (
                      <LocusStandardsGroup key={locus.id} locus={locus}
                        conformStandards={conformStandards ?? []}
                        onSave={handleSaveConform}
                        onRemove={id => removeConform.mutate({ id })} />
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Personality */}
            {activePanel === "personality" && (
              !personalityTraits?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Configure personality traits in the Animals section first.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr><TH>Trait</TH><TH>Natural Min</TH><TH>Natural Max</TH><TH>Baseline</TH></tr>
                  </thead>
                  <tbody>
                    {personalityTraits.map(trait => (
                      <PersonalityRow key={trait.id} trait={trait}
                        profile={personalityProfiles?.find(pp => pp.traitDefId === trait.id)}
                        onSave={handleSavePersonalityProfile} />
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-muted-foreground">Save the breed first to configure stats, genetics, and standards.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
