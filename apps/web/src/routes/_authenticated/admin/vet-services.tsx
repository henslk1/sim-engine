import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const SERVICE_TYPES = ["EXAM", "PANEL_TEST", "GENETIC_COLLECTION", "GENETIC_STORAGE", "CASTRATION", "ULTRASOUND", "NATURAL_COVER"] as const
type ServiceType = typeof SERVICE_TYPES[number]

type VetServiceForm = {
  name: string
  serviceType: ServiceType
  baseCost: string
  currencyDefId: string
  hasSubscriberDiscount: boolean
  panelDefId: string
}
const emptyForm = (): VetServiceForm => ({
  name: "",
  serviceType: "EXAM",
  baseCost: "",
  currencyDefId: "",
  hasSubscriberDiscount: false,
  panelDefId: "",
})

function VetServicesPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: services } = trpc.admin.vetService.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: currencies } = trpc.admin.currency.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: panels } = trpc.admin.panel.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<VetServiceForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.vetService.save.useMutation({
    onSuccess: () => {
      utils.admin.vetService.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.vetService.remove.useMutation({
    onSuccess: () => {
      utils.admin.vetService.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim() || !editing.currencyDefId || editing.baseCost === "") return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      serviceType: editing.serviceType,
      baseCost: parseInt(editing.baseCost),
      currencyDefId: editing.currencyDefId,
      hasSubscriberDiscount: editing.hasSubscriberDiscount,
      panelDefId: editing.panelDefId || null,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Vet Services</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Service Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Service
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">
                  {s.name}
                  {s.hasSubscriberDiscount && <span className="ml-2 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">sub discount</span>}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{s.serviceType}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.baseCost}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.currencyDef.symbol ?? s.currencyDef.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.panelDef?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(s.id)
                    setEditing({
                      name: s.name,
                      serviceType: s.serviceType as ServiceType,
                      baseCost: s.baseCost.toString(),
                      currencyDefId: s.currencyDef.id,
                      hasSubscriberDiscount: s.hasSubscriberDiscount,
                      panelDefId: s.panelDefId ?? "",
                    })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this vet service?")) return; remove.mutate({ id: s.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {services?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No vet services defined yet.</td>
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
              {editingId ? "Edit Service" : "Add Service"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Basic Exam"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Service Type</label>
                <select
                  value={editing.serviceType}
                  onChange={(e) => setEditing({ ...editing, serviceType: e.target.value as ServiceType, panelDefId: "" })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Base Cost</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editing.baseCost}
                  onChange={(e) => setEditing({ ...editing, baseCost: e.target.value })}
                  placeholder="e.g. 100"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Currency</label>
                <select
                  value={editing.currencyDefId}
                  onChange={(e) => setEditing({ ...editing, currencyDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select currency —</option>
                  {currencies?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.symbol ? ` (${c.symbol})` : ""}</option>)}
                </select>
              </div>
            </div>
            {editing.serviceType === "PANEL_TEST" && (
              <div className="max-w-xs">
                <label className="text-xs font-medium text-muted-foreground">Panel <span className="font-normal">(optional)</span></label>
                <select
                  value={editing.panelDefId}
                  onChange={(e) => setEditing({ ...editing, panelDefId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {panels?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.hasSubscriberDiscount}
                  onChange={(e) => setEditing({ ...editing, hasSubscriberDiscount: e.target.checked })}
                  className="rounded border-input"
                />
                <span>Subscriber discount</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.name.trim() || !editing.currencyDefId || editing.baseCost === ""}
              >
                {editingId ? "Save" : "Add Service"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
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

export const Route = createFileRoute("/_authenticated/admin/vet-services")({
  component: VetServicesPage,
})
