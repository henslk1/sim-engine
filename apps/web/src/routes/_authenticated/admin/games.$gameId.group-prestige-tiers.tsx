import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TierForm = {
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
  name: "", tierIndex: "0", minScore: "0", maxMembers: "1", maxGroupAnimals: "0",
  maxHostedShowsPerDay: "", prestigeCurrencyRewardPerDay: "0", vetDiscountPercent: "0",
  canHaveVenue: false, canHostInvitational: false, entryFeeSharePercent: "0",
})

function NumberField({ label, value, onChange, min = 0, max }: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
}) {
  return <div className="flex flex-col gap-1">
    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
    <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
  </div>
}

function GroupPrestigeTiersPage() {
  const { gameId } = Route.useParams()
  const { data: tiers } = trpc.admin.groupPrestige.list.useQuery({ gameId })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm>(emptyForm())
  const utils = trpc.useUtils()

  const reset = () => { setEditingId(null); setEditing(emptyForm()) }
  const save = trpc.admin.groupPrestige.save.useMutation({
    onSuccess: () => { utils.admin.groupPrestige.list.invalidate({ gameId }); reset() },
  })
  const remove = trpc.admin.groupPrestige.remove.useMutation({
    onSuccess: () => { utils.admin.groupPrestige.list.invalidate({ gameId }); reset() },
  })

  function openEdit(t: NonNullable<typeof tiers>[number]) {
    setEditingId(t.id)
    setEditing({
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
    if (!editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      tierIndex: parseInt(editing.tierIndex) || 0,
      minScore: parseFloat(editing.minScore) || 0,
      maxMembers: Math.max(1, parseInt(editing.maxMembers) || 1),
      maxGroupAnimals: Math.max(0, parseInt(editing.maxGroupAnimals) || 0),
      maxHostedShowsPerDay: editing.maxHostedShowsPerDay === "" ? null : parseInt(editing.maxHostedShowsPerDay),
      prestigeCurrencyRewardPerDay: parseFloat(editing.prestigeCurrencyRewardPerDay) || 0,
      vetDiscountPercent: parseFloat(editing.vetDiscountPercent) || 0,
      canHaveVenue: editing.canHaveVenue,
      canHostInvitational: editing.canHostInvitational,
      entryFeeSharePercent: parseFloat(editing.entryFeeSharePercent) || 0,
    })
  }

  return <div className="mx-auto max-w-6xl space-y-3 p-4">
    <h1 className="font-serif text-xl font-semibold text-foreground">Group Prestige Tiers</h1>
    <div className="grid grid-cols-[360px_1fr] items-start gap-2 rounded-xl border border-border bg-card p-2 shadow-md">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-secondary/40 px-3 py-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Tier" : "New Tier"}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8 text-sm" />
          </div>
          <NumberField label="Tier Index" value={editing.tierIndex} onChange={(tierIndex) => setEditing({ ...editing, tierIndex })} />
          <NumberField label="Minimum Score" value={editing.minScore} onChange={(minScore) => setEditing({ ...editing, minScore })} />
          <NumberField label="Maximum Members" value={editing.maxMembers} onChange={(maxMembers) => setEditing({ ...editing, maxMembers })} min={1} />
          <NumberField label="Maximum Group Animals" value={editing.maxGroupAnimals} onChange={(maxGroupAnimals) => setEditing({ ...editing, maxGroupAnimals })} />
          <NumberField label="Hosted Shows / Day" value={editing.maxHostedShowsPerDay} onChange={(maxHostedShowsPerDay) => setEditing({ ...editing, maxHostedShowsPerDay })} />
          <NumberField label="Daily Prestige Reward" value={editing.prestigeCurrencyRewardPerDay} onChange={(prestigeCurrencyRewardPerDay) => setEditing({ ...editing, prestigeCurrencyRewardPerDay })} />
          <NumberField label="Vet Discount %" value={editing.vetDiscountPercent} onChange={(vetDiscountPercent) => setEditing({ ...editing, vetDiscountPercent })} max={100} />
          <NumberField label="Entry Fee Share %" value={editing.entryFeeSharePercent} onChange={(entryFeeSharePercent) => setEditing({ ...editing, entryFeeSharePercent })} max={100} />
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.canHaveVenue} onChange={(e) => setEditing({ ...editing, canHaveVenue: e.target.checked })} />Can have a venue</label>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.canHostInvitational} onChange={(e) => setEditing({ ...editing, canHostInvitational: e.target.checked })} />Can host invitationals</label>
          <div className="col-span-2 flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={save.isPending || !editing.name.trim()}>{editingId ? "Save" : "Add Tier"}</Button>
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
          {save.error && <p className="col-span-2 text-sm text-destructive">{save.error.message}</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiers</h2>
          <Button size="sm" variant="ghost" onClick={reset}>+ New Tier</Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">Min Score</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">Members</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">Animals</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase text-muted-foreground">Actions</th>
          </tr></thead>
          <tbody>
            {tiers?.map((t) => <tr key={t.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{t.tierIndex}</td>
              <td className="px-3 py-2 font-medium">{t.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.minScore}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.maxMembers}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.maxGroupAnimals}</td>
              <td className="space-x-1 px-3 py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this tier?")) remove.mutate({ id: t.id }) }}>Delete</Button>
              </td>
            </tr>)}
            {tiers?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No prestige tiers yet.</td></tr>}
          </tbody>
        </table>
        {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>
    </div>
  </div>
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/group-prestige-tiers")({
  component: GroupPrestigeTiersPage,
})
