import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { RichTextRenderer } from "@/components/game/editor/RichTextRenderer"
import { formatCoatPhenotype } from "@/lib/breedUtils"

export const Route = createFileRoute("/_authenticated/directory/color")({
  component: ColorDirectoryPage,
})

type LocusEntry = {
  id: string
  name: string
  description: unknown
  expressionRules: Array<{
    id: string
    phenotype: string
    alleleOne: { symbol: string }
    alleleTwo: { symbol: string }
    ruleConditions: Array<{
      healthConditionDef: { id: string; name: string }
    }>
  }>
}
type Rule = LocusEntry["expressionRules"][number]

function LinkedConditions({ conditions }: { conditions: Rule["ruleConditions"] }) {
  if (conditions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {conditions.map(rc => (
        <Link
          key={rc.healthConditionDef.id}
          to="/directory/diseases"
          hash={rc.healthConditionDef.id}
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
        >
          ⚠ {rc.healthConditionDef.name}
        </Link>
      ))}
    </div>
  )
}

function ColorCard({ locus }: { locus: LocusEntry }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-4">
      <h2 className="font-serif text-base font-semibold text-foreground">{locus.name}</h2>

      {locus.description ? (
        <RichTextRenderer content={locus.description as object} className="text-sm" />
      ) : (
        <p className="text-[11px] text-muted-foreground/50 italic">No description available.</p>
      )}

      {locus.expressionRules.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Genotypes</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-20">Genotype</th>
                <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Phenotype</th>
              </tr>
            </thead>
            <tbody>
              {locus.expressionRules.map(rule => (
                <tr key={rule.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {rule.alleleOne.symbol}/{rule.alleleTwo.symbol}
                  </td>
                  <td className="py-2">
                    <span className="text-foreground">{formatCoatPhenotype(rule.phenotype)}</span>
                    <LinkedConditions conditions={rule.ruleConditions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ColorDirectoryPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""

  const locusQuery = trpc.directory.listColor.useQuery(
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
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Coat Color Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Genotype combinations and their expressed coat color phenotypes. Health risks are flagged where applicable.
        </p>
      </div>

      <div className="mb-5">
        <input
          type="search"
          placeholder="Search color loci..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card py-1.5 pl-3 pr-3 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-lg border border-border bg-card animate-pulse" />)}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(l => <ColorCard key={l.id} locus={l} />)}
        {!isLoading && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No color loci match your search.</p>
        )}
      </div>
    </div>
  )
}
