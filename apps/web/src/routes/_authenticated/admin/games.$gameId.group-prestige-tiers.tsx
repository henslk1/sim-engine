import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TierForm = {
  name: string
  minPrestige: string
  maxPrestige: string
  memberCap: string
  perks: string
}
const emptyForm = (): TierForm => ({ name: "", minPrestige: "", maxPrestige: "", memberCap: "", perks: "" })

function GroupPrestigeTiersPage() {
  const { gameId } = Route.useParams()

  const { data: tiers } = trpc.admin.groupPrestige.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TierForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.groupPrestige.save.useMutation({
    onSuccess: () => {
      utils.admin.groupPrestige.list.invalidate()
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

  const remove = trpc.admin.groupPrestige.remove.useMutation({
    onSuccess: () => {
      utils.admin.groupPrestige.list.invalidate()
      setEditingId(null)
      setEditing(emptyForm())
    },
  })

  function openEdit(t: NonNullable<typeof tiers>[number]) {
    setEditingId(t.id)
    setEditing({
      name: t.name,
      minPrestige: t.minPrestige.toString(),
      maxPrestige: t.maxPrestige?.toString() ?? "",
      memberCap: t.memberCap?.toString() ?? "",
      perks: t.perks ?? "",
    })
  }

  function handleSave() {
    if (!gameId) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      minPrestige: parseInt(editing.minPrestige) || 0,
      maxPrestige: editing.maxPrestige !== "" ? parseInt(editing.maxPrestige) : null,
      memberCap: editing.memberCap !== "" ? parseInt(editing.memberCap) : null,
      perks: editing.perks.trim() || null,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Group Prestige Tiers</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Tier" : "New Tier"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Bronze"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Prestige</label>
              <Input
                type="number"
                min="0"
                value={editing.minPrestige}
                onChange={(e) => setEditing({ ...editing, minPrestige: e.target.value })}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Max Prestige</label>
              <Input
                type="number"
                min="0"
                value={editing.maxPrestige}
                onChange={(e) => setEditing({ ...editing, maxPrestige: e.target.value })}
                placeholder="—"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Member Cap</label>
              <Input
                type="number"
                min="1"
                value={editing.memberCap}
                onChange={(e) => setEditing({ ...editing, memberCap: e.target.value })}
                placeholder="—"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Perks</label>
              <Input
                value={editing.perks}
                onChange={(e) => setEditing({ ...editing, perks: e.target.value })}
                placeholder="Description of perks"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={save.isPending || !editing.name.trim()}>
                {editingId ? "Save" : "Add Tier"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiers</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>+ New Tier</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Prestige</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Prestige</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Member Cap</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tiers?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.minPrestige}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.maxPrestige ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.memberCap ?? "—"}</td>
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
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No prestige tiers yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </section>
      </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/group-prestige-tiers")({
  component: GroupPrestigeTiersPage,
})
