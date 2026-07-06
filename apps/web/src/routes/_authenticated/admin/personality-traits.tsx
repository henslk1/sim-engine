import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TraitForm = {
  id?: string
  name: string
  description: string
}
const emptyTrait = (): TraitForm => ({ name: "", description: "" })

type LabelRangeRow = { label: string; minValue: string; maxValue: string }
const emptyRange = (): LabelRangeRow => ({ label: "", minValue: "", maxValue: "" })

function PersonalityTraitsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: traits } = trpc.admin.personality.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

  const utils = trpc.useUtils()
  const saveTrait = trpc.admin.personality.save.useMutation({
    onSuccess: () => utils.admin.personality.list.invalidate(),
  })
  const removeTrait = trpc.admin.personality.remove.useMutation({
    onSuccess: () => {
      utils.admin.personality.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<TraitForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  const { data: labelRanges } = trpc.admin.personality.listLabelRanges.useQuery(
    { traitDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveLabelRange = trpc.admin.personality.saveLabelRange.useMutation({
    onSuccess: () => {
      utils.admin.personality.listLabelRanges.invalidate({ traitDefId: editing?.id })
      utils.admin.personality.list.invalidate()
    },
  })
  const removeLabelRange = trpc.admin.personality.removeLabelRange.useMutation({
    onSuccess: () => {
      utils.admin.personality.listLabelRanges.invalidate({ traitDefId: editing?.id })
      utils.admin.personality.list.invalidate()
    },
  })

  const [editingRangeId, setEditingRangeId] = useState<string | null>(null)
  const [editingRange, setEditingRange] = useState<LabelRangeRow>(emptyRange())
  const [newRange, setNewRange] = useState<LabelRangeRow>(emptyRange())

  function openEdit(trait: NonNullable<typeof traits>[number]) {
    setEditing({ id: trait.id, name: trait.name, description: trait.description ?? "" })
    setFormExpanded(false)
    setEditingRangeId(null)
    setEditingRange(emptyRange())
    setNewRange(emptyRange())
  }

  function submitTrait() {
    if (!editing || !gameId) return
    saveTrait.mutate(
      { ...editing, gameId, description: editing.description || null },
      {
        onSuccess: (saved) => {
          setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
          setFormExpanded(false)
        },
      }
    )
  }

  function submitNewRange() {
    if (!newRange.label.trim() || !newRange.minValue || !newRange.maxValue || !editing?.id) return
    saveLabelRange.mutate(
      {
        traitDefId: editing.id,
        label: newRange.label.trim(),
        minValue: parseFloat(newRange.minValue),
        maxValue: parseFloat(newRange.maxValue),
      },
      { onSuccess: () => setNewRange(emptyRange()) }
    )
  }

  function submitEditRange(id: string) {
    if (!editing?.id) return
    saveLabelRange.mutate(
      {
        id,
        traitDefId: editing.id,
        label: editingRange.label,
        minValue: parseFloat(editingRange.minValue),
        maxValue: parseFloat(editingRange.maxValue),
      },
      {
        onSuccess: () => {
          setEditingRangeId(null)
          setEditingRange(emptyRange())
        },
      }
    )
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet. Set up Game Config first.</p>

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Personality Trait"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Trait Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>
                Edit Details
              </Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Boldness, Sociability"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description <span className="font-normal">(optional)</span>
                </label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitTrait} disabled={saveTrait.isPending || !editing.name.trim()}>
                  Save
                </Button>
                {editing.id && (
                  <Button variant="ghost" onClick={() => setFormExpanded(false)}>
                    Cancel
                  </Button>
                )}
              </div>
              {saveTrait.error && (
                <p className="text-sm text-destructive">{saveTrait.error.message}</p>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p>
                <span className="text-muted-foreground">Name:</span> {editing.name}
              </p>
              {editing.description && (
                <p>
                  <span className="text-muted-foreground">Description:</span> {editing.description}
                </p>
              )}
            </div>
          )}
        </section>

        {editing.id && (
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Label Ranges</h2>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Label
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Min
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Max
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {labelRanges?.map((r: NonNullable<typeof labelRanges>[number]) =>
                  editingRangeId === r.id ? (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <Input
                          value={editingRange.label}
                          onChange={(e) => setEditingRange({ ...editingRange, label: e.target.value })}
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editingRange.minValue}
                          onChange={(e) => setEditingRange({ ...editingRange, minValue: e.target.value })}
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editingRange.maxValue}
                          onChange={(e) => setEditingRange({ ...editingRange, maxValue: e.target.value })}
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <Button
                          size="sm"
                          onClick={() => submitEditRange(r.id)}
                          disabled={saveLabelRange.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingRangeId(null)
                            setEditingRange(emptyRange())
                          }}
                        >
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground">{r.label}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.minValue}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.maxValue}</td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingRangeId(r.id)
                            setEditingRange({
                              label: r.label,
                              minValue: r.minValue.toString(),
                              maxValue: r.maxValue.toString(),
                            })
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeLabelRange.mutate({ id: r.id })}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  )
                )}
                <tr>
                  <td className="px-4 py-3">
                    <Input
                      value={newRange.label}
                      onChange={(e) => setNewRange({ ...newRange, label: e.target.value })}
                      placeholder="e.g. Timid"
                      onKeyDown={(e) => e.key === "Enter" && submitNewRange()}
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      step="0.01"
                      value={newRange.minValue}
                      onChange={(e) => setNewRange({ ...newRange, minValue: e.target.value })}
                      placeholder="0"
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      step="0.01"
                      value={newRange.maxValue}
                      onChange={(e) => setNewRange({ ...newRange, maxValue: e.target.value })}
                      placeholder="0"
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      onClick={submitNewRange}
                      disabled={
                        saveLabelRange.isPending ||
                        !newRange.label.trim() ||
                        !newRange.minValue ||
                        !newRange.maxValue
                      }
                    >
                      Add
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeTrait.error && (
              <p className="text-sm text-destructive">{removeTrait.error.message}</p>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this personality trait? This will remove it from all breed profiles.")) return
                removeTrait.mutate({ id: editing.id! })
              }}
              disabled={removeTrait.isPending}
            >
              Delete Trait
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Personality Traits</h1>
        <Button
          onClick={() => {
            setEditing(emptyTrait())
            setFormExpanded(true)
          }}
        >
          + New Trait
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Label Ranges
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {traits?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{t._count.labelRanges}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {traits?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No personality traits yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/personality-traits")({
  component: PersonalityTraitsPage,
})
