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
    },
  })
  const removeSeason = trpc.admin.season.remove.useMutation({
    onSuccess: () => {
      utils.admin.season.list.invalidate()
      setSeasonForm(null)
    },
  })

  const [seasonForm, setSeasonForm] = useState<SeasonForm | null>(null)

  const { data: categories } = trpc.admin.season.listCategories.useQuery(
    { seasonId: seasonForm?.id! },
    { enabled: !!seasonForm?.id }
  )

  const saveCategory = trpc.admin.season.saveCategory.useMutation({
    onSuccess: () => {
      utils.admin.season.listCategories.invalidate({ seasonId: seasonForm?.id })
      setCategoryEditingId(null)
      setCategoryForm(emptyCategoryForm())
    },
  })
  const removeCategory = trpc.admin.season.removeCategory.useMutation({
    onSuccess: () => {
      utils.admin.season.listCategories.invalidate({ seasonId: seasonForm?.id })
    },
  })

  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm())

  function openSeason(s: NonNullable<typeof seasons>[number]) {
    setSeasonForm({
      id: s.id,
      name: s.name,
      startsAt: String(s.startsAt).slice(0, 10),
      endsAt: String(s.endsAt).slice(0, 10),
      isActive: s.isActive,
    })
    setCategoryEditingId(null)
    setCategoryForm(emptyCategoryForm())
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

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Season Categories</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seasons</h2>
            <Button size="sm" variant="ghost" onClick={() => { setSeasonForm(emptySeasonForm()); setCategoryEditingId(null); setCategoryForm(emptyCategoryForm()) }}>
              + New
            </Button>
          </div>
          {seasons?.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">No seasons yet.</p>
          )}
          <ul className="divide-y divide-border">
            {seasons?.map((s) => (
              <li
                key={s.id}
                onClick={() => openSeason(s)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 ${seasonForm?.id === s.id ? "bg-muted/50" : ""}`}
              >
                <span className="text-sm font-medium text-foreground">{s.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {s.isActive ? "Active" : String(s.startsAt).slice(0, 4)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {seasonForm !== null ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {seasonForm.id ? "Season Details" : "New Season"}
                </h2>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                  <Input
                    value={seasonForm.name}
                    onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                    placeholder="e.g. Spring 2026"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Starts</label>
                    <Input
                      type="date"
                      value={seasonForm.startsAt}
                      onChange={(e) => setSeasonForm({ ...seasonForm, startsAt: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ends</label>
                    <Input
                      type="date"
                      value={seasonForm.endsAt}
                      onChange={(e) => setSeasonForm({ ...seasonForm, endsAt: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={seasonForm.isActive}
                    onChange={(e) => setSeasonForm({ ...seasonForm, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border border-input accent-primary"
                  />
                  <label htmlFor="isActive" className="text-sm text-foreground">Active</label>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={submitSeason}
                    disabled={saveSeason.isPending || !seasonForm.name.trim() || !seasonForm.startsAt || !seasonForm.endsAt}
                  >
                    Save
                  </Button>
                  {seasonForm.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this season? This will remove all its categories and rankings.")) return
                        removeSeason.mutate({ id: seasonForm.id! })
                      }}
                      disabled={removeSeason.isPending}
                    >
                      Delete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSeasonForm(null)}>
                    Cancel
                  </Button>
                </div>
                {saveSeason.error && <p className="text-sm text-destructive">{saveSeason.error.message}</p>}
                {removeSeason.error && <p className="text-sm text-destructive">{removeSeason.error.message}</p>}
              </div>
            </section>

            {seasonForm.id && (
              <div className="grid grid-cols-[1fr_300px] gap-4 items-start">
                <section className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Categories</h2>
                    <Button size="sm" variant="ghost" onClick={() => { setCategoryForm(emptyCategoryForm()); setCategoryEditingId(null) }}>
                      + Add
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scoped To</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories?.map((c) => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{CATEGORY_TYPE_LABELS[c.categoryType] ?? c.categoryType}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.breed?.name ?? c.disciplineDef?.name ?? "—"}</td>
                          <td className="px-3 py-2 text-right space-x-1">
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
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No categories yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {removeCategory.error && <p className="px-3 pb-3 text-sm text-destructive">{removeCategory.error.message}</p>}
                </section>

                <section className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {categoryEditingId ? "Edit Category" : "Add Category"}
                    </h2>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                      <Input
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        placeholder="e.g. Overall"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                      <select
                        value={categoryForm.categoryType}
                        onChange={(e) => setCategoryForm({ ...categoryForm, categoryType: e.target.value, breedId: "", disciplineDefId: "" })}
                        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="OVERALL">Overall</option>
                        <option value="PER_BREED">Per Breed</option>
                        <option value="PER_DISCIPLINE">Per Discipline</option>
                      </select>
                    </div>
                    {categoryForm.categoryType === "PER_BREED" && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Breed</label>
                        <select
                          value={categoryForm.breedId}
                          onChange={(e) => setCategoryForm({ ...categoryForm, breedId: e.target.value })}
                          className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">— Select breed —</option>
                          {breeds?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}
                    {categoryForm.categoryType === "PER_DISCIPLINE" && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Discipline</label>
                        <select
                          value={categoryForm.disciplineDefId}
                          onChange={(e) => setCategoryForm({ ...categoryForm, disciplineDefId: e.target.value })}
                          className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">— Select discipline —</option>
                          {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={submitCategory}
                        disabled={saveCategory.isPending || !categoryForm.name.trim()}
                      >
                        {categoryEditingId ? "Save" : "Add Category"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCategoryEditingId(null); setCategoryForm(emptyCategoryForm()) }}>
                        Cancel
                      </Button>
                    </div>
                    {saveCategory.error && <p className="text-sm text-destructive">{saveCategory.error.message}</p>}
                  </div>
                </section>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-12 text-center text-sm text-muted-foreground">
            Select a season or create a new one
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/season-categories")({
  component: SeasonCategoriesPage,
})
