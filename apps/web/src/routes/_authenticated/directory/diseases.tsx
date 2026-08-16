import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { RichTextRenderer } from "@/components/game/editor/RichTextRenderer"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/directory/diseases")({
  component: DiseaseDirectoryPage,
})

type Disease = RouterOutputs["directory"]["listDiseases"][number]

function formatOnsetAge(cycle: number, cpy: number): string {
  const y = Math.floor(cycle / cpy)
  const m = cycle % cpy
  if (y === 0) return `${m}mo`
  if (m === 0) return `${y}yr`
  return `${y}yr ${m}mo`
}

function conditionTags(d: Disease) {
  const tags: { label: string; color: string }[] = []
  tags.push({ label: d.conditionType === "INJURY" ? "Injury" : "Illness", color: "bg-secondary/60 text-secondary-foreground" })
  if (d.isGenetic) tags.push({ label: "Genetic", color: "bg-chart-3/15 text-chart-3" })
  if (d.isFatal) tags.push({ label: "Fatal", color: "bg-destructive/15 text-destructive" })
  if (d.isGenetic && d.isEpisodic) tags.push({ label: "Episodic", color: "bg-chart-1/15 text-chart-1" })
  if (d.isGenetic && !d.isEpisodic) tags.push({ label: "Chronic", color: "bg-chart-4/15 text-chart-4" })
  return tags
}

function DiseaseCard({ disease, cyclesPerYear }: { disease: Disease; cyclesPerYear: number }) {
  const tags = conditionTags(disease)

  return (
    <div id={disease.id} className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3 scroll-mt-24">
      <div className="flex flex-wrap items-start gap-3">
        <h2 className="font-serif text-base font-semibold text-foreground">{disease.name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {tags.map(t => (
            <span key={t.label} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", t.color)}>{t.label}</span>
          ))}
        </div>
      </div>

      {disease.onsetMinCycle != null && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground/70">Age of onset:</span>{" "}
          {formatOnsetAge(disease.onsetMinCycle, cyclesPerYear)} or later
        </p>
      )}

      {disease.description ? (
        <RichTextRenderer content={disease.description as object} className="text-sm" />
      ) : (
        <p className="text-[11px] text-muted-foreground/50 italic">No description available.</p>
      )}
    </div>
  )
}

function DiseaseDirectoryPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""
  const cyclesPerYear = gameData?.gameConfig?.cyclesPerYear ?? 12

  const { data: diseases, isLoading } = trpc.directory.listDiseases.useQuery(
    { gameId },
    { enabled: !!gameId }
  )

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"" | "ILLNESS" | "INJURY">("")
  const [geneticFilter, setGeneticFilter] = useState<"" | "genetic" | "non-genetic">("")

  const filtered = (diseases ?? []).filter(d => {
    if (typeFilter && d.conditionType !== typeFilter) return false
    if (geneticFilter === "genetic" && !d.isGenetic) return false
    if (geneticFilter === "non-genetic" && d.isGenetic) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const selectClass = "rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link to="/directory" className="text-sm text-muted-foreground hover:text-foreground">← Directories</Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Disease Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reference guide for health conditions your animals may develop.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2.5">
        <input
          type="search"
          placeholder="Search conditions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card py-1.5 pl-3 pr-3 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className={selectClass}>
          <option value="">All types</option>
          <option value="ILLNESS">Illness</option>
          <option value="INJURY">Injury</option>
        </select>
        <select value={geneticFilter} onChange={e => setGeneticFilter(e.target.value as typeof geneticFilter)} className={selectClass}>
          <option value="">All conditions</option>
          <option value="genetic">Genetic only</option>
          <option value="non-genetic">Non-genetic only</option>
        </select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-border bg-card animate-pulse" />)}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(d => <DiseaseCard key={d.id} disease={d} cyclesPerYear={cyclesPerYear} />)}
        {!isLoading && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No conditions match your filters.</p>
        )}
      </div>
    </div>
  )
}
