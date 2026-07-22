import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/integrity")({
  component: OpsIntegrity,
})

type IntegrityTab = "ip" | "fingerprints" | "transfers"

function OpsIntegrity() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const [tab, setTab] = useState<IntegrityTab>("ip")
  const [minAccounts, setMinAccounts] = useState(2)
  const [transferThreshold, setTransferThreshold] = useState(10)
  const [hoursBack, setHoursBack] = useState(24)

  const { data: sharedIps } = trpc.admin.ops.integrity.sharedIps.useQuery(
    { gameId: gameId!, minAccounts },
    { enabled: !!gameId && tab === "ip" },
  )

  const { data: sharedFps } = trpc.admin.ops.integrity.sharedFingerprints.useQuery(
    { gameId: gameId!, minAccounts },
    { enabled: !!gameId && tab === "fingerprints" },
  )

  const { data: excessiveTransfers } = trpc.admin.ops.integrity.excessiveTransfers.useQuery(
    { gameId: gameId!, threshold: transferThreshold, hoursBack },
    { enabled: !!gameId && tab === "transfers" },
  )

  if (!gameId) return <div className="p-6 text-sm text-muted-foreground">No game found.</div>

  const TABS: { key: IntegrityTab; label: string }[] = [
    { key: "ip", label: "Shared IPs" },
    { key: "fingerprints", label: "Device Fingerprints" },
    { key: "transfers", label: "Excessive Transfers" },
  ]

  return (
    <div className="space-y-4 p-6">
      <h1 className="font-serif text-xl font-semibold text-foreground">Integrity Tools</h1>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "ip" || tab === "fingerprints") && (
        <div className="flex items-center gap-3 text-sm">
          <label className="text-muted-foreground">Min accounts sharing:</label>
          <input
            type="number"
            min={2}
            max={20}
            value={minAccounts}
            onChange={e => setMinAccounts(parseInt(e.target.value) || 2)}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </div>
      )}

      {tab === "transfers" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="text-muted-foreground">Min transfers:</label>
          <input
            type="number"
            min={1}
            value={transferThreshold}
            onChange={e => setTransferThreshold(parseInt(e.target.value) || 10)}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
          <label className="text-muted-foreground">Hours back:</label>
          <input
            type="number"
            min={1}
            max={168}
            value={hoursBack}
            onChange={e => setHoursBack(parseInt(e.target.value) || 24)}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </div>
      )}

      {tab === "ip" && (
        <div className="space-y-3">
          {sharedIps?.map(group => (
            <div key={group.ipAddress} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{group.ipAddress}</span>
                <span className="text-xs text-muted-foreground">{group.count} accounts</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.users.map(u => (
                  u.user.playerAccounts[0] ? (
                    <Link
                      key={u.userId}
                      to="/admin/users/$playerId"
                      params={{ playerId: u.user.playerAccounts[0].id }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
                    >
                      {u.user.playerAccounts[0].username}
                      <span className="ml-1 text-muted-foreground">({u.user.email})</span>
                    </Link>
                  ) : null
                ))}
              </div>
            </div>
          ))}
          {sharedIps?.length === 0 && (
            <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">No shared IPs found with ≥{minAccounts} accounts.</p>
          )}
        </div>
      )}

      {tab === "fingerprints" && (
        <div className="space-y-3">
          {sharedFps?.map(group => (
            <div key={group.fingerprintHash} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="truncate font-mono text-xs font-semibold text-muted-foreground">{group.fingerprintHash}</span>
                <span className="ml-4 shrink-0 text-xs text-muted-foreground">{group.count} accounts</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.users.map(u => (
                  u.user.playerAccounts[0] ? (
                    <Link
                      key={u.userId}
                      to="/admin/users/$playerId"
                      params={{ playerId: u.user.playerAccounts[0].id }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
                    >
                      {u.user.playerAccounts[0].username}
                    </Link>
                  ) : null
                ))}
              </div>
            </div>
          ))}
          {sharedFps?.length === 0 && (
            <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">No shared fingerprints found.</p>
          )}
          {!sharedFps && tab === "fingerprints" && (
            <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">Device fingerprint logging starts once FingerprintJS is integrated on login.</p>
          )}
        </div>
      )}

      {tab === "transfers" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Player</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Transfer Count</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {excessiveTransfers?.map(row => (
                <tr key={row.playerAccountId} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{row.player?.username ?? row.playerAccountId}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{row.count}</td>
                  <td className="px-3 py-2 text-right">
                    {row.player && (
                      <Link
                        to="/admin/users/$playerId"
                        params={{ playerId: row.player.id }}
                        className="text-xs text-primary hover:underline"
                      >
                        View Profile
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {excessiveTransfers?.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No excessive transfers found in the last {hoursBack}h.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
