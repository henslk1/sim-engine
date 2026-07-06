import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type BreedForm = {
  id?: string
  name: string
  speciesId: string
  categoryBadge: "BASE" | "SECONDARY" | "CUSTOM"
  image: string
  lore: string
  isUnregistered: boolean
  convergenceGenerations: string
}

type StatProfileForm = {
  id?: string
  statDefId: string
  weight: number
  naturalMin: number
  naturalMax: number
  baseline: number
}

type ConformForm = {
  id?: string
  locusId: string
  idealExpressionLabel: string
  weight: number
}

type PersonalityProfileForm = {
  id?: string
  traitDefId: string
  naturalMin: number
  naturalMax: number
  baseline: number
}

const emptyBreed: BreedForm = {
  name: "",
  speciesId: "",
  categoryBadge: "BASE",
  image: "",
  lore: "",
  isUnregistered: false,
  convergenceGenerations: "",
}

const emptyStatProfile: StatProfileForm = {
  statDefId: "",
  weight: 0,
  naturalMin: 0,
  naturalMax: 0,
  baseline: 0,
}

const emptyConform: ConformForm = {
  locusId: "",
  idealExpressionLabel: "",
  weight: 0,
}

const emptyPersonalityProfile: PersonalityProfileForm = {
  traitDefId: "",
  naturalMin: 0,
  naturalMax: 0,
  baseline: 0,
}

function BreedsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const [editing, setEditing] = useState<BreedForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(true)
  const [editingStatProfileId, setEditingStatProfileId] = useState<string | null>(null)
  const [editingStatProfile, setEditingStatProfile] = useState<StatProfileForm | null>(null)
  const [newStatProfile, setNewStatProfile] = useState<StatProfileForm>({ ...emptyStatProfile })
  const [editingConformId, setEditingConformId] = useState<string | null>(null)
  const [editingConform, setEditingConform] = useState<ConformForm | null>(null)
  const [newConform, setNewConform] = useState<ConformForm>({ ...emptyConform })
  const [editingPersonalityProfileId, setEditingPersonalityProfileId] = useState<string | null>(null)
  const [editingPersonalityProfile, setEditingPersonalityProfile] = useState<PersonalityProfileForm | null>(null)
  const [newPersonalityProfile, setNewPersonalityProfile] = useState<PersonalityProfileForm>({ ...emptyPersonalityProfile })

  const { data: breeds } = trpc.admin.breed.list.useQuery(
    { gameId: gameId! }, { enabled: !!gameId }
  )
  const { data: species } = trpc.admin.species.list.useQuery(
    { gameId: gameId! }, { enabled: !!gameId }
  )
  const { data: stats } = trpc.admin.stat.list.useQuery(
    { gameId: gameId! }, { enabled: !!gameId }
  )
  const { data: loci } = trpc.admin.breed.listLoci.useQuery(
    { gameId: gameId! }, { enabled: !!gameId }
  )
  const { data: personalityTraits } = trpc.admin.personality.list.useQuery(
    { gameId: gameId! }, { enabled: !!gameId }
  )
  const { data: statProfiles } = trpc.admin.breed.listStatProfiles.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )
  const { data: conformStandards } = trpc.admin.breed.listConformationStandards.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )
  const { data: personalityProfiles } = trpc.admin.breed.listPersonalityProfiles.useQuery(
    { breedId: editing?.id! }, { enabled: !!editing?.id }
  )

  const utils = trpc.useUtils()

  const saveBreed = trpc.admin.breed.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.breed.list.invalidate()
      setEditing((prev) => prev ? { ...prev, id: saved.id } : null)
      setFormExpanded(false)
    },
  })
  const removeBreed = trpc.admin.breed.remove.useMutation({
    onSuccess: () => utils.admin.breed.list.invalidate(),
  })
  const saveStatProfile = trpc.admin.breed.saveStatProfile.useMutation({
    onSuccess: () => {
      utils.admin.breed.listStatProfiles.invalidate()
      setEditingStatProfileId(null)
      setEditingStatProfile(null)
      setNewStatProfile({ ...emptyStatProfile })
    },
  })
  const removeStatProfile = trpc.admin.breed.removeStatProfile.useMutation({
    onSuccess: () => utils.admin.breed.listStatProfiles.invalidate(),
  })
  const saveConform = trpc.admin.breed.saveConformationStandard.useMutation({
    onSuccess: () => {
      utils.admin.breed.listConformationStandards.invalidate()
      setEditingConformId(null)
      setEditingConform(null)
      setNewConform({ ...emptyConform })
    },
  })
  const removeConform = trpc.admin.breed.removeConformationStandard.useMutation({
    onSuccess: () => utils.admin.breed.listConformationStandards.invalidate(),
  })
  const savePersonalityProfile = trpc.admin.breed.savePersonalityProfile.useMutation({
    onSuccess: () => {
      utils.admin.breed.listPersonalityProfiles.invalidate()
      setEditingPersonalityProfileId(null)
      setEditingPersonalityProfile(null)
      setNewPersonalityProfile({ ...emptyPersonalityProfile })
    },
  })
  const removePersonalityProfile = trpc.admin.breed.removePersonalityProfile.useMutation({
    onSuccess: () => utils.admin.breed.listPersonalityProfiles.invalidate(),
  })

  function openEdit(breed: BreedForm) {
    setEditing(breed)
    setFormExpanded(true)
  }

  function handleSaveBreed() {
    if (!editing || !gameId) return
    saveBreed.mutate({
      id: editing.id,
      gameId,
      name: editing.name,
      speciesId: editing.speciesId,
      categoryBadge: editing.categoryBadge,
      image: editing.image || null,
      lore: editing.lore || null,
      isUnregistered: editing.isUnregistered,
      convergenceGenerations: editing.convergenceGenerations
        ? parseInt(editing.convergenceGenerations)
        : null,
    })
  }

  function handleRemoveBreed(id: string) {
    if (!confirm("Delete this breed? This cannot be undone.")) return
    removeBreed.mutate({ id })
  }

  function handleSaveStatProfile(id?: string) {
    const form = id ? editingStatProfile : newStatProfile
    if (!form || !editing?.id || !form.statDefId) return
    saveStatProfile.mutate({ id, breedId: editing.id, ...form })
  }

  function handleRemoveStatProfile(id: string) {
    if (!confirm("Remove this stat from the breed profile?")) return
    removeStatProfile.mutate({ id })
  }

  function handleSaveConform(id?: string) {
    const form = id ? editingConform : newConform
    if (!form || !editing?.id || !form.locusId) return
    saveConform.mutate({ id, breedId: editing.id, ...form })
  }

  function handleRemoveConform(id: string) {
    if (!confirm("Remove this conformation standard?")) return
    removeConform.mutate({ id })
  }

  function handleSavePersonalityProfile(id?: string) {
    const form = id ? editingPersonalityProfile : newPersonalityProfile
    if (!form || !editing?.id || !form.traitDefId) return
    savePersonalityProfile.mutate({ id, breedId: editing.id, ...form })
  }

  function handleRemovePersonalityProfile(id: string) {
    if (!confirm("Remove this personality profile entry?")) return
    removePersonalityProfile.mutate({ id })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (!editing) {
    return (
      <div className="p-6 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Breeds</h1>
          <Button size="sm" onClick={() => { setEditing({ ...emptyBreed }); setFormExpanded(true) }}>Add Breed</Button>
        </div>
        {removeBreed.error && (
          <p className="text-sm text-destructive">{removeBreed.error.message}</p>
        )}

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Species</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unregistered</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {breeds?.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{b.species.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{b.categoryBadge}</td>
                  <td className="px-4 py-2 text-center">
                    {b.isUnregistered ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit({
                      id: b.id,
                      name: b.name,
                      speciesId: b.speciesId,
                      categoryBadge: b.categoryBadge,
                      image: b.image ?? "",
                      lore: b.lore ?? "",
                      isUnregistered: b.isUnregistered,
                      convergenceGenerations: b.convergenceGenerations?.toString() ?? "",
                    })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveBreed(b.id)} className="text-destructive hover:text-destructive">Delete</Button>
                  </td>
                </tr>
              ))}
              {breeds?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No breeds defined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        {editing.id ? "Edit Breed" : "Add Breed"}
      </h1>

      {/* Breed Details */}
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-secondary/40 px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Breed Details</h2>
          {!formExpanded && (
            <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>Edit Details</Button>
          )}
        </header>

        {formExpanded ? (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input value={editing.name} onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Species</label>
                <select
                  value={editing.speciesId}
                  onChange={(e) => setEditing((p) => p && { ...p, speciesId: e.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select species…</option>
                  {species?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</label>
                <select
                  value={editing.categoryBadge}
                  onChange={(e) => setEditing((p) => p && { ...p, categoryBadge: e.target.value as BreedForm["categoryBadge"] })}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="BASE">Base</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Convergence Generations</label>
                <p className="text-[11px] text-muted-foreground">Generations to breed pure. Leave blank if not applicable.</p>
                <Input
                  type="number"
                  min="1"
                  value={editing.convergenceGenerations}
                  onChange={(e) => setEditing((p) => p && { ...p, convergenceGenerations: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Image URL</label>
              <Input value={editing.image} onChange={(e) => setEditing((p) => p && { ...p, image: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lore</label>
              <textarea
                value={editing.lore}
                onChange={(e) => setEditing((p) => p && { ...p, lore: e.target.value })}
                rows={4}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isUnregistered}
                onChange={(e) => setEditing((p) => p && { ...p, isUnregistered: e.target.checked })}
              />
              Unregistered
            </label>
            {saveBreed.error && <p className="text-sm text-destructive">{saveBreed.error.message}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSaveBreed} disabled={saveBreed.isPending}>
                {saveBreed.isPending ? "Saving…" : editing.id ? "Save Breed" : "Create Breed"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
                <span className="text-sm font-medium text-foreground">{editing.name}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Species</span>
                <span className="text-sm font-medium text-foreground">{species?.find((s) => s.id === editing.speciesId)?.name ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</span>
                <span className="text-sm font-medium text-foreground">{editing.categoryBadge}</span>
              </div>
              {editing.convergenceGenerations && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Convergence Gens</span>
                  <span className="text-sm font-medium text-foreground">{editing.convergenceGenerations}</span>
                </div>
              )}
              {editing.isUnregistered && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unregistered</span>
                  <span className="text-sm font-medium text-foreground">Yes</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(null)}>← Back to list</Button>
          </div>
        )}
      </section>

      {/* Stat Profile */}
      {editing.id && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Stat Profile</h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Natural Min</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Natural Max</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baseline</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statProfiles?.map((sp) => (
                <tr key={sp.id} className="border-b border-border last:border-0">
                  {editingStatProfileId === sp.id && editingStatProfile ? (
                    <>
                      <td className="px-3 py-2">
                        <select
                          value={editingStatProfile.statDefId}
                          onChange={(e) => setEditingStatProfile((p) => p && { ...p, statDefId: e.target.value })}
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                        >
                          {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingStatProfile.weight} onChange={(e) => setEditingStatProfile((p) => p && { ...p, weight: parseFloat(e.target.value) })} /></td>
                      <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingStatProfile.naturalMin} onChange={(e) => setEditingStatProfile((p) => p && { ...p, naturalMin: parseFloat(e.target.value) })} /></td>
                      <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingStatProfile.naturalMax} onChange={(e) => setEditingStatProfile((p) => p && { ...p, naturalMax: parseFloat(e.target.value) })} /></td>
                      <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingStatProfile.baseline} onChange={(e) => setEditingStatProfile((p) => p && { ...p, baseline: parseFloat(e.target.value) })} /></td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <Button size="sm" onClick={() => handleSaveStatProfile(sp.id)} disabled={saveStatProfile.isPending}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingStatProfileId(null); setEditingStatProfile(null) }}>Cancel</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-medium text-foreground">{sp.statDef.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sp.weight}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sp.naturalMin}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sp.naturalMax}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sp.baseline}</td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingStatProfileId(sp.id)
                          setEditingStatProfile({ id: sp.id, statDefId: sp.statDefId, weight: sp.weight, naturalMin: sp.naturalMin, naturalMax: sp.naturalMax, baseline: sp.baseline })
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveStatProfile(sp.id)} className="text-destructive hover:text-destructive">Delete</Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2">
                  <select
                    value={newStatProfile.statDefId}
                    onChange={(e) => setNewStatProfile((p) => ({ ...p, statDefId: e.target.value }))}
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Select stat…</option>
                    {stats?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newStatProfile.weight} onChange={(e) => setNewStatProfile((p) => ({ ...p, weight: parseFloat(e.target.value) }))} /></td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newStatProfile.naturalMin} onChange={(e) => setNewStatProfile((p) => ({ ...p, naturalMin: parseFloat(e.target.value) }))} /></td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newStatProfile.naturalMax} onChange={(e) => setNewStatProfile((p) => ({ ...p, naturalMax: parseFloat(e.target.value) }))} /></td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newStatProfile.baseline} onChange={(e) => setNewStatProfile((p) => ({ ...p, baseline: parseFloat(e.target.value) }))} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" onClick={() => handleSaveStatProfile()} disabled={!newStatProfile.statDefId || saveStatProfile.isPending}>Add</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Conformation Standards */}
      {editing.id && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Conformation Standard</h2>
          </header>
          {!loci?.length ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Configure loci in the Genetics section before adding conformation standards.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locus</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ideal Expression Label</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {conformStandards?.map((cs) => (
                  <tr key={cs.id} className="border-b border-border last:border-0">
                    {editingConformId === cs.id && editingConform ? (
                      <>
                        <td className="px-3 py-2">
                          <select
                            value={editingConform.locusId}
                            onChange={(e) => setEditingConform((p) => p && { ...p, locusId: e.target.value })}
                            className="h-7 rounded border border-input bg-background px-2 text-xs"
                          >
                            {loci.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><Input className="h-7 text-xs" value={editingConform.idealExpressionLabel} onChange={(e) => setEditingConform((p) => p && { ...p, idealExpressionLabel: e.target.value })} /></td>
                        <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingConform.weight} onChange={(e) => setEditingConform((p) => p && { ...p, weight: parseFloat(e.target.value) })} /></td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <Button size="sm" onClick={() => handleSaveConform(cs.id)} disabled={saveConform.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingConformId(null); setEditingConform(null) }}>Cancel</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground">{cs.locus.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{cs.idealExpressionLabel}</td>
                        <td className="px-3 py-2 text-muted-foreground">{cs.weight}</td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingConformId(cs.id)
                            setEditingConform({ id: cs.id, locusId: cs.locusId, idealExpressionLabel: cs.idealExpressionLabel, weight: cs.weight })
                          }}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRemoveConform(cs.id)} className="text-destructive hover:text-destructive">Delete</Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2">
                    <select
                      value={newConform.locusId}
                      onChange={(e) => setNewConform((p) => ({ ...p, locusId: e.target.value }))}
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">Select locus…</option>
                      {loci.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><Input className="h-7 text-xs" value={newConform.idealExpressionLabel} onChange={(e) => setNewConform((p) => ({ ...p, idealExpressionLabel: e.target.value }))} /></td>
                  <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newConform.weight} onChange={(e) => setNewConform((p) => ({ ...p, weight: parseFloat(e.target.value) }))} /></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" onClick={() => handleSaveConform()} disabled={!newConform.locusId || saveConform.isPending}>Add</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      )}
      {/* Personality Profiles */}
      {editing.id && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Personality Profile</h2>
          </header>
          {!personalityTraits?.length ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Configure personality traits in the Animals section before adding a personality profile.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trait</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Natural Min</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Natural Max</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baseline</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {personalityProfiles?.map((pp: NonNullable<typeof personalityProfiles>[number]) => (
                  <tr key={pp.id} className="border-b border-border last:border-0">
                    {editingPersonalityProfileId === pp.id && editingPersonalityProfile ? (
                      <>
                        <td className="px-3 py-2">
                          <select
                            value={editingPersonalityProfile.traitDefId}
                            onChange={(e) => setEditingPersonalityProfile((p) => p && { ...p, traitDefId: e.target.value })}
                            className="h-7 rounded border border-input bg-background px-2 text-xs"
                          >
                            {personalityTraits?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingPersonalityProfile.naturalMin} onChange={(e) => setEditingPersonalityProfile((p) => p && { ...p, naturalMin: parseFloat(e.target.value) })} /></td>
                        <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingPersonalityProfile.naturalMax} onChange={(e) => setEditingPersonalityProfile((p) => p && { ...p, naturalMax: parseFloat(e.target.value) })} /></td>
                        <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={editingPersonalityProfile.baseline} onChange={(e) => setEditingPersonalityProfile((p) => p && { ...p, baseline: parseFloat(e.target.value) })} /></td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <Button size="sm" onClick={() => handleSavePersonalityProfile(pp.id)} disabled={savePersonalityProfile.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingPersonalityProfileId(null); setEditingPersonalityProfile(null) }}>Cancel</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground">{pp.traitDef.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{pp.naturalMin}</td>
                        <td className="px-3 py-2 text-muted-foreground">{pp.naturalMax}</td>
                        <td className="px-3 py-2 text-muted-foreground">{pp.baseline}</td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingPersonalityProfileId(pp.id)
                            setEditingPersonalityProfile({ id: pp.id, traitDefId: pp.traitDefId, naturalMin: pp.naturalMin, naturalMax: pp.naturalMax, baseline: pp.baseline })
                          }}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRemovePersonalityProfile(pp.id)} className="text-destructive hover:text-destructive">Delete</Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2">
                    <select
                      value={newPersonalityProfile.traitDefId}
                      onChange={(e) => setNewPersonalityProfile((p) => ({ ...p, traitDefId: e.target.value }))}
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">Select trait…</option>
                      {personalityTraits?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newPersonalityProfile.naturalMin} onChange={(e) => setNewPersonalityProfile((p) => ({ ...p, naturalMin: parseFloat(e.target.value) }))} /></td>
                  <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newPersonalityProfile.naturalMax} onChange={(e) => setNewPersonalityProfile((p) => ({ ...p, naturalMax: parseFloat(e.target.value) }))} /></td>
                  <td className="px-3 py-2"><Input className="h-7 text-xs" type="number" step="0.01" value={newPersonalityProfile.baseline} onChange={(e) => setNewPersonalityProfile((p) => ({ ...p, baseline: parseFloat(e.target.value) }))} /></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" onClick={() => handleSavePersonalityProfile()} disabled={!newPersonalityProfile.traitDefId || savePersonalityProfile.isPending}>Add</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/breeds")({
  component: BreedsPage,
})
