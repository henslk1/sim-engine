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
}
const emptyForm = (): TierForm => ({ name: "", tierIndex: "", minScore: "", advancementThreshold: "", energyCost: "0" })

function CompetitionTiersPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const [selectedDisciplineId, setSelectedDisciplineId] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm | null>(null)

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
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

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
                    <td className="px-4 py-2 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingId(t.id)
                        setEditing({
                          name: t.name,
                          tierIndex: t.tierIndex.toString(),
                          minScore: t.minScore?.toString() ?? "",
                          advancementThreshold: t.advancementThreshold?.toString() ?? "",
                          energyCost: t.energyCost.toString(),
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

export const Route = createFileRoute("/_authenticated/admin/competition-tiers")({
  component: CompetitionTiersPage,
})
