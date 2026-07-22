import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/system")({
  component: OpsSystem,
})

function OpsSystem() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: logs } = trpc.admin.ops.system.recentLogs.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  const { data: shopStatus } = trpc.admin.ops.system.shopStatus.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">System</h1>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Game Shop Stock</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Breed</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Target Stock</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Current Stock</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {shopStatus?.map(config => {
                const current = config._count.shopAnimals
                const below = current < config.targetStock
                return (
                  <tr key={config.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{config.breed.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{config.targetStock}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{current}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        below ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" : "bg-chart-2/10 text-chart-2"
                      )}>
                        {below ? "Low" : "OK"}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!shopStatus?.length && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No shop configs.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nightly Update History</h2>
        <div className="space-y-2">
          {logs?.map(log => (
            <div
              key={log.id}
              className={cn(
                "rounded-lg border p-4",
                log.success ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", log.success ? "text-foreground" : "text-destructive")}>
                      {log.success ? "Success" : "Failed"}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(log.startedAt).toLocaleString()}</span>
                    {log.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        ({Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s)
                      </span>
                    )}
                  </div>
                  {log.errorMessage && (
                    <p className="rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">{log.errorMessage}</p>
                  )}
                </div>
                {log.success && (
                  <div className="shrink-0 grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><span className="font-semibold tabular-nums text-foreground">{log.animalsAged}</span> aged</span>
                    <span><span className="font-semibold tabular-nums text-foreground">{log.animalDeaths}</span> deaths</span>
                    <span><span className="font-semibold tabular-nums text-foreground">{log.lifeStageTransitions}</span> transitions</span>
                    <span><span className="font-semibold tabular-nums text-foreground">{log.storeRotationsProcessed}</span> rotations</span>
                    <span><span className="font-semibold tabular-nums text-foreground">{log.rafflesDrawn}</span> raffles</span>
                    <span><span className="font-semibold tabular-nums text-foreground">{log.seasonRewardsDistributed}</span> prizes</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!logs?.length && (
            <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">No nightly updates yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
