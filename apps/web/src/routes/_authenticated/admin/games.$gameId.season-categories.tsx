import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type SeasonForm = {
  id?: string
  name: string
  startsAt: string
  endsAt: string
  isActive: boolean
}
const emptySeasonForm = (): SeasonForm => ({ name: "", startsAt: "", endsAt: "", isActive: false })

type CategoryForm = {
  name: string
  categoryType: string
  breedId: string
  disciplineDefId: string
}
const emptyCategoryForm = (): CategoryForm => ({ name: "", categoryType: "OVERALL", breedId: "", disciplineDefId: "" })

const CATEGORY_TYPE_LABELS: Record<string, string> = {
  OVERALL: "Overall",
  PER_BREED: "Per Breed",
  PER_DISCIPLINE: "Per Discipline",
}

function SeasonCategoriesPage() {
  const { gameId } = Route.useParams()

  const { data: seasons } = trpc.admin.season.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: breeds } = trpc.admin.breed.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: disciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()

  const saveSeason = trpc.admin.season.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.season.list.invalidate()
      setSeasonForm((prev) => (prev ? { ...prev, id: saved.id } : null))
      setSeasonFormExpanded(false)
    },
  })
  const removeSeason = trpc.admin.season.remove.useMutation({
    onSuccess: () => {
      utils.admin.season.list.invalidate()
      setSeasonForm(null)
    },
  })

  const [seasonForm, setSeasonForm] = useState<SeasonForm | null>(null)
  const [seasonFormExpanded, setSeasonFormExpanded] = useState(false)

  const { data: categories } = trpc.admin.season.listCategories.useQuery(
    { seasonId: seasonForm?.id! },
    { enabled: !!seasonForm?.id }
  )

  const saveCategory = trpc.admin.season.saveCategory.useMutation({
    onSuccess: () => {
      utils.admin.season.listCategories.invalidate({ seasonId: seasonForm?.id })
      setCategoryEditingId(null)
      setCategoryForm(null)
    },
  })
  const removeCategory = trpc.admin.season.removeCategory.useMutation({
    onSuccess: () => {
      utils.admin.season.listCategories.invalidate({ seasonId: seasonForm?.id })
    },
  })

  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null)

  function openSeason(s: NonNullable<typeof seasons>[number]) {
    setSeasonForm({
      id: s.id,
      name: s.name,
      startsAt: String(s.startsAt).slice(0, 10),
      endsAt: String(s.endsAt).slice(0, 10),
      isActive: s.isActive,
    })
    setSeasonFormExpanded(false)
    setCategoryEditingId(null)
    setCategoryForm(null)
  }

  function submitSeason() {
    if (!seasonForm || !gameId || !seasonForm.name.trim() || !seasonForm.startsAt || !seasonForm.endsAt) return
    saveSeason.mutate({
      id: seasonForm.id,
      gameId,
      name: seasonForm.name,
      startsAt: seasonForm.startsAt,
      endsAt: seasonForm.endsAt,
      isActive: seasonForm.isActive,
    })
  }

  function submitCategory() {
    if (!categoryForm || !seasonForm?.id || !categoryForm.name.trim()) return
    saveCategory.mutate({
      id: categoryEditingId ?? undefined,
      seasonId: seasonForm.id,
      name: categoryForm.name,
      categoryType: categoryForm.categoryType as "OVERALL" | "PER_BREED" | "PER_DISCIPLINE",
      breedId: categoryForm.categoryType === "PER_BREED" ? categoryForm.breedId || null : null,
      disciplineDefId: categoryForm.categoryType === "PER_DISCIPLINE" ? categoryForm.disciplineDefId || null : null,
    })
  }

  if (seasonForm !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSeasonForm(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {seasonForm.id ? seasonForm.name : "New Season"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Season Details</h2>
            {!seasonFormExpanded && seasonForm.id && (
              <Button size="sm" variant="ghost" onClick={() => setSeasonFormExpanded(true)}>
                Edit Details
              </Button>
            )}
          </header>
          {seasonFormExpanded || !seasonForm.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={seasonForm.name}
                  onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                  placeholder="e.g. Spring 2026"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Starts</label>
                  <Input
                    type="date"
                    value={seasonForm.startsAt}
                    onChange={(e) => setSeasonForm({ ...seasonForm, startsAt: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ends</label>
                  <Input
                    type="date"
                    value={seasonForm.endsAt}
                    onChange={(e) => setSeasonForm({ ...seasonForm, endsAt: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={seasonForm.isActive}
                  onChange={(e) => setSeasonForm({ ...seasonForm, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border border-input accent-primary"
                />
                <label htmlFor="isActive" className="text-sm text-foreground">Active</label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={submitSeason}
                  disabled={saveSeason.isPending || !seasonForm.name.trim() || !seasonForm.startsAt || !seasonForm.endsAt}
                >
                  Save
                </Button>
                {seasonForm.id && (
                  <Button variant="ghost" onClick={() => setSeasonFormExpanded(false)}>Cancel</Button>
                )}
              </div>
              {saveSeason.error && <p className="text-sm text-destructive">{saveSeason.error.message}</p>}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {seasonForm.name}</p>
              <p><span className="text-muted-foreground">Dates:</span> {seasonForm.startsAt} — {seasonForm.endsAt}</p>
              <p><span className="text-muted-foreground">Status:</span> {seasonForm.isActive ? "Active" : "Inactive"}</p>
            </div>
          )}
        </section>

        {seasonForm.id && (
          <>
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-foreground">Categories</h2>
                <Button size="sm" onClick={() => { setCategoryForm(emptyCategoryForm()); setCategoryEditingId(null) }}>
                  + Add Category
                </Button>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scoped To</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories?.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{CATEGORY_TYPE_LABELS[c.categoryType] ?? c.categoryType}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.breed?.name ?? c.disciplineDef?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setCategoryEditingId(c.id)
                          setCategoryForm({
                            name: c.name,
                            categoryType: c.categoryType,
                            breedId: c.breedId ?? "",
                            disciplineDefId: c.disciplineDefId ?? "",
                          })
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (!confirm("Delete this category? This will remove its rankings.")) return
                            removeCategory.mutate({ id: c.id })
                          }}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {categories?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {removeCategory.error && <p className="px-4 pb-3 text-sm text-destructive">{removeCategory.error.message}</p>}
            </section>

            {categoryForm !== null && (
              <section className="rounded-lg border border-border bg-card shadow-sm">
                <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-foreground">
                    {categoryEditingId ? "Edit Category" : "Add Category"}
                  </h2>
                </header>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Name</label>
                      <Input
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        placeholder="e.g. Overall, Dressage Rankings"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <select
                        value={categoryForm.categoryType}
                        onChange={(e) => setCategoryForm({ ...categoryForm, categoryType: e.target.value, breedId: "", disciplineDefId: "" })}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="OVERALL">Overall</option>
                        <option value="PER_BREED">Per Breed</option>
                        <option value="PER_DISCIPLINE">Per Discipline</option>
                      </select>
                    </div>
                  </div>
                  {categoryForm.categoryType === "PER_BREED" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Breed</label>
                      <select
                        value={categoryForm.breedId}
                        onChange={(e) => setCategoryForm({ ...categoryForm, breedId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Select breed —</option>
                        {breeds?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  {categoryForm.categoryType === "PER_DISCIPLINE" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Discipline</label>
                      <select
                        value={categoryForm.disciplineDefId}
                        onChange={(e) => setCategoryForm({ ...categoryForm, disciplineDefId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Select discipline —</option>
                        {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={submitCategory}
                      disabled={saveCategory.isPending || !categoryForm.name.trim()}
                    >
                      {categoryEditingId ? "Save" : "Add Category"}
                    </Button>
                    <Button variant="ghost" onClick={() => { setCategoryEditingId(null); setCategoryForm(null) }}>
                      Cancel
                    </Button>
                  </div>
                  {saveCategory.error && <p className="text-sm text-destructive">{saveCategory.error.message}</p>}
                </div>
              </section>
            )}

            <div className="flex items-center justify-end gap-3">
              {removeSeason.error && <p className="text-sm text-destructive">{removeSeason.error.message}</p>}
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (!confirm("Delete this season? This will remove all its categories and rankings.")) return
                  removeSeason.mutate({ id: seasonForm.id! })
                }}
                disabled={removeSeason.isPending}
              >
                Delete Season
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Season Categories</h1>
        <Button onClick={() => { setSeasonForm(emptySeasonForm()); setSeasonFormExpanded(true) }}>
          + New Season
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {String(s.startsAt).slice(0, 10)} — {String(s.endsAt).slice(0, 10)}
                </td>
                <td className="px-4 py-2 text-center text-muted-foreground">{s.isActive ? "✓" : "—"}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{s._count.categories}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openSeason(s)}>Edit</Button>
                </td>
              </tr>
            ))}
            {seasons?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No seasons yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/season-categories")({
  component: SeasonCategoriesPage,
})
