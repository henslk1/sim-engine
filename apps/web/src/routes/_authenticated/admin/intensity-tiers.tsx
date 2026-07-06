import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TierForm = {
  name: string
  tierIndex: string
  energyCost: string
  gainMultiplier: string
  minMood: string
  minCondition: string
}
const emptyForm = (): TierForm => ({
  name: "",
  tierIndex: "",
  energyCost: "",
  gainMultiplier: "1",
  minMood: "",
  minCondition: "",
})

function IntensityTiersPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: tiers } = trpc.admin.intensityTier.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const utils = trpc.useUtils()

  const save = trpc.admin.intensityTier.save.useMutation({
    onSuccess: () => {
      utils.admin.intensityTier.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setFormExpanded(false)
    },
  })
  const remove = trpc.admin.intensityTier.remove.useMutation({
    onSuccess: () => {
      utils.admin.intensityTier.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
      setFormExpanded(false)
    },
  })

  function openAdd() {
    setEditingId(null)
    setEditing(emptyForm())
    setFormExpanded(true)
  }

  function openEdit(t: NonNullable<typeof tiers>[number]) {
    setEditingId(t.id)
    setEditing({
      name: t.name,
      tierIndex: t.tierIndex.toString(),
      energyCost: t.energyCost.toString(),
      gainMultiplier: t.gainMultiplier.toString(),
      minMood: t.minMood?.toString() ?? "",
      minCondition: t.minCondition?.toString() ?? "",
    })
    setFormExpanded(true)
  }

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === "" || editing.gainMultiplier === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      tierIndex: parseInt(editing.tierIndex),
      energyCost: parseFloat(editing.energyCost),
      gainMultiplier: parseFloat(editing.gainMultiplier),
      minMood: editing.minMood !== "" ? parseFloat(editing.minMood) : null,
      minCondition: editing.minCondition !== "" ? parseFloat(editing.minCondition) : null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Intensity Tiers</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Tiers</h2>
          <Button size="sm" onClick={openAdd}>+ New Tier</Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Energy</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gain Multiplier</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Mood</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Cond.</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tiers?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{t.tierIndex}</td>
                <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.energyCost}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.gainMultiplier}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.minMood ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.minCondition ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this tier?")) return; remove.mutate({ id: t.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {tiers?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No intensity tiers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {formExpanded && editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Tier" : "New Tier"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Light"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tier Index</label>
                <Input
                  type="number"
                  min="0"
                  value={editing.tierIndex}
                  onChange={(e) => setEditing({ ...editing, tierIndex: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Energy Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.energyCost}
                  onChange={(e) => setEditing({ ...editing, energyCost: e.target.value })}
                  placeholder="e.g. 10"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gain Multiplier</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.gainMultiplier}
                  onChange={(e) => setEditing({ ...editing, gainMultiplier: e.target.value })}
                  placeholder="e.g. 1.5"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Min Mood <span className="font-normal">— optional</span></label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.minMood}
                  onChange={(e) => setEditing({ ...editing, minMood: e.target.value })}
                  placeholder="—"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Min Condition <span className="font-normal">— optional</span></label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.minCondition}
                  onChange={(e) => setEditing({ ...editing, minCondition: e.target.value })}
                  placeholder="—"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === "" || editing.gainMultiplier === ""}
              >
                {editingId ? "Save" : "Add Tier"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null); setFormExpanded(false) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/intensity-tiers")({
  component: IntensityTiersPage,
})
