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
  const { gameId } = Route.useParams()

  const { data: tiers } = trpc.admin.intensityTier.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.intensityTier.save.useMutation({
    onSuccess: () => {
      utils.admin.intensityTier.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.intensityTier.remove.useMutation({
    onSuccess: () => {
      utils.admin.intensityTier.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

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
  }

  function submit() {
    if (!gameId || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === "" || editing.gainMultiplier === "") return
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

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Intensity Tiers</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[280px_1fr] gap-2 items-start">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Tier" : "New Tier"}
            </h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Light"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tier Index</label>
              <Input
                className="h-8 text-sm"
                type="number"
                min="0"
                value={editing.tierIndex}
                onChange={(e) => setEditing({ ...editing, tierIndex: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Cost</label>
              <Input
                className="h-8 text-sm"
                type="number"
                step="0.01"
                value={editing.energyCost}
                onChange={(e) => setEditing({ ...editing, energyCost: e.target.value })}
                placeholder="e.g. 10"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gain Multiplier</label>
              <Input
                className="h-8 text-sm"
                type="number"
                step="0.01"
                value={editing.gainMultiplier}
                onChange={(e) => setEditing({ ...editing, gainMultiplier: e.target.value })}
                placeholder="e.g. 1.5"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Mood <span className="font-normal normal-case">— optional</span></label>
              <Input
                className="h-8 text-sm"
                type="number"
                step="0.01"
                value={editing.minMood}
                onChange={(e) => setEditing({ ...editing, minMood: e.target.value })}
                placeholder="—"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Condition <span className="font-normal normal-case">— optional</span></label>
              <Input
                className="h-8 text-sm"
                type="number"
                step="0.01"
                value={editing.minCondition}
                onChange={(e) => setEditing({ ...editing, minCondition: e.target.value })}
                placeholder="—"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-8 text-sm" onClick={submit} disabled={save.isPending || !editing.name.trim() || editing.tierIndex === "" || editing.energyCost === "" || editing.gainMultiplier === ""}>Save</Button>
              {editingId && (
                <Button className="h-8 text-sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>Cancel</Button>
              )}
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiers</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Energy</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gain Multiplier</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Mood</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Cond.</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tiers?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{t.tierIndex}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.energyCost}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.gainMultiplier}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.minMood ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.minCondition ?? "—"}</td>
                  <td className="px-3 py-2 text-right space-x-1">
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
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No intensity tiers yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </div>
      </div>
    </div>
  </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/intensity-tiers")({
  component: IntensityTiersPage,
})
