import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TierForm = {
  id?: string
  name: string
  tierIndex: string
  minScore: string
  maxMembers: string
  maxGroupAnimals: string
  maxHostedShowsPerDay: string
  prestigeCurrencyRewardPerDay: string
  vetDiscountPercent: string
  canHaveVenue: boolean
  canHostInvitational: boolean
  entryFeeSharePercent: string
}

const emptyForm = (): TierForm => ({
  name: "",
  tierIndex: "0",
  minScore: "0",
  maxMembers: "20",
  maxGroupAnimals: "0",
  maxHostedShowsPerDay: "",
  prestigeCurrencyRewardPerDay: "0",
  vetDiscountPercent: "0",
  canHaveVenue: false,
  canHostInvitational: false,
  entryFeeSharePercent: "0",
})

const checkboxFields: [keyof TierForm, string][] = [
  ["canHaveVenue", "Can Have Venue"],
  ["canHostInvitational", "Can Host Invitational"],
]

function GroupPrestigeTiersPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: tiers } = trpc.admin.groupPrestige.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const utils = trpc.useUtils()
  const save = trpc.admin.groupPrestige.save.useMutation({
    onSuccess: () => {
      utils.admin.groupPrestige.list.invalidate()
      setEditing(null)
    },
  })
  const remove = trpc.admin.groupPrestige.remove.useMutation({
    onSuccess: () => utils.admin.groupPrestige.list.invalidate(),
  })

  const [editing, setEditing] = useState<TierForm | null>(null)

  function startEdit(t: NonNullable<typeof tiers>[number]) {
    setEditing({
      id: t.id,
      name: t.name,
      tierIndex: t.tierIndex.toString(),
      minScore: t.minScore.toString(),
      maxMembers: t.maxMembers.toString(),
      maxGroupAnimals: t.maxGroupAnimals.toString(),
      maxHostedShowsPerDay: t.maxHostedShowsPerDay?.toString() ?? "",
      prestigeCurrencyRewardPerDay: t.prestigeCurrencyRewardPerDay.toString(),
      vetDiscountPercent: t.vetDiscountPercent.toString(),
      canHaveVenue: t.canHaveVenue,
      canHostInvitational: t.canHostInvitational,
      entryFeeSharePercent: t.entryFeeSharePercent.toString(),
    })
  }

  function handleSave() {
    if (!editing || !gameId) return
    save.mutate({
      id: editing.id,
      gameId,
      name: editing.name,
      tierIndex: parseInt(editing.tierIndex),
      minScore: parseFloat(editing.minScore),
      maxMembers: parseInt(editing.maxMembers),
      maxGroupAnimals: parseInt(editing.maxGroupAnimals),
      maxHostedShowsPerDay: editing.maxHostedShowsPerDay !== "" ? parseInt(editing.maxHostedShowsPerDay) : null,
      prestigeCurrencyRewardPerDay: parseFloat(editing.prestigeCurrencyRewardPerDay),
      vetDiscountPercent: parseFloat(editing.vetDiscountPercent),
      canHaveVenue: editing.canHaveVenue,
      canHostInvitational: editing.canHostInvitational,
      entryFeeSharePercent: parseFloat(editing.entryFeeSharePercent),
    })
  }

  function update(field: keyof TierForm, value: string | boolean) {
    setEditing((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  if (editing) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {editing.id ? "Edit Prestige Tier" : "Add Prestige Tier"}
        </h1>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Tier Details</h2>
          </header>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input value={editing.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tier Index</label>
                <p className="text-[11px] text-muted-foreground">Order (0 = lowest tier)</p>
                <Input type="number" min="0" value={editing.tierIndex} onChange={(e) => update("tierIndex", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Min Score</label>
                <Input type="number" min="0" step="0.1" value={editing.minScore} onChange={(e) => update("minScore", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max Members</label>
                <Input type="number" min="1" value={editing.maxMembers} onChange={(e) => update("maxMembers", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max Group Animals</label>
                <Input type="number" min="0" value={editing.maxGroupAnimals} onChange={(e) => update("maxGroupAnimals", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max Hosted Shows/Day <span className="font-normal">(optional)</span></label>
                <Input type="number" min="0" value={editing.maxHostedShowsPerDay} onChange={(e) => update("maxHostedShowsPerDay", e.target.value)} placeholder="—" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prestige Currency/Day</label>
                <Input type="number" min="0" step="0.01" value={editing.prestigeCurrencyRewardPerDay} onChange={(e) => update("prestigeCurrencyRewardPerDay", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vet Discount %</label>
                <Input type="number" min="0" max="100" step="0.1" value={editing.vetDiscountPercent} onChange={(e) => update("vetDiscountPercent", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entry Fee Share %</label>
                <Input type="number" min="0" max="100" step="0.1" value={editing.entryFeeSharePercent} onChange={(e) => update("entryFeeSharePercent", e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions</p>
              <div className="grid grid-cols-2 gap-2">
                {checkboxFields.map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing[field] as boolean}
                      onChange={(e) => update(field, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Group Prestige Tiers</h1>
        <Button size="sm" onClick={() => setEditing(emptyForm())}>Add Tier</Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Score</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Members</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Animals</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Venue</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitational</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tiers?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{t.tierIndex}</td>
                <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.minScore}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.maxMembers}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.maxGroupAnimals}</td>
                <td className="px-3 py-2 text-center">{t.canHaveVenue ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{t.canHostInvitational ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this tier?")) return; remove.mutate({ id: t.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {tiers?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">No prestige tiers defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/group-prestige-tiers")({
  component: GroupPrestigeTiersPage,
})
