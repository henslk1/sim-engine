import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type SectionForm = {
  id?: string
  name: string
  displayOrder: string
}

const emptySection = (): SectionForm => ({ name: "", displayOrder: "0" })

type EntryRow = { locusId: string; displayOrder: string }
const emptyEntry = (): EntryRow => ({ locusId: "", displayOrder: "0" })

function ConformationSectionsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: sections } = trpc.admin.conformation.listSections.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const { data: loci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const utils = trpc.useUtils()

  const saveSection = trpc.admin.conformation.saveSection.useMutation({
    onSuccess: (saved) => {
      utils.admin.conformation.listSections.invalidate()
      setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
      setFormExpanded(false)
    },
  })
  const removeSection = trpc.admin.conformation.removeSection.useMutation({
    onSuccess: () => {
      utils.admin.conformation.listSections.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<SectionForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  const { data: entries } = trpc.admin.conformation.listEntries.useQuery(
    { sectionId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveEntry = trpc.admin.conformation.saveEntry.useMutation({
    onSuccess: () => {
      utils.admin.conformation.listEntries.invalidate({ sectionId: editing?.id })
      utils.admin.conformation.listSections.invalidate()
      setNewEntry(emptyEntry())
    },
  })
  const removeEntry = trpc.admin.conformation.removeEntry.useMutation({
    onSuccess: () => {
      utils.admin.conformation.listEntries.invalidate({ sectionId: editing?.id })
      utils.admin.conformation.listSections.invalidate()
    },
  })

  const [newEntry, setNewEntry] = useState<EntryRow>(emptyEntry())

  function openEdit(section: NonNullable<typeof sections>[number]) {
    setEditing({ id: section.id, name: section.name, displayOrder: section.displayOrder.toString() })
    setFormExpanded(false)
    setNewEntry(emptyEntry())
  }

  function submitSection() {
    if (!editing || !gameId || !editing.name.trim()) return
    saveSection.mutate({
      id: editing.id,
      gameId,
      name: editing.name.trim(),
      displayOrder: parseInt(editing.displayOrder) || 0,
    })
  }

  function submitEntry() {
    if (!newEntry.locusId || !editing?.id) return
    saveEntry.mutate({
      sectionId: editing.id,
      locusId: newEntry.locusId,
      displayOrder: parseInt(newEntry.displayOrder) || 0,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Conformation Section"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Section Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>Edit Details</Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Head & Neck"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Display Order</label>
                  <Input
                    type="number"
                    min="0"
                    value={editing.displayOrder}
                    onChange={(e) => setEditing({ ...editing, displayOrder: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitSection} disabled={saveSection.isPending || !editing.name.trim()}>Save</Button>
                {editing.id && <Button variant="ghost" onClick={() => setFormExpanded(false)}>Cancel</Button>}
              </div>
              {saveSection.error && <p className="text-sm text-destructive">{saveSection.error.message}</p>}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {editing.name}</p>
              <p><span className="text-muted-foreground">Display Order:</span> {editing.displayOrder}</p>
            </div>
          )}
        </section>

        {editing.id && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Loci Entries</h2>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locus</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display Order</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries?.map((e: NonNullable<typeof entries>[number]) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{e.locus.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.displayOrder}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => removeEntry.mutate({ id: e.id })}>Delete</Button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3">
                    <select
                      value={newEntry.locusId}
                      onChange={(ev) => setNewEntry({ ...newEntry, locusId: ev.target.value })}
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">Select locus…</option>
                      {loci?.map((l) => <option key={l.id} value={l.id}>{l.name}{l.displayGroup ? ` (${l.displayGroup})` : ""}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      value={newEntry.displayOrder}
                      onChange={(ev) => setNewEntry({ ...newEntry, displayOrder: ev.target.value })}
                      className="h-7 text-sm w-20"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={submitEntry} disabled={!newEntry.locusId || saveEntry.isPending}>Add</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeSection.error && <p className="text-sm text-destructive">{removeSection.error.message}</p>}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this conformation section? This will also remove all its entries.")) return
                removeSection.mutate({ id: editing.id! })
              }}
              disabled={removeSection.isPending}
            >
              Delete Section
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Conformation Sections</h1>
        <Button onClick={() => { setEditing(emptySection()); setFormExpanded(true) }}>+ New Section</Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loci</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.displayOrder}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{s._count.entries}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
                </td>
              </tr>
            ))}
            {sections?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No conformation sections yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/conformation-sections")({
  component: ConformationSectionsPage,
})
