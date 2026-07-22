import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TierForm = {
  name: string
  tierIndex: string
  minScore: string
  advancementThreshold: string
  energyCost: string
  entryFee: string
  minWeeklyPoints: string
}
const emptyForm = (): TierForm => ({ name: "", tierIndex: "", minScore: "", advancementThreshold: "", energyCost: "0", entryFee: "0", minWeeklyPoints: "" })

function CompetitionTiersPage() {
  const { gameId } = Route.useParams()

  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const [selectedDisciplineId, setSelectedDisciplineId] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm | null>(null)
  const [prizeTierId, setPrizeTierId] = useState<string | null>(null)
  const [newPrize, setNewPrize] = useState({ placement: "", currencyDefId: "", amount: "", isInvitational: false })

  const { data: currencies } = trpc.admin.currency.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: prizes } = trpc.admin.competitionTier.listPrizes.useQuery(
    { tierDefId: prizeTierId! },
    { enabled: !!prizeTierId }
  )
  const savePrize = trpc.admin.competitionTier.savePrize.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.listPrizes.invalidate({ tierDefId: prizeTierId ?? undefined })
      setNewPrize({ placement: "", currencyDefId: "", amount: "", isInvitational: false })
    },
  })
  const removePrize = trpc.admin.competitionTier.removePrize.useMutation({
    onSuccess: () => utils.admin.competitionTier.listPrizes.invalidate({ tierDefId: prizeTierId ?? undefined }),
  })

  const { data: tiers } = trpc.admin.competitionTier.list.useQuery(
    { disciplineDefId: selectedDisciplineId },
    { enabled: !!selectedDisciplineId }
  )
  const utils = trpc.useUtils()

  const save = trpc.admin.competitionTier.save.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: selectedDisciplineId })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.competitionTier.remove.useMutation({
    onSuccess: () => {
      utils.admin.competitionTier.list.invalidate({ disciplineDefId: selectedDisciplineId })
      setEditingId(null)
      setEditing(null)
    },
  })

  function handleDisciplineChange(id: string) {
    setSelectedDisciplineId(id)
    setEditingId(null)
    setEditing(null)
  }

  function submit() {
    if (!editing || !gameId || !selectedDisciplineId || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      disciplineDefId: selectedDisciplineId,
      name: editing.name.trim(),
      tierIndex: parseInt(editing.tierIndex),
      minScore: editing.minScore !== "" ? parseFloat(editing.minScore) : null,
      advancementThreshold: editing.advancementThreshold !== "" ? parseFloat(editing.advancementThreshold) : null,
      energyCost: parseFloat(editing.energyCost),
      entryFee: editing.entryFee !== "" ? parseInt(editing.entryFee) : 0,
      minWeeklyPointsForInvitational: editing.minWeeklyPoints !== "" ? parseFloat(editing.minWeeklyPoints) : null,
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Competition Tiers</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <label className="text-xs font-medium text-muted-foreground">Discipline</label>
        <select
          value={selectedDisciplineId}
          onChange={(e) => handleDisciplineChange(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— Select a discipline —</option>
          {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </section>

      {selectedDisciplineId && (
        <>
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Tiers</h2>
              <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
                + Add Tier
              </Button>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Index</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Score</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adv. Threshold</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Energy</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entry Fee</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prizes</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiers?.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.tierIndex}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.minScore ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.advancementThreshold ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.energyCost}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.entryFee}</td>
                    <td className="px-4 py-2">
                      <Button size="sm" variant="ghost" onClick={() => setPrizeTierId(prizeTierId === t.id ? null : t.id)}>
                        {prizeTierId === t.id ? "Hide" : "Prizes"}
                      </Button>
                    </td>
                    <td className="px-4 py-2 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingId(t.id)
                        setEditing({
                          name: t.name,
                          tierIndex: t.tierIndex.toString(),
                          minScore: t.minScore?.toString() ?? "",
                          advancementThreshold: t.advancementThreshold?.toString() ?? "",
                          energyCost: t.energyCost.toString(),
                          entryFee: t.entryFee.toString(),
                          minWeeklyPoints: t.minWeeklyPointsForInvitational?.toString() ?? "",
                        })
                      }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => { if (!confirm("Delete this tier?")) return; remove.mutate({ id: t.id }) }}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {tiers?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No tiers for this discipline yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
          </section>

          {prizeTierId && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">
                  Prizes — {tiers?.find(t => t.id === prizeTierId)?.name}
                </h2>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placement</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prizes?.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">#{p.placement}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.amount}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.currencyDef ? `${p.currencyDef.symbol ?? ""} ${p.currencyDef.name}`.trim() : "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.isInvitational ? "Invitational" : "Regular"}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => removePrize.mutate({ id: p.id })}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-3">
                      <Input type="number" step="1" min="1" placeholder="e.g. 1"
                        value={newPrize.placement}
                        onChange={(e) => setNewPrize(p => ({ ...p, placement: e.target.value }))}
                        className="h-7 text-sm max-w-[80px]" />
                    </td>
                    <td className="px-4 py-3">
                      <Input type="number" step="1" min="0" placeholder="0"
                        value={newPrize.amount}
                        onChange={(e) => setNewPrize(p => ({ ...p, amount: e.target.value }))}
                        className="h-7 text-sm max-w-[100px]" />
                    </td>
                    <td className="px-4 py-3">
                      <select value={newPrize.currencyDefId}
                        onChange={(e) => setNewPrize(p => ({ ...p, currencyDefId: e.target.value }))}
                        className="rounded-md border border-input bg-background px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">— Currency —</option>
                        {currencies?.map((c) => <option key={c.id} value={c.id}>{c.symbol} {c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={newPrize.isInvitational}
                          onChange={(e) => setNewPrize(p => ({ ...p, isInvitational: e.target.checked }))}
                          className="rounded border-input accent-primary" />
                        Invitational
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm"
                        disabled={savePrize.isPending || !newPrize.placement || !newPrize.amount}
                        onClick={() => savePrize.mutate({
                          tierDefId: prizeTierId,
                          placement: parseInt(newPrize.placement),
                          currencyDefId: newPrize.currencyDefId || undefined,
                          amount: parseInt(newPrize.amount),
                          isInvitational: newPrize.isInvitational,
                        })}>
                        Add
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              {savePrize.error && <p className="px-4 pb-3 text-sm text-destructive">{savePrize.error.message}</p>}
              {removePrize.error && <p className="px-4 pb-3 text-sm text-destructive">{removePrize.error.message}</p>}
            </section>
          )}

          {editing !== null && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">
                  {editingId ? "Edit Tier" : "Add Tier"}
                </h2>
              </header>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="e.g. Beginner, Intermediate"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tier Index</label>
                    <Input
                      type="number"
                      step="1"
                      value={editing.tierIndex}
                      onChange={(e) => setEditing({ ...editing, tierIndex: e.target.value })}
                      placeholder="e.g. 1"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Min Score <span className="font-normal">(optional)</span></label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editing.minScore}
                      onChange={(e) => setEditing({ ...editing, minScore: e.target.value })}
                      placeholder="e.g. 50"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Adv. Threshold <span className="font-normal">(optional)</span></label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editing.advancementThreshold}
                      onChange={(e) => setEditing({ ...editing, advancementThreshold: e.target.value })}
                      placeholder="e.g. 80"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Energy Cost</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editing.energyCost}
                      onChange={(e) => setEditing({ ...editing, energyCost: e.target.value })}
                      placeholder="e.g. 15"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Entry Fee</label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={editing.entryFee}
                      onChange={(e) => setEditing({ ...editing, entryFee: e.target.value })}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Min Weekly Points for Invitational <span className="font-normal">(optional)</span></label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editing.minWeeklyPoints}
                      onChange={(e) => setEditing({ ...editing, minWeeklyPoints: e.target.value })}
                      placeholder="e.g. 100"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={submit}
                    disabled={save.isPending || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === ""}
                  >
                    {editingId ? "Save" : "Add Tier"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
                    Cancel
                  </Button>
                </div>
                {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/competition-tiers")({
  component: CompetitionTiersPage,
})
