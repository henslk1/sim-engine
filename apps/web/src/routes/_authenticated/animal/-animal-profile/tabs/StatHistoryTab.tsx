import type { RouterOutputs } from "@/lib/trpc"

export function StatHistoryTab({
  data,
  isLoading,
}: {
  data: RouterOutputs["animalProfile"]["getStatHistory"] | undefined
  isLoading: boolean
}) {
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Loading…</p>
  if (!data || data.length === 0)
    return <p className="text-[11px] text-muted-foreground">No stat history recorded yet.</p>

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Stat</th>
            <th className="px-2 py-1 text-right font-medium">Innate</th>
            <th className="px-2 py-1 text-right font-medium">Trained</th>
            <th className="px-2 py-1 text-right font-medium">Cycle</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h: RouterOutputs["animalProfile"]["getStatHistory"][number]) => (
            <tr key={h.id} className="border-t border-border/60">
              <td className="px-2 py-1 font-medium text-foreground">{h.statDef.name}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{Math.round(h.innateValue)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-foreground">{Math.round(h.trainedValue)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{h.cycleNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
