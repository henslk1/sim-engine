import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/directory/personality")({
  component: PersonalityDirectoryPage,
})

type LabelRange = {
  id: string
  label: string
  minValue: number
  maxValue: number
  trainingModifier: number
  moodModifier: number
  conceptionModifier: number
}

type Trait = {
  id: string
  name: string
  description: string | null
  labelRanges: LabelRange[]
}

function fmtMod(val: number): { text: string; cls: string } | null {
  if (val === 0) return null
  const pct = Math.round(val * 100)
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    cls: pct > 0 ? "text-chart-2" : "text-destructive",
  }
}

function ModChip({ label, value }: { label: string; value: number }) {
  const fmt = fmtMod(value)
  if (!fmt) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", fmt.cls)}>{fmt.text}</span>
    </span>
  )
}

function TraitCard({ trait }: { trait: Trait }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3">
      <div>
        <h2 className="font-serif text-base font-semibold text-foreground">{trait.name}</h2>
        {trait.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{trait.description}</p>
        )}
      </div>

      {trait.labelRanges.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                <th className="pb-1.5 pr-4 font-medium">Label</th>
                <th className="pb-1.5 pr-4 font-medium tabular-nums">Range</th>
                <th className="pb-1.5 font-medium">Modifiers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {trait.labelRanges.map(r => (
                <tr key={r.id} className="align-middle">
                  <td className="py-1.5 pr-4 font-medium text-foreground">{r.label}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground tabular-nums">
                    {r.minValue}–{r.maxValue}
                  </td>
                  <td className="py-1.5">
                    <div className="flex flex-wrap gap-2.5">
                      <ModChip label="Training" value={r.trainingModifier} />
                      <ModChip label="Mood" value={r.moodModifier} />
                      <ModChip label="Conception" value={r.conceptionModifier} />
                      {r.trainingModifier === 0 && r.moodModifier === 0 && r.conceptionModifier === 0 && (
                        <span className="text-[10px] text-muted-foreground/50 italic">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trait.labelRanges.length === 0 && (
        <p className="text-[11px] text-muted-foreground/50 italic">No label ranges configured.</p>
      )}
    </div>
  )
}

function PersonalityDirectoryPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const { data: traits = [], isLoading } = trpc.directory.listPersonality.useQuery(
    { gameId },
    { enabled: !!gameId }
  )

  const [search, setSearch] = useState("")

  const filtered = traits.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link to="/directory" className="text-sm text-muted-foreground hover:text-foreground">← Directories</Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Personality Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each personality trait your animal can express, and how each label range affects training, mood, and breeding.
        </p>
      </div>

      <div className="mb-5">
        <input
          type="search"
          placeholder="Search traits..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card py-1.5 pl-3 pr-3 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-border bg-card animate-pulse" />)}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(t => <TraitCard key={t.id} trait={t} />)}
        {!isLoading && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No traits found.</p>
        )}
      </div>
    </div>
  )
}
