import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const SERVICE_TYPES = ["EXAM", "PANEL_TEST", "GENETIC_COLLECTION", "GENETIC_STORAGE", "CASTRATION", "ULTRASOUND", "NATURAL_COVER", "PREGNANCY_ABORT"] as const
type ServiceType = typeof SERVICE_TYPES[number]
type HealthConditionSummary = { id: string; name: string; conditionType: string }

const PANEL_TYPES = ["COLOR", "HEALTH", "CONFORMATION"] as const

type VetServiceForm = {
  name: string
  serviceType: ServiceType
  baseCost: string
  currencyDefId: string
  hasSubscriberDiscount: boolean
  panelScope: "specific" | "byType"
  panelDefId: string
  panelType: string
  linkedConditionIds: string[]
}
const emptyForm = (): VetServiceForm => ({
  name: "",
  serviceType: "EXAM",
  baseCost: "",
  currencyDefId: "",
  hasSubscriberDiscount: false,
  panelScope: "specific",
  panelDefId: "",
  panelType: "",
  linkedConditionIds: [],
})

function VetServicesPage() {
  const { gameId } = Route.useParams()

  const { data: services } = trpc.admin.vetService.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: currencies } = trpc.admin.currency.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: panels } = trpc.admin.panel.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: allConditions } = trpc.admin.health.list.useQuery(
    { gameId: gameId! },
    {}
  ) as { data: HealthConditionSummary[] | undefined }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<VetServiceForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.vetService.save.useMutation({
    onSuccess: (saved, vars) => {
      if (vars.serviceType === "EXAM") {
        setConditions.mutate({
          vetServiceDefId: saved.id,
          conditionDefIds: editing?.linkedConditionIds ?? [],
        })
      } else {
        utils.admin.vetService.list.invalidate({ gameId: gameId! })
        setEditingId(null)
        setEditing(null)
      }
    },
  })
  const setConditions = trpc.admin.vetService.setConditions.useMutation({
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

  function toggleCondition(conditionDefId: string) {
    if (!editing) return
    const ids = editing.linkedConditionIds
    setEditing({
      ...editing,
      linkedConditionIds: ids.includes(conditionDefId)
        ? ids.filter((id) => id !== conditionDefId)
        : [...ids, conditionDefId],
    })
  }

  function submit() {
    const isPanelTest = editing?.serviceType === "PANEL_TEST"
    if (!editing || !gameId || !editing.name.trim() || !editing.currencyDefId || (!isPanelTest && editing.baseCost === "")) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      serviceType: editing.serviceType,
      baseCost: isPanelTest ? 0 : parseInt(editing.baseCost),
      currencyDefId: editing.currencyDefId,
      hasSubscriberDiscount: editing.hasSubscriberDiscount,
      panelDefId: editing.panelScope === "specific" ? editing.panelDefId || null : null,
      panelType: editing.panelScope === "byType" ? (editing.panelType as "HEALTH" | "CONFORMATION" | "COLOR" | "VARIANCE") || null : null,
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Vet Services</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Service Definitions</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null); }}>
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
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel / Conditions</th>
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
                <td className="px-4 py-2 text-muted-foreground">
                  {s.serviceType === "EXAM"
                    ? s.conditions.length === 0
                      ? <span className="text-xs italic">All conditions</span>
                      : <span>{s.conditions.length} condition{s.conditions.length !== 1 ? "s" : ""}</span>
                    : s.panelType
                      ? <span>All {s.panelType} panels</span>
                      : s.panelDef?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(s.id)
                    setEditing({
                      name: s.name,
                      serviceType: s.serviceType as ServiceType,
                      baseCost: s.baseCost.toString(),
                      currencyDefId: s.currencyDef.id,
                      hasSubscriberDiscount: s.hasSubscriberDiscount,
                      panelScope: s.panelType ? "byType" : "specific",
                      panelDefId: s.panelDefId ?? "",
                      panelType: s.panelType ?? "",
                      linkedConditionIds: s.conditions.map((c) => c.conditionDefId),
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
                  onChange={(e) => setEditing({ ...editing, serviceType: e.target.value as ServiceType, panelScope: "specific", panelDefId: "", panelType: "" })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editing.serviceType !== "PANEL_TEST" && (
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
              )}
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
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Panel scope</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={editing.panelScope === "specific"}
                      onChange={() => setEditing({ ...editing, panelScope: "specific", panelType: "" })}
                    />
                    Specific panel
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={editing.panelScope === "byType"}
                      onChange={() => setEditing({ ...editing, panelScope: "byType", panelDefId: "" })}
                    />
                    All panels of type
                  </label>
                </div>
                {editing.panelScope === "specific" && (
                  <select
                    value={editing.panelDefId}
                    onChange={(e) => setEditing({ ...editing, panelDefId: e.target.value })}
                    className="block max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— None —</option>
                    {panels?.filter((p) => {
                      if (p.panelType !== "HEALTH" && p.panelType !== "CONFORMATION") return false
                      const alreadyUsed = services?.some((s) => s.serviceType === "PANEL_TEST" && s.panelDefId === p.id && s.id !== editingId)
                      return !alreadyUsed || editing?.panelDefId === p.id
                    }).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {editing.panelScope === "byType" && (
                  <select
                    value={editing.panelType}
                    onChange={(e) => setEditing({ ...editing, panelType: e.target.value })}
                    className="block max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— Select type —</option>
                    {PANEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>
            )}
            {editing.serviceType === "EXAM" && allConditions && allConditions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Diagnosable conditions <span className="font-normal">(leave empty to diagnose all undiagnosed conditions)</span>
                </label>
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-input bg-background p-2 space-y-1">
                  {allConditions.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        checked={editing.linkedConditionIds.includes(c.id)}
                        onChange={() => toggleCondition(c.id)}
                        className="rounded border-input accent-primary"
                      />
                      <span className="text-sm text-foreground">{c.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground uppercase">{c.conditionType}</span>
                    </label>
                  ))}
                </div>
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
                disabled={save.isPending || setConditions.isPending || !editing.name.trim() || !editing.currencyDefId || (editing.serviceType !== "PANEL_TEST" && editing.baseCost === "")}
              >
                {save.isPending || setConditions.isPending ? "Saving…" : editingId ? "Save" : "Add Service"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>
      )}

      {(() => {
        const linkedIds = new Set(
          services?.flatMap((s) => s.conditions.map((c) => c.conditionDefId)) ?? []
        )
        const unlinked = allConditions?.filter((c) => !linkedIds.has(c.id)) ?? []
        return (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                Conditions not linked to any exam service
                {unlinked.length > 0 && (
                  <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
                    {unlinked.length}
                  </span>
                )}
              </h2>
            </header>
            {unlinked.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">All conditions are covered.</p>
            ) : (
              <ul className="divide-y divide-border">
                {unlinked.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-xs uppercase text-muted-foreground">{c.conditionType}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })()}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/vet-services")({
  component: VetServicesPage,
})
