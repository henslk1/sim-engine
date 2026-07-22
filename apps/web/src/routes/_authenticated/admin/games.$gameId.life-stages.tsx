import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type StageForm = {
  id?: string
  name: string
  stageIndex: number
  minCycle: number
  maxCycle: number
  canCompete: boolean
  canBreed: boolean
  canSurrogate: boolean
  canTrain: boolean
  canReceiveCare: boolean
  hasUniqueActionSet: boolean
  profileLayout: string
  immunityCapMultiplier: number
  energyCostMultiplier: number
  deathChanceStartCycle: string
  deathChancePerCycle: string
}

const emptyForm: StageForm = {
  name: "",
  stageIndex: 0,
  minCycle: 0,
  maxCycle: 0,
  canCompete: false,
  canBreed: false,
  canSurrogate: false,
  canTrain: false,
  canReceiveCare: false,
  hasUniqueActionSet: false,
  profileLayout: "",
  immunityCapMultiplier: 1.0,
  energyCostMultiplier: 1,
  deathChanceStartCycle: "",
  deathChancePerCycle: "",
}

const checkboxFields: [keyof StageForm, string][] = [
  ["canCompete", "Can Compete"],
  ["canBreed", "Can Breed"],
  ["canSurrogate", "Can Surrogate"],
  ["canTrain", "Can Train"],
  ["canReceiveCare", "Can Receive Care"],
  ["hasUniqueActionSet", "Has Unique Action Set"],
]

function LifeStagePage() {
  const { gameId } = Route.useParams()

  const { data: stages } = trpc.admin.lifestage.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()
  const save = trpc.admin.lifestage.save.useMutation({
    onSuccess: () => {
      utils.admin.lifestage.list.invalidate()
      setEditing(null)
    },
  })
  const remove = trpc.admin.lifestage.remove.useMutation({
    onSuccess: () => utils.admin.lifestage.list.invalidate(),
  })

  const [editing, setEditing] = useState<StageForm | null>(null)

  function startEdit(stage: NonNullable<typeof stages>[number]) {
    setEditing({
      id: stage.id,
      name: stage.name,
      stageIndex: stage.stageIndex,
      minCycle: stage.minCycle,
      maxCycle: stage.ageCap,
      canCompete: stage.canCompete,
      canBreed: stage.canBreed,
      canSurrogate: stage.canSurrogate,
      canTrain: stage.canTrain,
      canReceiveCare: stage.canReceiveCare,
      hasUniqueActionSet: stage.hasUniqueActionSet,
      profileLayout: stage.profileLayout,
      immunityCapMultiplier: stage.immunityCapMultiplier,
      energyCostMultiplier: stage.energyCostMultiplier,
      deathChanceStartCycle: stage.deathChanceStartCycle?.toString() ?? "",
      deathChancePerCycle: stage.deathChancePerCycle?.toString() ?? "",
    })
  }

  function startAdd() {
    setEditing({ ...emptyForm })
  }

  function handleRemove(id: string) {
    if (!confirm("Delete this life stage? Animals assigned to it will lose their stage")) return
    remove.mutate({ id })
  }

  function handleSave() {
    if (!editing || !gameId) return
    const { maxCycle, deathChanceStartCycle, deathChancePerCycle, ...rest } = editing
    save.mutate({
      ...rest,
      gameId,
      ageCap: maxCycle,
      deathChanceStartCycle: deathChanceStartCycle !== "" ? parseInt(deathChanceStartCycle) : null,
      deathChancePerCycle: deathChancePerCycle !== "" ? parseFloat(deathChancePerCycle) : null,
    })
  }

  function update(field: keyof StageForm, value: string | number | boolean) {
    setEditing((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  if (editing) {
    return (
      <div className="p-4 space-y-3 max-w-4xl mx-auto">
        <h1 className="font-serif text-xl font-semibold text-foreground">
          {editing.id ? "Edit Life Stage" : "Add Life Stage"}
        </h1>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stage Details</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                  <Input className="h-8 text-sm" value={editing.name} onChange={(e) => update("name", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stage Index</label>
                  <Input className="h-8 text-sm" type="number" value={editing.stageIndex} onChange={(e) => update("stageIndex", parseInt(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min Cycle</label>
                  <Input className="h-8 text-sm" type="number" value={editing.minCycle} onChange={(e) => update("minCycle", parseInt(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Max Cycle</label>
                  <Input className="h-8 text-sm" type="number" value={editing.maxCycle} onChange={(e) => update("maxCycle", parseInt(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Profile Layout</label>
                  <Input className="h-8 text-sm" value={editing.profileLayout} onChange={(e) => update("profileLayout", e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Immunity Cap Multiplier</label>
                    <Input className="h-8 text-sm" type="number" step="0.01" min="0" max="1" value={editing.immunityCapMultiplier} onChange={(e) => update("immunityCapMultiplier", parseFloat(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Cost Multiplier</label>
                    <Input className="h-8 text-sm" type="number" step="0.05" min="0" value={editing.energyCostMultiplier} onChange={(e) => update("energyCostMultiplier", parseFloat(e.target.value))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Death Chance Start Cycle <span className="font-normal">(optional)</span></label>
                    <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.deathChanceStartCycle} onChange={(e) => update("deathChanceStartCycle", e.target.value)} placeholder="e.g. 120" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Death Chance Per Cycle <span className="font-normal">(optional)</span></label>
                    <Input className="h-8 text-sm" type="number" step="0.001" min="0" max="1" value={editing.deathChancePerCycle} onChange={(e) => update("deathChancePerCycle", e.target.value)} placeholder="e.g. 0.02" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Abilities</p>
                  <div className="grid grid-cols-2 gap-2">
                    {checkboxFields.map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
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
              </div>
            </div>
            {save.error && <p className="mt-3 text-sm text-destructive">{save.error.message}</p>}
            <div className="mt-4 flex gap-2">
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Life Stages</h1>
        <Button size="sm" onClick={startAdd}>Add Stage</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cycles</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compete</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breed</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Surrogate</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Train</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Care</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unique</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layout</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stages?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{s.stageIndex}</td>
                <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.minCycle}–{s.maxCycle}</td>
                <td className="px-3 py-2 text-center">{s.canCompete ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canBreed ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canSurrogate ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canTrain ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.canReceiveCare ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{s.hasUniqueActionSet ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.profileLayout}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">Delete</Button>
                </td>
              </tr>
            ))}
            {stages?.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">No life stages defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/life-stages")({
  component: LifeStagePage,
})
