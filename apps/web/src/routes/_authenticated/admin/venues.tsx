import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const CLIMATES = ["HOT", "WARM", "COLD", "TEMPERATE"] as const
const TERRAINS = ["FLAT", "COASTAL", "HILLY", "MOUNTAIN"] as const

type VenueForm = {
  id?: string
  name: string
  climate: typeof CLIMATES[number]
  terrain: typeof TERRAINS[number]
  rotationOrder: string
}

const emptyVenueForm = (): VenueForm => ({
  name: "",
  climate: "TEMPERATE",
  terrain: "FLAT",
  rotationOrder: "",
})

type DisciplineForm = {
  id?: string
  disciplineDefId: string
  defaultMaxEntries: string
  defaultMaxWaitHours: string
  invitationalMaxEntries: string
  invitationalMaxWaitHours: string
  maxOpenAtOnce: string
  isInvitationalEligible: boolean
}

const emptyDisciplineForm = (): DisciplineForm => ({
  disciplineDefId: "",
  defaultMaxEntries: "10",
  defaultMaxWaitHours: "24",
  invitationalMaxEntries: "",
  invitationalMaxWaitHours: "",
  maxOpenAtOnce: "1",
  isInvitationalEligible: false,
})

function VenuesPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: venues } = trpc.admin.venue.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const { data: disciplines } = trpc.admin.discipline.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const utils = trpc.useUtils()
  const invalidate = () => utils.admin.venue.list.invalidate({ gameId: gameId! })

  const saveVenue = trpc.admin.venue.save.useMutation({ onSuccess: invalidate })
  const removeVenue = trpc.admin.venue.remove.useMutation({ onSuccess: invalidate })
  const saveDiscipline = trpc.admin.venue.saveDiscipline.useMutation({ onSuccess: invalidate })
  const removeDiscipline = trpc.admin.venue.removeDiscipline.useMutation({ onSuccess: invalidate })

  const [editing, setEditing] = useState<{ venue: VenueForm; venueId?: string } | null>(null)
  const [discForm, setDiscForm] = useState<DisciplineForm | null>(null)
  const [editingDiscId, setEditingDiscId] = useState<string | null>(null)

  function startAdd() {
    setEditing({ venue: emptyVenueForm() })
    setDiscForm(null)
    setEditingDiscId(null)
  }

  function startEdit(v: NonNullable<typeof venues>[number]) {
    setEditing({
      venueId: v.id,
      venue: {
        id: v.id,
        name: v.name,
        climate: v.climate as typeof CLIMATES[number],
        terrain: v.terrain as typeof TERRAINS[number],
        rotationOrder: v.rotationOrder?.toString() ?? "",
      },
    })
    setDiscForm(null)
    setEditingDiscId(null)
  }

  function handleSaveVenue() {
    if (!editing || !gameId) return
    const { rotationOrder, ...rest } = editing.venue
    saveVenue.mutate({
      ...rest,
      gameId,
      rotationOrder: rotationOrder !== "" ? parseInt(rotationOrder) : null,
    })
    if (!editing.venueId) setEditing(null)
  }

  function handleRemoveVenue(id: string) {
    if (!confirm("Delete this venue?")) return
    removeVenue.mutate({ id })
    if (editing?.venueId === id) setEditing(null)
  }

  function handleSaveDisc() {
    if (!discForm || !editing?.venueId) return
    saveDiscipline.mutate({
      id: editingDiscId ?? undefined,
      venueId: editing.venueId,
      disciplineDefId: discForm.disciplineDefId,
      defaultMaxEntries: parseInt(discForm.defaultMaxEntries),
      defaultMaxWaitHours: parseInt(discForm.defaultMaxWaitHours),
      invitationalMaxEntries: discForm.invitationalMaxEntries !== "" ? parseInt(discForm.invitationalMaxEntries) : null,
      invitationalMaxWaitHours: discForm.invitationalMaxWaitHours !== "" ? parseInt(discForm.invitationalMaxWaitHours) : null,
      maxOpenAtOnce: parseInt(discForm.maxOpenAtOnce),
      isInvitationalEligible: discForm.isInvitationalEligible,
    })
    setDiscForm(null)
    setEditingDiscId(null)
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  const currentVenue = editing?.venueId ? venues?.find((v) => v.id === editing.venueId) : undefined

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Venues</h1>
        <Button size="sm" onClick={startAdd}>Add Venue</Button>
      </div>

      {editing && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editing.venueId ? "Edit Venue" : "Add Venue"}</h2>
          </header>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input value={editing.venue.name} onChange={(e) => setEditing({ ...editing, venue: { ...editing.venue, name: e.target.value } })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rotation Order <span className="font-normal">(optional)</span></label>
                <Input type="number" value={editing.venue.rotationOrder} onChange={(e) => setEditing({ ...editing, venue: { ...editing.venue, rotationOrder: e.target.value } })} placeholder="e.g. 1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Climate</label>
                <select
                  value={editing.venue.climate}
                  onChange={(e) => setEditing({ ...editing, venue: { ...editing.venue, climate: e.target.value as typeof CLIMATES[number] } })}
                  className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CLIMATES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terrain</label>
                <select
                  value={editing.venue.terrain}
                  onChange={(e) => setEditing({ ...editing, venue: { ...editing.venue, terrain: e.target.value as typeof TERRAINS[number] } })}
                  className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {TERRAINS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {saveVenue.error && <p className="text-sm text-destructive">{saveVenue.error.message}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSaveVenue} disabled={saveVenue.isPending}>{saveVenue.isPending ? "Saving…" : "Save Venue"}</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>

          {editing.venueId && (
            <div className="border-t border-border">
              <header className="flex items-center justify-between bg-secondary/40 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-foreground">Disciplines</h3>
                {!discForm && (
                  <Button size="sm" variant="outline" onClick={() => { setDiscForm(emptyDisciplineForm()); setEditingDiscId(null) }}>
                    + Add Discipline
                  </Button>
                )}
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discipline</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Entries</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wait (h)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Open</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitational</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVenue?.disciplines.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{d.disciplineDef.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.defaultMaxEntries}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.defaultMaxWaitHours}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.maxOpenAtOnce}</td>
                      <td className="px-3 py-2 text-center">{d.isInvitationalEligible ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingDiscId(d.id)
                          setDiscForm({
                            disciplineDefId: d.disciplineDefId,
                            defaultMaxEntries: d.defaultMaxEntries.toString(),
                            defaultMaxWaitHours: d.defaultMaxWaitHours.toString(),
                            invitationalMaxEntries: d.invitationalMaxEntries?.toString() ?? "",
                            invitationalMaxWaitHours: d.invitationalMaxWaitHours?.toString() ?? "",
                            maxOpenAtOnce: d.maxOpenAtOnce.toString(),
                            isInvitationalEligible: d.isInvitationalEligible,
                          })
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => { if (!confirm("Remove this discipline from venue?")) return; removeDiscipline.mutate({ id: d.id }) }}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(currentVenue?.disciplines.length ?? 0) === 0 && !discForm && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">No disciplines assigned.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {discForm && (
                <div className="border-t border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{editingDiscId ? "Edit Discipline" : "Add Discipline"}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Discipline</label>
                      <select
                        value={discForm.disciplineDefId}
                        onChange={(e) => setDiscForm({ ...discForm, disciplineDefId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Select —</option>
                        {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Default Max Entries</label>
                      <Input type="number" min="1" className="mt-1" value={discForm.defaultMaxEntries} onChange={(e) => setDiscForm({ ...discForm, defaultMaxEntries: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Default Wait (hours)</label>
                      <Input type="number" min="1" className="mt-1" value={discForm.defaultMaxWaitHours} onChange={(e) => setDiscForm({ ...discForm, defaultMaxWaitHours: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Max Open At Once</label>
                      <Input type="number" min="1" className="mt-1" value={discForm.maxOpenAtOnce} onChange={(e) => setDiscForm({ ...discForm, maxOpenAtOnce: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Invitational Max Entries <span className="font-normal">(optional)</span></label>
                      <Input type="number" min="1" className="mt-1" value={discForm.invitationalMaxEntries} onChange={(e) => setDiscForm({ ...discForm, invitationalMaxEntries: e.target.value })} placeholder="—" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Invitational Wait (hours) <span className="font-normal">(optional)</span></label>
                      <Input type="number" min="1" className="mt-1" value={discForm.invitationalMaxWaitHours} onChange={(e) => setDiscForm({ ...discForm, invitationalMaxWaitHours: e.target.value })} placeholder="—" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={discForm.isInvitationalEligible} onChange={(e) => setDiscForm({ ...discForm, isInvitationalEligible: e.target.checked })} />
                    Invitational Eligible
                  </label>
                  {saveDiscipline.error && <p className="text-sm text-destructive">{saveDiscipline.error.message}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDisc} disabled={saveDiscipline.isPending || !discForm.disciplineDefId}>
                      {saveDiscipline.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setDiscForm(null); setEditingDiscId(null) }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Climate</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terrain</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disciplines</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {venues?.map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{v.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.climate}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.terrain}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.disciplines.map((d) => d.disciplineDef.name).join(", ") || "—"}</td>
                <td className="px-3 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRemoveVenue(v.id)}>Delete</Button>
                </td>
              </tr>
            ))}
            {venues?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No venues defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/venues")({
  component: VenuesPage,
})
