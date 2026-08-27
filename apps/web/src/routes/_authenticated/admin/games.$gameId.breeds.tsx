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
  isAvailable: boolean
  convergenceGenerations: string
  lifeExpectancyBaseline: string
  immunityMin: string
  immunityMax: string
}

const emptyBreed: BreedForm = {
  name: "", speciesId: "", categoryBadge: "BASE", image: "", lore: "",
  isUnregistered: false, isAvailable: false, convergenceGenerations: "", lifeExpectancyBaseline: "",
  immunityMin: "", immunityMax: "",
}

type ActivePanel = "stats" | "color" | "conformation" | "health" | "standards" | "personality"
type WizardStep = 1 | 2 | 3 | 4 | null

const WIZARD_LABELS: Record<2 | 3 | 4, string> = {
  2: "Allele Frequencies",
  3: "Stat Profile",
  4: "Breed Standards",
}

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

function StatRow({ stat, values, onChange }: {
  stat: { id: string; name: string }
  values: { weight: string; naturalMin: string; naturalMax: string; baseline: string }
  onChange: (statDefId: string, field: string, value: string) => void
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-1.5 text-sm font-medium text-foreground">{stat.name}</td>
      <td className="px-2 py-1.5"><II value={values.weight} step="0.01" onChange={e => onChange(stat.id, "weight", e.target.value)} /></td>
      <td className="px-2 py-1.5"><II value={values.naturalMin} step="0.01" onChange={e => onChange(stat.id, "naturalMin", e.target.value)} /></td>
      <td className="px-2 py-1.5"><II value={values.naturalMax} step="0.01" onChange={e => onChange(stat.id, "naturalMax", e.target.value)} /></td>
      <td className="px-2 py-1.5"><II value={values.baseline} step="0.01" onChange={e => onChange(stat.id, "baseline", e.target.value)} /></td>
    </tr>
  )
}

// ── Personality Row ───────────────────────────────────────────────────────────

function PersonalityRow({ trait, values, onChange }: {
  trait: { id: string; name: string }
  values: { naturalMin: string; naturalMax: string; baseline: string }
  onChange: (traitDefId: string, field: string, value: string) => void
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-1.5 text-sm font-medium text-foreground">{trait.name}</td>
      <td className="px-2 py-1.5"><II value={values.naturalMin} step="1" min="0" max="100" onChange={e => onChange(trait.id, "naturalMin", e.target.value)} /></td>
      <td className="px-2 py-1.5"><II value={values.naturalMax} step="1" min="0" max="100" onChange={e => onChange(trait.id, "naturalMax", e.target.value)} /></td>
      <td className="px-2 py-1.5"><II value={values.baseline} step="1" min="0" max="100" onChange={e => onChange(trait.id, "baseline", e.target.value)} /></td>
    </tr>
  )
}

// ── Allele Freq Row ───────────────────────────────────────────────────────────

type AlleleFreq = { id: string; alleleId: string; frequency: number; isDq: boolean }

function AlleleFreqRow({ allele, values, onFreqChange }: {
  allele: { id: string; symbol: string }
  values: { frequency: string; isDq: boolean }
  onFreqChange: (alleleId: string, value: string) => void
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-1.5 font-mono text-sm font-medium text-foreground">{allele.symbol}</td>
      <td className="px-2 py-1.5">
        <II value={values.frequency} step="0.01" min="0" max="1"
          onChange={e => onFreqChange(allele.id, e.target.value)} />
      </td>
    </tr>
  )
}

// ── Locus Allele Group ────────────────────────────────────────────────────────

type LocusAllele = { id: string; symbol: string; locus: { id: string; name: string; panelEntries: { panelDef: { panelType: string } }[] } }

function LocusAlleleGroup({ locus, locusAlleles, freqValues, onFreqChange }: {
  locus: { id: string; name: string }
  locusAlleles: LocusAllele[]
  freqValues: Record<string, { frequency: string; isDq: boolean }>
  onFreqChange: (alleleId: string, value: string) => void
}) {
  const total = locusAlleles.reduce((s, a) => s + (parseFloat(freqValues[a.id]?.frequency ?? "") || 0), 0)
  const hasAnyValue = locusAlleles.some(a => (freqValues[a.id]?.frequency ?? "") !== "")
  const isValid = Math.abs(total - 1) < 0.001

  return (
    <div className="border-b border-border last:border-0">
      <div className="bg-secondary/40 px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locus.name}</span>
        {hasAnyValue && (
          <span className={cn("font-mono text-[10px] tabular-nums", isValid ? "text-primary" : "text-destructive font-semibold")}>
            {total.toFixed(3)} / 1.000
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20"><TH>Allele</TH><TH>Frequency</TH></tr>
        </thead>
        <tbody>
          {locusAlleles.map(allele => (
            <AlleleFreqRow
              key={allele.id}
              allele={allele}
              values={freqValues[allele.id] ?? { frequency: "", isDq: false }}
              onFreqChange={onFreqChange}
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
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-1.5 w-8">
        <input type="checkbox" checked={inStandard} onChange={e => handleToggle(e.target.checked)} className="cursor-pointer" />
      </td>
      <td className="px-3 py-1.5 text-sm text-foreground">{phenotype}</td>
      <td className="px-2 py-1.5 w-28">
        <II value={weight} step="0.01" min="0" onChange={e => setWeight(e.target.value)} onBlur={saveWeight} disabled={!inStandard} />
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
    <div className="border-b border-border last:border-0">
      <div className="bg-secondary/40 px-3 py-2 border-b border-border">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locus.name}</span>
      </div>
      {phenotypes.length === 0 ? (
        <p className="px-4 py-2 text-xs text-muted-foreground/60">No expression rules defined yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20"><TH>In Standard</TH><TH>Expression</TH><TH>Weight</TH></tr>
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

// ── Loci & Standards panel content (shared between wizard and tabs) ────────────

function LociContent({ locusAlleleGroups, freqValues, onFreqChange, onSaveAll, isPending }: {
  locusAlleleGroups: { locus: { id: string; name: string; panelEntries: { panelDef: { panelType: string } }[] }; alleles: LocusAllele[] }[]
  freqValues: Record<string, { frequency: string; isDq: boolean }>
  onFreqChange: (alleleId: string, value: string) => void
  onSaveAll: () => void
  isPending: boolean
}) {
  if (!locusAlleleGroups.length) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">No loci assigned to this panel. Assign loci to panels in the Loci &amp; Alleles section.</p>
  }
  const allValid = locusAlleleGroups.every(({ alleles: la }) => {
    const total = la.reduce((s, a) => s + (parseFloat(freqValues[a.id]?.frequency ?? "") || 0), 0)
    return Math.abs(total - 1) < 0.001
  })

  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-border">
        {locusAlleleGroups.map(({ locus, alleles: la }) => (
          <LocusAlleleGroup key={locus.id} locus={locus} locusAlleles={la}
            freqValues={freqValues} onFreqChange={onFreqChange} />
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-border bg-secondary/20">
        {!allValid && (
          <span className="text-xs text-destructive">All loci must sum to 1.000 before saving</span>
        )}
        <Button size="sm" onClick={onSaveAll} disabled={isPending || !allValid}>
          {isPending ? "Saving…" : "Save All"}
        </Button>
      </div>
    </div>
  )
}

function StandardsContent({ loci, conformStandards, onSave, onRemove }: {
  loci: { id: string; name: string }[]
  conformStandards: ConformStandard[]
  onSave: (id: string | undefined, locusId: string, label: string, weight: number) => void
  onRemove: (id: string) => void
}) {
  if (!loci.length) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">Configure loci in the Genetics section first.</p>
  }
  return (
    <div>
      <p className="px-3 py-2 text-xs text-muted-foreground/60 border-b border-border">
        Check an expression to include it in this breed's conformation standard.
      </p>
      <div className="grid grid-cols-2 divide-x divide-border">
        {loci.map(locus => (
          <LocusStandardsGroup key={locus.id} locus={locus}
            conformStandards={conformStandards}
            onSave={onSave}
            onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function BreedsPage() {
  const { gameId } = Route.useParams()
  const [editing, setEditing] = useState<BreedForm | null>(null)
  const [wizardStep, setWizardStep] = useState<WizardStep>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>("stats")
  const [statValues, setStatValues] = useState<Record<string, { weight: string; naturalMin: string; naturalMax: string; baseline: string }>>({})
  const [personalityValues, setPersonalityValues] = useState<Record<string, { naturalMin: string; naturalMax: string; baseline: string }>>({})
  const [freqValues, setFreqValues] = useState<Record<string, { frequency: string; isDq: boolean }>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  useEffect(() => {
    if (!stats) return
    setStatValues(prev => {
      const next: typeof prev = {}
      for (const stat of stats) {
        const p = statProfiles?.find(sp => sp.statDefId === stat.id)
        next[stat.id] = prev[stat.id] ?? {
          weight: p?.weight.toString() ?? "1",
          naturalMin: p?.naturalMin.toString() ?? "0",
          naturalMax: p?.naturalMax.toString() ?? "100",
          baseline: p?.baseline.toString() ?? "50",
        }
      }
      return next
    })
  }, [stats, statProfiles])

  useEffect(() => {
    if (!personalityTraits) return
    setPersonalityValues(prev => {
      const next: typeof prev = {}
      for (const trait of personalityTraits) {
        const p = personalityProfiles?.find(pp => pp.traitDefId === trait.id)
        next[trait.id] = prev[trait.id] ?? {
          naturalMin: p?.naturalMin.toString() ?? "0",
          naturalMax: p?.naturalMax.toString() ?? "100",
          baseline: p?.baseline.toString() ?? "50",
        }
      }
      return next
    })
  }, [personalityTraits, personalityProfiles])

  useEffect(() => {
    if (!alleles) return
    setFreqValues(prev => {
      const next: typeof prev = {}
      for (const allele of alleles) {
        const f = alleleFrequencies?.find(af => af.alleleId === allele.id)
        next[allele.id] = {
          frequency: f?.frequency.toString() ?? (prev[allele.id]?.frequency ?? ""),
          isDq: f?.isDq ?? (prev[allele.id]?.isDq ?? false),
        }
      }
      return next
    })
  }, [alleles, alleleFrequencies])

  const saveBreed = trpc.admin.breed.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.breed.list.invalidate()
      setEditing(prev => prev ? { ...prev, id: saved.id } : null)
      setWizardStep(prev => prev === 1 ? 2 : prev)
    },
  })
  const removeBreed = trpc.admin.breed.remove.useMutation({
    onSuccess: () => { utils.admin.breed.list.invalidate(); setEditing(null); setWizardStep(null) },
  })
  const saveAllStatProfiles = trpc.admin.breed.saveAllStatProfiles.useMutation({
    onSuccess: () => utils.admin.breed.listStatProfiles.invalidate(),
  })
  const saveConform = trpc.admin.breed.saveConformationStandard.useMutation({
    onSuccess: () => utils.admin.breed.listConformationStandards.invalidate(),
  })
  const removeConform = trpc.admin.breed.removeConformationStandard.useMutation({
    onSuccess: () => utils.admin.breed.listConformationStandards.invalidate(),
  })
  const savePersonalityProfile = trpc.admin.breed.savePersonalityProfile.useMutation({
    onSuccess: () => utils.admin.breed.listPersonalityProfiles.invalidate(),
  })
  const saveAllPersonalityProfiles = trpc.admin.breed.saveAllPersonalityProfiles.useMutation({
    onSuccess: () => utils.admin.breed.listPersonalityProfiles.invalidate(),
  })
  const saveAllAlleleFreqs = trpc.admin.breed.saveAllAlleleFrequencies.useMutation({
    onSuccess: () => utils.admin.breed.listAlleleFrequencies.invalidate({ breedId: editing?.id }),
  })

  function handleSaveBreed() {
    if (!editing || !gameId) return
    saveBreed.mutate({
      id: editing.id, gameId,
      name: editing.name, speciesId: editing.speciesId, categoryBadge: editing.categoryBadge,
      image: editing.image || null, lore: editing.lore || null, isUnregistered: editing.isUnregistered, isAvailable: editing.isAvailable,
      convergenceGenerations: editing.convergenceGenerations ? parseInt(editing.convergenceGenerations) : null,
      lifeExpectancyBaseline: editing.lifeExpectancyBaseline ? parseInt(editing.lifeExpectancyBaseline) : null,
      immunityMin: editing.immunityMin !== "" ? parseFloat(editing.immunityMin) : null,
      immunityMax: editing.immunityMax !== "" ? parseFloat(editing.immunityMax) : null,
    })
  }

  function handleStatChange(statDefId: string, field: string, value: string) {
    setStatValues(prev => ({ ...prev, [statDefId]: { ...prev[statDefId]!, [field]: value } }))
  }

  function handleSaveAllStats() {
    if (!editing?.id || !stats) return
    saveAllStatProfiles.mutate({
      breedId: editing.id,
      profiles: stats.map(stat => {
        const v = statValues[stat.id] ?? { weight: "1", naturalMin: "0", naturalMax: "100", baseline: "50" }
        return {
          statDefId: stat.id,
          weight: parseFloat(v.weight) || 0,
          naturalMin: parseFloat(v.naturalMin) || 0,
          naturalMax: parseFloat(v.naturalMax) || 0,
          baseline: parseFloat(v.baseline) || 0,
        }
      }),
    })
  }

  function handleSaveConform(id: string | undefined, locusId: string, label: string, weight: number) {
    if (!editing?.id) return
    saveConform.mutate({ id, breedId: editing.id, locusId, idealExpressionLabel: label, weight })
  }

  function handleSavePersonalityProfile(traitDefId: string, id: string | undefined, data: { naturalMin: number; naturalMax: number; baseline: number }) {
    if (!editing?.id) return
    savePersonalityProfile.mutate({ id, breedId: editing.id, traitDefId, ...data })
  }

  function handlePersonalityChange(traitDefId: string, field: string, value: string) {
    setPersonalityValues(prev => ({ ...prev, [traitDefId]: { ...prev[traitDefId]!, [field]: value } }))
  }

  function handleSaveAllPersonality() {
    if (!editing?.id || !personalityTraits) return
    saveAllPersonalityProfiles.mutate({
      breedId: editing.id,
      profiles: personalityTraits.map(trait => {
        const v = personalityValues[trait.id] ?? { naturalMin: "0", naturalMax: "100", baseline: "50" }
        return {
          traitDefId: trait.id,
          naturalMin: parseFloat(v.naturalMin) || 0,
          naturalMax: parseFloat(v.naturalMax) || 0,
          baseline: parseFloat(v.baseline) || 0,
        }
      }),
    })
  }

  function handleFreqChange(alleleId: string, value: string) {
    setFreqValues(prev => ({ ...prev, [alleleId]: { ...prev[alleleId]!, frequency: value } }))
  }

  function handleDqChange(alleleId: string, isDq: boolean) {
    setFreqValues(prev => ({ ...prev, [alleleId]: { ...prev[alleleId]!, isDq } }))
  }

  function handleSaveAllAlleleFreqs() {
    if (!editing?.id || !alleles) return
    saveAllAlleleFreqs.mutate({
      breedId: editing.id,
      frequencies: alleles.map(a => {
        const v = freqValues[a.id] ?? { frequency: "0", isDq: false }
        return { alleleId: a.id, frequency: parseFloat(v.frequency) || 0, isDq: v.isDq }
      }),
    })
  }

  const locusAlleleGroups = useMemo(() => {
    const map = new Map<string, { locus: { id: string; name: string }; alleles: LocusAllele[] }>()
    for (const a of alleles ?? []) {
      if (!map.has(a.locus.id)) map.set(a.locus.id, { locus: a.locus, alleles: [] })
      map.get(a.locus.id)!.alleles.push(a)
    }
    return Array.from(map.values())
  }, [alleles])

  function advanceWizard() {
    setWizardStep(s => s === 2 ? 3 : s === 3 ? 4 : null)
  }
  function retreatWizard() {
    setWizardStep(s => s === 4 ? 3 : s === 3 ? 2 : 1)
  }

  // ── List view ─────────────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <h1 className="font-serif text-xl font-semibold text-foreground px-1">Breeds</h1>
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-[300px_1fr] divide-x divide-border">
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">All Breeds</h2>
                <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...emptyBreed }); setWizardStep(1) }}>+ New</Button>
              </div>
              <div className="divide-y divide-border overflow-y-auto">
                {breeds?.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setEditing({
                        id: b.id, name: b.name, speciesId: b.speciesId, categoryBadge: b.categoryBadge,
                        image: b.image ?? "", lore: b.lore ?? "", isUnregistered: b.isUnregistered, isAvailable: b.isAvailable,
                        convergenceGenerations: b.convergenceGenerations?.toString() ?? "",
                        lifeExpectancyBaseline: b.lifeExpectancyBaseline?.toString() ?? "",
                        immunityMin: b.immunityMin?.toString() ?? "", immunityMax: b.immunityMax?.toString() ?? "",
                      })
                      setWizardStep(null)
                    }}
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
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
              <p className="text-sm text-muted-foreground">Select a breed to view and edit its details, genetics, and standards.</p>
              <Button size="sm" variant="outline" onClick={() => { setEditing({ ...emptyBreed }); setWizardStep(1) }}>Add New Breed</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Edit view ─────────────────────────────────────────────────────────────────

  const TABS: { key: ActivePanel; label: string }[] = [
    { key: "stats", label: "Stats" },
    { key: "color", label: "Color" },
    { key: "conformation", label: "Conformation" },
    { key: "health", label: "Health" },
    { key: "standards", label: "Breed Standards" },
    { key: "personality", label: "Personality" },
  ]

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4 px-1">
        <button onClick={() => { setEditing(null); setWizardStep(null) }} className="text-sm text-muted-foreground hover:text-foreground">← Breeds</button>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-serif text-xl font-semibold text-foreground">{editing.id ? editing.name : "New Breed"}</h1>
        {wizardStep !== null && (
          <span className="text-xs text-muted-foreground bg-muted rounded px-2 py-0.5">
            Step {wizardStep} of 4
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-[300px_1fr] divide-x divide-border">

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
                <Input className="h-8 text-sm" type="number" min="1" placeholder="e.g. 360" value={editing.lifeExpectancyBaseline}
                  onChange={e => setEditing(p => p && { ...p, lifeExpectancyBaseline: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Imm. Min</label>
                <Input className="h-8 text-sm" type="number" step="0.1" placeholder="e.g. 40" value={editing.immunityMin}
                  onChange={e => setEditing(p => p && { ...p, immunityMin: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Imm. Max</label>
                <Input className="h-8 text-sm" type="number" step="0.1" placeholder="e.g. 85" value={editing.immunityMax}
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
              <input type="checkbox" checked={editing.isAvailable}
                onChange={e => setEditing(p => p && { ...p, isAvailable: e.target.checked })} />
              Available (visible to players)
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={editing.isUnregistered}
                onChange={e => setEditing(p => p && { ...p, isUnregistered: e.target.checked })} />
              Unregistered (cross pool)
            </label>
            {saveBreed.error && <p className="text-sm text-destructive">{saveBreed.error.message}</p>}
            <Button className="w-full h-8 text-sm" onClick={handleSaveBreed} disabled={saveBreed.isPending}>
              {saveBreed.isPending ? "Saving…" : editing.id ? "Save Breed" : "Create Breed"}
            </Button>
            {editing.id && (
              <div className="pt-1 border-t border-border">
                {confirmDelete ? (
                  <div className="flex gap-2">
                    <Button variant="destructive" className="flex-1 h-8 text-sm" disabled={removeBreed.isPending}
                      onClick={() => removeBreed.mutate({ id: editing.id! })}>
                      {removeBreed.isPending ? "Deleting…" : "Confirm Delete"}
                    </Button>
                    <Button variant="ghost" className="h-8 text-sm px-3" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="w-full h-8 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}>
                    Delete Breed
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Wizard steps or normal tabs */}
        {wizardStep !== null ? (
          <div className="flex flex-col">
            {wizardStep === 1 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
                <p className="text-sm text-muted-foreground">Fill in the breed details and click Create Breed to continue setting up allele frequencies, stat profiles, and breed standards.</p>
                <div className="flex items-center gap-3">
                  {([2, 3, 4] as const).map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                      {i > 0 && <span className="text-muted-foreground/40 text-xs">→</span>}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                        <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[10px]">{i + 1}</span>
                        {WIZARD_LABELS[s]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Step progress header */}
                <div className="flex items-center gap-4 border-b border-border bg-secondary/40 px-3 py-2">
                  {([2, 3, 4] as const).map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setWizardStep(s)}
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        wizardStep === s ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold",
                        wizardStep === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      {WIZARD_LABELS[s]}
                    </button>
                  ))}
                </div>

                {/* Step content */}
                {wizardStep === 2 && (
                  <LociContent
                    locusAlleleGroups={locusAlleleGroups}
                    freqValues={freqValues}
                    onFreqChange={handleFreqChange}
                    onSaveAll={handleSaveAllAlleleFreqs}
                    isPending={saveAllAlleleFreqs.isPending}
                  />
                )}
                {wizardStep === 3 && (
                  !stats?.length ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No stats configured for this game yet.</p>
                  ) : (
                    <div className="space-y-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr><TH>Stat</TH><TH>Weight</TH><TH>Natural Min</TH><TH>Natural Max</TH><TH>Baseline</TH></tr>
                        </thead>
                        <tbody>
                          {stats.map(stat => (
                            <StatRow key={stat.id} stat={stat}
                              values={statValues[stat.id] ?? { weight: "1", naturalMin: "0", naturalMax: "100", baseline: "50" }}
                              onChange={handleStatChange} />
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end px-2 pb-1">
                        <Button size="sm" onClick={handleSaveAllStats} disabled={saveAllStatProfiles.isPending}>
                          {saveAllStatProfiles.isPending ? "Saving…" : "Save Stats"}
                        </Button>
                      </div>
                    </div>
                  )
                )}
                {wizardStep === 4 && (
                  <StandardsContent
                    loci={loci ?? []}
                    conformStandards={conformStandards ?? []}
                    onSave={handleSaveConform}
                    onRemove={id => removeConform.mutate({ id })}
                  />
                )}

                {/* Navigation */}
                <div className="border-t border-border px-3 py-2 flex items-center justify-between mt-auto">
                  <Button variant="ghost" size="sm" onClick={retreatWizard}>← Back</Button>
                  {wizardStep !== 4 ? (
                    <Button size="sm" onClick={advanceWizard}>Next →</Button>
                  ) : (
                    <Button size="sm" onClick={() => setWizardStep(null)}>Done ✓</Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : editing.id ? (
          // Normal tab mode
          <div className="min-w-0">
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

            {activePanel === "stats" && (
              !stats?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No stats configured for this game yet.</p>
              ) : (
                <div className="space-y-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40"><TH>Stat</TH><TH>Weight</TH><TH>Natural Min</TH><TH>Natural Max</TH><TH>Baseline</TH></tr>
                    </thead>
                    <tbody>
                      {stats.map(stat => (
                        <StatRow key={stat.id} stat={stat}
                          values={statValues[stat.id] ?? { weight: "1", naturalMin: "0", naturalMax: "100", baseline: "50" }}
                          onChange={handleStatChange} />
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end px-2 pb-1">
                    <Button size="sm" onClick={handleSaveAllStats} disabled={saveAllStatProfiles.isPending}>
                      {saveAllStatProfiles.isPending ? "Saving…" : "Save Stats"}
                    </Button>
                  </div>
                </div>
              )
            )}

            {(activePanel === "color" || activePanel === "conformation" || activePanel === "health") && (
              <LociContent
                locusAlleleGroups={locusAlleleGroups.filter(
                  (g) => g.locus.panelEntries.some(
                    (e) => e.panelDef.panelType.toLowerCase() === activePanel
                  )
                )}
                freqValues={freqValues}
                onFreqChange={handleFreqChange}
                onSaveAll={handleSaveAllAlleleFreqs}
                isPending={saveAllAlleleFreqs.isPending}
              />
            )}

            {activePanel === "standards" && (
              <StandardsContent
                loci={loci ?? []}
                conformStandards={conformStandards ?? []}
                onSave={handleSaveConform}
                onRemove={id => removeConform.mutate({ id })}
              />
            )}

            {activePanel === "personality" && (
              !personalityTraits?.length ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Configure personality traits in the Animals section first.</p>
              ) : (
                <div className="space-y-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40"><TH>Trait</TH><TH>Natural Min</TH><TH>Natural Max</TH><TH>Baseline</TH></tr>
                    </thead>
                    <tbody>
                      {personalityTraits.map(trait => (
                        <PersonalityRow key={trait.id} trait={trait}
                          values={personalityValues[trait.id] ?? { naturalMin: "0", naturalMax: "100", baseline: "50" }}
                          onChange={handlePersonalityChange} />
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end px-2 pb-1">
                    <Button size="sm" onClick={handleSaveAllPersonality} disabled={saveAllPersonalityProfiles.isPending}>
                      {saveAllPersonalityProfiles.isPending ? "Saving…" : "Save All"}
                    </Button>
                  </div>
                </div>
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
