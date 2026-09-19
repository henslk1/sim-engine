import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { RichTextRenderer } from "@/components/game/editor/RichTextRenderer"

export const Route = createFileRoute("/_authenticated/directory/conformation")({
  component: ConformationDirectoryPage,
})

type LocusEntry = {
  id: string
  name: string
  minTestCycle: number | null
  description: unknown
  expressionRules: Array<{ phenotype: string }>
}

function ConformationCard({ locus }: { locus: LocusEntry }) {
  const phenotypes = [...new Set(locus.expressionRules.map(r => r.phenotype))].sort()

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-base font-semibold text-foreground">{locus.name}</h2>
        {locus.minTestCycle != null && (
          <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            Min. testing age: Cycle {locus.minTestCycle}
          </span>
        )}
      </div>

      {locus.description ? (
        <RichTextRenderer content={locus.description as object} className="text-sm" />
      ) : (
        <p className="text-[11px] text-muted-foreground/50 italic">No description available.</p>
      )}

      {phenotypes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Phenotypes</p>
          <div className="flex flex-wrap gap-1.5">
            {phenotypes.map(p => (
              <span key={p} className="rounded-md bg-secondary/50 px-2 py-0.5 text-xs text-foreground">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConformationDirectoryPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const locusQuery = trpc.directory.listConformation.useQuery(
    { gameId },
    { enabled: !!gameId }
  ) as { data: LocusEntry[] | undefined; isLoading: boolean }
  const { data: loci, isLoading } = locusQuery

  const [search, setSearch] = useState("")

  const filtered = (loci ?? []).filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link to="/directory" className="text-sm text-muted-foreground hover:text-foreground">← Directories</Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Conformation Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reference for conformation traits — what each locus measures and what phenotypes are possible.
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
        {filtered.map(l => <ConformationCard key={l.id} locus={l} />)}
        {!isLoading && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No traits match your search.</p>
        )}
      </div>
    </div>
  )
}
