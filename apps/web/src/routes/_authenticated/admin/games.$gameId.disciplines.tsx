import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, useEffect, Fragment } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type DisciplineForm = { id?: string; name: string; description: string; isConformation: boolean; minLifeStageIndex: string; maxLifeStageIndex: string }
const emptyDiscipline = (): DisciplineForm => ({ name: "", description: "", isConformation: false, minLifeStageIndex: "", maxLifeStageIndex: "" })

// ─── StatWeightRow ────────────────────────────────────────────────────────────

function StatWeightRow({
  stat, existing, disciplineId,
}: {
  stat: { id: string; name: string }
  existing?: { id: string; weight: number }
  disciplineId: string
}) {
  const [value, setValue] = useState(existing?.weight?.toString() ?? "")
  const utils = trpc.useUtils()

  const saveStatWeight = trpc.admin.discipline.saveStatWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listStatWeights.invalidate({ disciplineDefId: disciplineId })
      utils.admin.discipline.list.invalidate()
    },
  })
  const removeStatWeight = trpc.admin.discipline.removeStatWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listStatWeights.invalidate({ disciplineDefId: disciplineId })
      utils.admin.discipline.list.invalidate()
    },
  })

  useEffect(() => {
    setValue(existing?.weight?.toString() ?? "")
  }, [existing?.weight])

  function handleBlur() {
    const parsed = parseFloat(value)
    if (value.trim() !== "" && !isNaN(parsed) && parsed > 0) {
      saveStatWeight.mutate({ id: existing?.id, disciplineDefId: disciplineId, statDefId: stat.id, weight: parsed })
    } else if ((value.trim() === "" || isNaN(parsed) || parsed === 0) && existing?.id) {
      removeStatWeight.mutate({ id: existing.id })
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 text-foreground">{stat.name}</td>
      <td className="px-3 py-2">
        <Input
          type="number" step="0.01" min="0" value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          className={`h-7 text-sm w-28 ${existing?.weight ? "" : "text-muted-foreground"}`}
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
        {saveStatWeight.isPending || removeStatWeight.isPending ? "saving…" : ""}
      </td>
    </tr>
  )
}

// ─── TiersTab ────────────────────────────────────────────────────────────────

type TierForm = {
  name: string; tierIndex: string; minConditionScore: string; advancementThreshold: string
  energyCost: string; entryFee: string; minWeeklyPoints: string
}
const emptyTier = (): TierForm => ({ name: "", tierIndex: "", minConditionScore: "", advancementThreshold: "", energyCost: "", entryFee: "", minWeeklyPoints: "" })

type PrizeForm = { currencyDefId: string; amount: string; placement: string }
const emptyPrize = (): PrizeForm => ({ currencyDefId: "", amount: "", placement: "" })

function TiersTab({ disciplineId, gameId }: { disciplineId: string; gameId: string }) {
  const utils = trpc.useUtils()
  const { data: tiers } = trpc.admin.competitionTier.list.useQuery({ disciplineDefId: disciplineId })
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId }, {})
  const [expandedTierId, setExpandedTierId] = useState<string | null>(null)
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [editingTier, setEditingTier] = useState<TierForm | null>(null)
  const [newPrize, setNewPrize] = useState<PrizeForm>(emptyPrize())
  const [editingPrizeId, setEditingPrizeId] = useState<string | null>(null)
  const [editingPrize, setEditingPrize] = useState<PrizeForm | null>(null)

  const { data: prizes } = trpc.admin.competitionTier.listPrizes.useQuery(
    { competitionTierDefId: expandedTierId! },
    { enabled: !!expandedTierId }
  )

  const saveTier = trpc.admin.competitionTier.save.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: disciplineId })
      setEditingTierId(null); setEditingTier(null)
    },
  })
  const removeTier = trpc.admin.competitionTier.remove.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: disciplineId })
      setExpandedTierId(null); setEditingTierId(null); setEditingTier(null)
    },
  })
  const savePrize = trpc.admin.competitionTier.savePrize.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.listPrizes.invalidate({ competitionTierDefId: expandedTierId! })
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: disciplineId })
      setEditingPrizeId(null); setEditingPrize(null); setNewPrize(emptyPrize())
    },
  })
  const removePrize = trpc.admin.competitionTier.removePrize.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.listPrizes.invalidate({ competitionTierDefId: expandedTierId! })
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: disciplineId })
    },
  })

  function submitTier() {
    if (!editingTier || !editingTier.name.trim()) return
    saveTier.mutate({
      id: editingTierId ?? undefined,
      disciplineDefId: disciplineId,
      name: editingTier.name.trim(),
      tierIndex: parseInt(editingTier.tierIndex) || 0,
      minConditionScore: editingTier.minConditionScore ? parseFloat(editingTier.minConditionScore) : null,
      advancementThreshold: editingTier.advancementThreshold ? parseFloat(editingTier.advancementThreshold) : null,
      energyCost: editingTier.energyCost ? parseInt(editingTier.energyCost) : null,
      entryFee: editingTier.entryFee ? parseFloat(editingTier.entryFee) : null,
      minWeeklyPoints: editingTier.minWeeklyPoints ? parseInt(editingTier.minWeeklyPoints) : null,
    })
  }

  function submitPrize(id?: string) {
    const form = id ? editingPrize : newPrize
    if (!form || !expandedTierId || !form.currencyDefId || !form.amount) return
    savePrize.mutate({
      id,
      competitionTierDefId: expandedTierId,
      currencyDefId: form.currencyDefId,
      amount: parseFloat(form.amount),
      placement: form.placement ? parseInt(form.placement) : null,
    })
  }

  return (
    <div className={editingTier !== null ? "grid grid-cols-[280px_1fr] divide-x divide-border" : ""}>
      {/* Tier form */}
      {editingTier !== null && (
        <div className="p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {editingTierId ? "Edit Tier" : "Add Tier"}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
            <Input className="h-8 text-sm" value={editingTier.name} onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })} placeholder="e.g. Beginner" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tier Index</label>
              <Input className="h-8 text-sm" type="number" min="0" value={editingTier.tierIndex} onChange={(e) => setEditingTier({ ...editingTier, tierIndex: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Condition Score</label>
              <Input className="h-8 text-sm" type="number" step="0.1" value={editingTier.minConditionScore} onChange={(e) => setEditingTier({ ...editingTier, minConditionScore: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Advancement Threshold</label>
              <Input className="h-8 text-sm" type="number" step="0.1" value={editingTier.advancementThreshold} onChange={(e) => setEditingTier({ ...editingTier, advancementThreshold: e.target.value })} placeholder="optional" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Cost</label>
              <Input className="h-8 text-sm" type="number" min="0" value={editingTier.energyCost} onChange={(e) => setEditingTier({ ...editingTier, energyCost: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Entry Fee</label>
              <Input className="h-8 text-sm" type="number" step="0.01" min="0" value={editingTier.entryFee} onChange={(e) => setEditingTier({ ...editingTier, entryFee: e.target.value })} placeholder="optional" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Weekly Points</label>
              <Input className="h-8 text-sm" type="number" min="0" value={editingTier.minWeeklyPoints} onChange={(e) => setEditingTier({ ...editingTier, minWeeklyPoints: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={submitTier} disabled={saveTier.isPending || !editingTier.name.trim()}>
              {editingTierId ? "Save" : "Add Tier"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditingTierId(null); setEditingTier(null) }}>Cancel</Button>
          </div>
          {saveTier.error && <p className="text-sm text-destructive">{saveTier.error.message}</p>}
        </div>
      )}

      {/* Tier table */}
      <div>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Competition Tiers</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditingTier(emptyTier()); setEditingTierId(null) }}>+ Add</Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Cond. Score</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Adv.</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Energy</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fee</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prizes</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tiers?.map((t: NonNullable<typeof tiers>[number]) => (
              <Fragment key={t.id}>
                <tr className={`border-b border-border ${expandedTierId === t.id ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-2 text-muted-foreground">{t.tierIndex}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.minConditionScore ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.advancementThreshold ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.energyCost ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.entryFee ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <Button size="sm" variant="ghost" className="text-xs h-6 px-2"
                      onClick={() => {
                        setExpandedTierId(expandedTierId === t.id ? null : t.id)
                        setEditingPrizeId(null); setEditingPrize(null); setNewPrize(emptyPrize())
                      }}>
                      {t._count?.prizes ?? 0} {expandedTierId === t.id ? "▲" : "▼"}
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingTierId(t.id)
                      setEditingTier({ name: t.name, tierIndex: t.tierIndex.toString(), minConditionScore: t.minConditionScore?.toString() ?? "", advancementThreshold: t.advancementThreshold?.toString() ?? "", energyCost: t.energyCost?.toString() ?? "", entryFee: t.entryFee?.toString() ?? "", minWeeklyPoints: t.minWeeklyPoints?.toString() ?? "" })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this tier?")) return; removeTier.mutate({ id: t.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
                {expandedTierId === t.id && (
                  <tr className="border-b border-border bg-muted/10">
                    <td colSpan={8} className="px-6 py-3">
                      {!currencies?.length ? (
                        <p className="text-sm text-muted-foreground">No currencies configured. Set up Currencies first.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Placement</th>
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</th>
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prizes?.map((p: NonNullable<typeof prizes>[number]) =>
                              editingPrizeId === p.id ? (
                                <tr key={p.id} className="border-b border-border last:border-0">
                                  <td className="py-1.5 pr-3">
                                    <Input type="number" min="1" value={editingPrize?.placement ?? ""} onChange={(e) => setEditingPrize(prev => prev ? { ...prev, placement: e.target.value } : null)} className="h-7 text-sm w-16" placeholder="1" />
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <select value={editingPrize?.currencyDefId ?? ""} onChange={(e) => setEditingPrize(prev => prev ? { ...prev, currencyDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                      {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <Input type="number" step="0.01" min="0" value={editingPrize?.amount ?? ""} onChange={(e) => setEditingPrize(prev => prev ? { ...prev, amount: e.target.value } : null)} className="h-7 text-sm w-24" />
                                  </td>
                                  <td className="py-1.5 text-right space-x-2">
                                    <Button size="sm" onClick={() => submitPrize(p.id)} disabled={savePrize.isPending}>Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingPrizeId(null); setEditingPrize(null) }}>Cancel</Button>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={p.id} className="border-b border-border last:border-0">
                                  <td className="py-1.5 pr-3 text-muted-foreground">{p.placement ?? "Any"}</td>
                                  <td className="py-1.5 pr-3 text-foreground">{p.currencyDef.name}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{p.amount}</td>
                                  <td className="py-1.5 text-right space-x-2">
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingPrizeId(p.id); setEditingPrize({ currencyDefId: p.currencyDefId, amount: p.amount.toString(), placement: p.placement?.toString() ?? "" }) }}>Edit</Button>
                                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removePrize.mutate({ id: p.id })}>Delete</Button>
                                  </td>
                                </tr>
                              )
                            )}
                            <tr>
                              <td className="py-1.5 pr-3">
                                <Input type="number" min="1" value={newPrize.placement} onChange={(e) => setNewPrize({ ...newPrize, placement: e.target.value })} className="h-7 text-sm w-16" placeholder="1" />
                              </td>
                              <td className="py-1.5 pr-3">
                                <select value={newPrize.currencyDefId} onChange={(e) => setNewPrize({ ...newPrize, currencyDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                  <option value="">Select…</option>
                                  {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 pr-3">
                                <Input type="number" step="0.01" min="0" value={newPrize.amount} onChange={(e) => setNewPrize({ ...newPrize, amount: e.target.value })} className="h-7 text-sm w-24" placeholder="0" />
                              </td>
                              <td className="py-1.5 text-right">
                                <Button size="sm" onClick={() => submitPrize()} disabled={!newPrize.currencyDefId || !newPrize.amount || savePrize.isPending}>Add</Button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {tiers?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">No tiers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── DisciplinesPage ─────────────────────────────────────────────────────────

function DisciplinesPage() {
  const { gameId } = Route.useParams()

  const { data: disciplines } = trpc.admin.discipline.list.useQuery({ gameId: gameId! }, {})
  const { data: stats } = trpc.admin.stat.list.useQuery({ gameId: gameId! }, {})
  const { data: traits } = trpc.admin.personality.list.useQuery({ gameId: gameId! }, {})
  const { data: items } = trpc.admin.item.list.useQuery({ gameId: gameId! }, {})

  const utils = trpc.useUtils()

  const saveDiscipline = trpc.admin.discipline.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.discipline.list.invalidate()
      setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
    },
  })
  const removeDiscipline = trpc.admin.discipline.remove.useMutation({
    onSuccess: () => {
      utils.admin.discipline.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<DisciplineForm | null>(null)
  const [activeTab, setActiveTab] = useState<"stats" | "personality" | "equipment" | "tiers">("stats")

  const { data: statWeights } = trpc.admin.discipline.listStatWeights.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const { data: personalityWeights } = trpc.admin.discipline.listPersonalityWeights.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const { data: equipmentRequirements } = trpc.admin.discipline.listEquipmentRequirements.useQuery(
    { disciplineDefId: editing?.id! },
    { enabled: !!editing?.id }
  )

  const savePersonalityWeight = trpc.admin.discipline.savePersonalityWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listPersonalityWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
      setNewPersonalityWeight({ traitDefId: "", idealMin: "", idealMax: "", bonusPercent: "" })
      setEditingPersonalityWeightId(null)
      setEditingPersonalityWeight({ idealMin: "", idealMax: "", bonusPercent: "" })
    },
  })
  const removePersonalityWeight = trpc.admin.discipline.removePersonalityWeight.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listPersonalityWeights.invalidate({ disciplineDefId: editing?.id })
      utils.admin.discipline.list.invalidate()
    },
  })
  const saveEquipReq = trpc.admin.discipline.saveEquipmentRequirement.useMutation({
    onSuccess: () => {
      utils.admin.discipline.listEquipmentRequirements.invalidate({ disciplineDefId: editing?.id })
      setNewEquipReq({ itemDefId: "", quantity: "1" })
    },
  })
  const removeEquipReq = trpc.admin.discipline.removeEquipmentRequirement.useMutation({
    onSuccess: () => utils.admin.discipline.listEquipmentRequirements.invalidate({ disciplineDefId: editing?.id }),
  })

  const [editingPersonalityWeightId, setEditingPersonalityWeightId] = useState<string | null>(null)
  const [editingPersonalityWeight, setEditingPersonalityWeight] = useState({ idealMin: "", idealMax: "", bonusPercent: "" })
  const [newPersonalityWeight, setNewPersonalityWeight] = useState({ traitDefId: "", idealMin: "", idealMax: "", bonusPercent: "" })
  const [newEquipReq, setNewEquipReq] = useState({ itemDefId: "", quantity: "1" })

  const usedTraitIds = new Set(personalityWeights?.map((w) => w.traitDefId) ?? [])
  const availableTraits = traits?.filter((t) => !usedTraitIds.has(t.id)) ?? []

  function openEdit(d: NonNullable<typeof disciplines>[number]) {
    setEditing({ id: d.id, name: d.name, description: d.description ?? "", isConformation: d.isConformation, minLifeStageIndex: d.minLifeStageIndex?.toString() ?? "", maxLifeStageIndex: d.maxLifeStageIndex?.toString() ?? "" })
    setActiveTab("stats")
    setEditingPersonalityWeightId(null); setEditingPersonalityWeight({ idealMin: "", idealMax: "", bonusPercent: "" })
    setNewPersonalityWeight({ traitDefId: "", idealMin: "", idealMax: "", bonusPercent: "" })
    setNewEquipReq({ itemDefId: "", quantity: "1" })
  }

  function submitDiscipline() {
    if (!editing || !gameId || !editing.name.trim()) return
    saveDiscipline.mutate({
      ...editing,
      gameId,
      description: editing.description || null,
      minLifeStageIndex: editing.minLifeStageIndex !== "" ? parseInt(editing.minLifeStageIndex) : null,
      maxLifeStageIndex: editing.maxLifeStageIndex !== "" ? parseInt(editing.maxLifeStageIndex) : null,
    })
  }

  function submitEditPersonalityWeight(id: string) {
    if (!editing?.id || !editingPersonalityWeight.idealMin || !editingPersonalityWeight.idealMax || !editingPersonalityWeight.bonusPercent) return
    const existing = personalityWeights?.find((w) => w.id === id)
    if (!existing) return
    savePersonalityWeight.mutate({
      id,
      disciplineDefId: editing.id,
      traitDefId: existing.traitDefId,
      idealMin: parseFloat(editingPersonalityWeight.idealMin),
      idealMax: parseFloat(editingPersonalityWeight.idealMax),
      bonusPercent: parseFloat(editingPersonalityWeight.bonusPercent),
    })
  }

  if (editing !== null) {
    return (
      <div className="p-4 flex flex-col gap-3 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Discipline"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2">
          <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Discipline Details</h2>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Dressage, Sprint Racing" className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description <span className="font-normal">(optional)</span></label>
                  <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="h-8 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={editing.isConformation} onChange={(e) => setEditing({ ...editing, isConformation: e.target.checked })} className="h-4 w-4 rounded border border-input accent-primary" />
                  Conformation discipline
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Life Stage Index <span className="font-normal">(optional)</span></label>
                    <Input value={editing.minLifeStageIndex} onChange={(e) => setEditing({ ...editing, minLifeStageIndex: e.target.value })} type="number" min="0" step="1" className="h-8 text-sm" placeholder="—" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Max Life Stage Index <span className="font-normal">(optional)</span></label>
                    <Input value={editing.maxLifeStageIndex} onChange={(e) => setEditing({ ...editing, maxLifeStageIndex: e.target.value })} type="number" min="0" step="1" className="h-8 text-sm" placeholder="—" />
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Button onClick={submitDiscipline} disabled={saveDiscipline.isPending || !editing.name.trim()}>Save</Button>
                  {saveDiscipline.error && <p className="text-sm text-destructive">{saveDiscipline.error.message}</p>}
                  {editing.id && (
                    <>
                      {removeDiscipline.error && <p className="text-sm text-destructive">{removeDiscipline.error.message}</p>}
                      <Button variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (!confirm("Delete this discipline? This will remove all its tiers and scoring weights.")) return
                          removeDiscipline.mutate({ id: editing.id! })
                        }}
                        disabled={removeDiscipline.isPending}>
                        Delete Discipline
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {editing.id && (
              <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                <div className="border-b border-border bg-secondary/40 px-3 py-2 flex items-center gap-4">
                  {(["stats", "personality", "equipment", "tiers"] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`text-[10px] font-bold uppercase tracking-wider pb-0.5 border-b-2 transition-colors ${
                        activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}>
                      {tab === "stats" ? "Stats" : tab === "personality" ? "Personality" : tab === "equipment" ? "Equipment" : "Tiers"}
                    </button>
                  ))}
                </div>

                {/* Stats tab — pre-populated rows for every stat */}
                {activeTab === "stats" && (() => {
                  const weightTotal = statWeights?.reduce((sum, w) => sum + w.weight, 0) ?? 0
                  const weightSumOff = (statWeights?.length ?? 0) > 0 && Math.abs(weightTotal - 1) > 0.01
                  return (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weight</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats?.map((s) => (
                            <StatWeightRow
                              key={s.id}
                              stat={s}
                              existing={statWeights?.find((w) => w.statDefId === s.id)}
                              disciplineId={editing.id!}
                            />
                          ))}
                          {!stats?.length && (
                            <tr>
                              <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">No stats defined. Add stats in the Stats section first.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {weightSumOff && (
                        <p className="px-3 py-2 text-sm text-amber-600 dark:text-amber-400 border-t border-border">
                          Weights sum to {weightTotal.toFixed(2)} — they should sum to 1.00 for scores to stay within 0–100.
                        </p>
                      )}
                    </>
                  )
                })()}

                {/* Personality tab */}
                {activeTab === "personality" && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trait</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ideal Min</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ideal Max</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bonus %</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personalityWeights?.map((w) =>
                          editingPersonalityWeightId === w.id ? (
                            <tr key={w.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 text-foreground">{w.traitDef.name}</td>
                              <td className="px-3 py-2">
                                <Input type="number" step="1" min="0" max="100" value={editingPersonalityWeight.idealMin} onChange={(e) => setEditingPersonalityWeight({ ...editingPersonalityWeight, idealMin: e.target.value })} className="h-7 text-sm w-20" />
                              </td>
                              <td className="px-3 py-2">
                                <Input type="number" step="1" min="0" max="100" value={editingPersonalityWeight.idealMax} onChange={(e) => setEditingPersonalityWeight({ ...editingPersonalityWeight, idealMax: e.target.value })} className="h-7 text-sm w-20" />
                              </td>
                              <td className="px-3 py-2">
                                <Input type="number" step="0.1" value={editingPersonalityWeight.bonusPercent} onChange={(e) => setEditingPersonalityWeight({ ...editingPersonalityWeight, bonusPercent: e.target.value })} className="h-7 text-sm w-20" />
                              </td>
                              <td className="px-3 py-2 text-right space-x-2">
                                <Button size="sm" onClick={() => submitEditPersonalityWeight(w.id)} disabled={savePersonalityWeight.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingPersonalityWeightId(null); setEditingPersonalityWeight({ idealMin: "", idealMax: "", bonusPercent: "" }) }}>Cancel</Button>
                              </td>
                            </tr>
                          ) : (
                            <tr key={w.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-medium text-foreground">{w.traitDef.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{w.idealMin}</td>
                              <td className="px-3 py-2 text-muted-foreground">{w.idealMax}</td>
                              <td className="px-3 py-2 text-muted-foreground">{w.bonusPercent}%</td>
                              <td className="px-3 py-2 text-right space-x-2">
                                <Button size="sm" variant="ghost" onClick={() => { setEditingPersonalityWeightId(w.id); setEditingPersonalityWeight({ idealMin: w.idealMin.toString(), idealMax: w.idealMax.toString(), bonusPercent: w.bonusPercent.toString() }) }}>Edit</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removePersonalityWeight.mutate({ id: w.id })}>Remove</Button>
                              </td>
                            </tr>
                          )
                        )}
                        <tr>
                          <td className="px-3 py-2">
                            <select value={newPersonalityWeight.traitDefId} onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, traitDefId: e.target.value })} className="h-8 rounded-md border border-input bg-background px-3 text-sm w-full">
                              <option value="">— Select trait —</option>
                              {availableTraits.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" step="1" min="0" max="100" value={newPersonalityWeight.idealMin} onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, idealMin: e.target.value })} placeholder="0" className="h-7 text-sm w-20" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" step="1" min="0" max="100" value={newPersonalityWeight.idealMax} onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, idealMax: e.target.value })} placeholder="100" className="h-7 text-sm w-20" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" step="0.1" value={newPersonalityWeight.bonusPercent} onChange={(e) => setNewPersonalityWeight({ ...newPersonalityWeight, bonusPercent: e.target.value })} placeholder="e.g. 5" className="h-7 text-sm w-20" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" onClick={() => {
                              if (!newPersonalityWeight.traitDefId || !newPersonalityWeight.idealMin || !newPersonalityWeight.idealMax || !newPersonalityWeight.bonusPercent || !editing?.id) return
                              savePersonalityWeight.mutate({
                                disciplineDefId: editing.id,
                                traitDefId: newPersonalityWeight.traitDefId,
                                idealMin: parseFloat(newPersonalityWeight.idealMin),
                                idealMax: parseFloat(newPersonalityWeight.idealMax),
                                bonusPercent: parseFloat(newPersonalityWeight.bonusPercent),
                              })
                            }} disabled={savePersonalityWeight.isPending || !newPersonalityWeight.traitDefId || !newPersonalityWeight.idealMin || !newPersonalityWeight.idealMax || !newPersonalityWeight.bonusPercent}>
                              Add
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {removePersonalityWeight.error && <p className="px-3 pb-3 text-sm text-destructive">{removePersonalityWeight.error.message}</p>}
                  </>
                )}

                {/* Equipment tab */}
                {activeTab === "equipment" && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentRequirements?.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-medium text-foreground">{r.itemDef.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.quantity}</td>
                            <td className="px-3 py-2 text-right">
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeEquipReq.mutate({ id: r.id })}>Remove</Button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-3 py-2">
                            <select value={newEquipReq.itemDefId} onChange={(e) => setNewEquipReq(r => ({ ...r, itemDefId: e.target.value }))} className="h-8 rounded-md border border-input bg-background px-3 text-sm w-full">
                              <option value="">— Select item —</option>
                              {items?.filter(i => !equipmentRequirements?.some(r => r.itemDef.id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" step="1" min="1" value={newEquipReq.quantity} onChange={(e) => setNewEquipReq(r => ({ ...r, quantity: e.target.value }))} placeholder="1" className="h-7 text-sm max-w-20" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" onClick={() => {
                              if (!editing?.id || !newEquipReq.itemDefId) return
                              saveEquipReq.mutate({ disciplineDefId: editing.id, itemDefId: newEquipReq.itemDefId, quantity: parseInt(newEquipReq.quantity) || 1 })
                            }} disabled={saveEquipReq.isPending || !newEquipReq.itemDefId}>
                              Add
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {saveEquipReq.error && <p className="px-3 pb-3 text-sm text-destructive">{saveEquipReq.error.message}</p>}
                    {removeEquipReq.error && <p className="px-3 pb-3 text-sm text-destructive">{removeEquipReq.error.message}</p>}
                  </>
                )}

                {/* Tiers tab */}
                {activeTab === "tiers" && (
                  <TiersTab disciplineId={editing.id} gameId={gameId!} />
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Disciplines</h1>
        <Button onClick={() => { setEditing(emptyDiscipline()); setActiveTab("stats") }}>+ New Discipline</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage Range</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stat Wts</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trait Wts</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {disciplines?.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.isConformation ? "Conformation" : "Sport"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.description ?? "—"}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {d.minLifeStageIndex !== null || d.maxLifeStageIndex !== null
                      ? `${d.minLifeStageIndex ?? "—"} – ${d.maxLifeStageIndex ?? "—"}`
                      : "All"}
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{d._count.statWeights}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{d._count.personalityWeights}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {disciplines?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No disciplines yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/disciplines")({
  component: DisciplinesPage,
})
