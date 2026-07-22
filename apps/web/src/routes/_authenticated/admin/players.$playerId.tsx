import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/players/$playerId")({
  component: PlayerDetail,
})

function PlayerDetail() {
  const { playerId } = Route.useParams()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data, refetch } = trpc.admin.ops.players.getById.useQuery({ playerAccountId: playerId })

  const grantMutation = trpc.admin.ops.players.grantCurrency.useMutation({ onSuccess: () => refetch() })
  const warnMutation = trpc.admin.ops.players.issueWarning.useMutation({ onSuccess: () => refetch() })
  const banMutation = trpc.admin.ops.players.ban.useMutation({ onSuccess: () => refetch() })
  const noteMutation = trpc.admin.ops.players.addNote.useMutation({ onSuccess: () => refetch() })
  const deleteNoteMutation = trpc.admin.ops.players.deleteNote.useMutation({ onSuccess: () => refetch() })
  const bypassMutation = trpc.admin.ops.players.bypassGates.useMutation({ onSuccess: () => refetch() })
  const resetNameMutation = trpc.admin.ops.players.resetAnimalName.useMutation({ onSuccess: () => refetch() })

  const [tab, setTab] = useState<"overview" | "transactions" | "logs" | "notes" | "actions">("overview")

  // action form state
  const [grantAmount, setGrantAmount] = useState("")
  const [grantCurrencyId, setGrantCurrencyId] = useState("")
  const [grantReason, setGrantReason] = useState("")
  const [warnReason, setWarnReason] = useState("")
  const [warnType, setWarnType] = useState<"VERBAL" | "FORMAL" | "FINAL">("VERBAL")
  const [banReason, setBanReason] = useState("")
  const [banExpiry, setBanExpiry] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [resetAnimalId, setResetAnimalId] = useState("")
  const [resetAnimalName, setResetAnimalName] = useState("")

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const { player, recentTransactions, reportsAgainst } = data
  const activeBan = player.user.banRecords.find(b => !b.expiresAt || new Date(b.expiresAt) > new Date())
  const staffRoles = player.user.staffRoles

  const TABS = ["overview", "transactions", "logs", "notes", "actions"] as const

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">{player.username}</h1>
          <p className="text-sm text-muted-foreground">{player.user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeBan && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">BANNED</span>}
          {staffRoles.map(r => (
            <span key={r.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{r.role}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-sm font-medium capitalize transition-colors",
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoCard title="Account">
            <Row label="Player ID" value={player.id} mono />
            <Row label="User ID" value={player.user.id} mono />
            <Row label="Joined" value={new Date(player.createdAt).toLocaleString()} />
            <Row label="Active Days" value={String(player.seniority?.activeDaysPlayed ?? 0)} />
            <Row label="Tutorial" value={player.seniority?.tutorialCompleted ? "Complete" : "Incomplete"} />
            <Row label="Gates Bypassed" value={player.seniority?.gatesBypassesd ? "Yes" : "No"} />
            <Row label="Animals" value={String(player._count.animalsOwned)} />
            <Row label="Reports Against" value={String(reportsAgainst)} />
          </InfoCard>

          <InfoCard title="Balances">
            {player.playerBalances.map(b => (
              <Row key={b.currencyDef.id} label={b.currencyDef.name} value={`${b.currencyDef.symbol ?? ""}${b.balance.toLocaleString()}`} />
            ))}
            {player.playerBalances.length === 0 && <p className="text-sm text-muted-foreground">No balances.</p>}
          </InfoCard>

          {activeBan && (
            <InfoCard title="Active Ban">
              <Row label="Reason" value={activeBan.reason} />
              <Row label="Banned" value={new Date(activeBan.bannedAt).toLocaleString()} />
              <Row label="Expires" value={activeBan.expiresAt ? new Date(activeBan.expiresAt).toLocaleString() : "Permanent"} />
            </InfoCard>
          )}

          {player.warnings.length > 0 && (
            <InfoCard title="Warnings">
              {player.warnings.map(w => (
                <div key={w.id} className="text-sm">
                  <span className={cn(
                    "mr-2 rounded px-1.5 py-0.5 text-xs font-semibold",
                    w.warningType === "FINAL" ? "bg-destructive/10 text-destructive" :
                    w.warningType === "FORMAL" ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {w.warningType}
                  </span>
                  {w.reason}
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </InfoCard>
          )}

          {player.supportTickets.length > 0 && (
            <InfoCard title="Recent Support Tickets">
              {player.supportTickets.map(t => (
                <Row key={t.id} label={t.subject} value={t.status} />
              ))}
            </InfoCard>
          )}
        </div>
      )}

      {tab === "transactions" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">From</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">To</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map(t => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{t.txnType}</td>
                  <td className="px-3 py-2 tabular-nums">{t.currencyDef.symbol}{t.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.fromPlayerAccount?.username ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.toPlayerAccount?.username ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {recentTransactions.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No transactions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-4">
          <InfoCard title="IP Log">
            <div className="space-y-1">
              {player.user.userIpLogs.map(log => (
                <div key={log.id} className="flex justify-between text-sm">
                  <span className="font-mono text-xs">{log.ipAddress}</span>
                  <span className="text-xs text-muted-foreground">{new Date(log.seenAt).toLocaleString()}</span>
                </div>
              ))}
              {player.user.userIpLogs.length === 0 && <p className="text-sm text-muted-foreground">No IP logs.</p>}
            </div>
          </InfoCard>
          <InfoCard title="Device Fingerprint Log">
            <div className="space-y-1">
              {player.user.userDeviceLogs.map(log => (
                <div key={log.id} className="flex justify-between text-sm">
                  <span className="font-mono text-xs truncate">{log.fingerprintHash}</span>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">{new Date(log.seenAt).toLocaleString()}</span>
                </div>
              ))}
              {player.user.userDeviceLogs.length === 0 && <p className="text-sm text-muted-foreground">No device logs yet.</p>}
            </div>
          </InfoCard>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <textarea
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              placeholder="Add a private staff note…"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
            <button
              onClick={() => {
                if (!gameData?.id || !noteBody.trim()) return
                noteMutation.mutate({ playerAccountId: playerId, authorUserId: "CURRENT_USER", body: noteBody })
                setNoteBody("")
              }}
              disabled={!noteBody.trim() || noteMutation.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add Note
            </button>
          </div>
          <div className="space-y-2">
            {player.staffNotes.map(n => (
              <div key={n.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">{n.author.name ?? n.author.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => deleteNoteMutation.mutate({ noteId: n.id })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-1 text-sm">{n.body}</p>
              </div>
            ))}
            {player.staffNotes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
          </div>
        </div>
      )}

      {tab === "actions" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActionCard title="Grant / Deduct Currency">
            <select
              value={grantCurrencyId}
              onChange={e => setGrantCurrencyId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Select currency…</option>
              {player.playerBalances.map(b => (
                <option key={b.currencyDef.id} value={b.currencyDef.id}>{b.currencyDef.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={grantAmount}
              onChange={e => setGrantAmount(e.target.value)}
              placeholder="Amount (negative to deduct)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={grantReason}
              onChange={e => setGrantReason(e.target.value)}
              placeholder="Reason"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => grantMutation.mutate({ playerAccountId: playerId, currencyDefId: grantCurrencyId, amount: parseInt(grantAmount), reason: grantReason, staffUserId: "CURRENT_USER" })}
              disabled={!grantCurrencyId || !grantAmount || !grantReason || grantMutation.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Apply
            </button>
          </ActionCard>

          <ActionCard title="Issue Warning">
            <select
              value={warnType}
              onChange={e => setWarnType(e.target.value as typeof warnType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="VERBAL">Verbal</option>
              <option value="FORMAL">Formal</option>
              <option value="FINAL">Final</option>
            </select>
            <textarea
              value={warnReason}
              onChange={e => setWarnReason(e.target.value)}
              placeholder="Reason"
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
            <button
              onClick={() => warnMutation.mutate({ playerAccountId: playerId, issuedByUserId: "CURRENT_USER", reason: warnReason, warningType: warnType })}
              disabled={!warnReason || warnMutation.isPending}
              className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Issue Warning
            </button>
          </ActionCard>

          <ActionCard title="Ban Player">
            <input
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="Reason"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Expires at (leave blank for permanent)</label>
              <input
                type="datetime-local"
                value={banExpiry}
                onChange={e => setBanExpiry(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => banMutation.mutate({ userId: player.user.id, bannedByUserId: "CURRENT_USER", reason: banReason, expiresAt: banExpiry || undefined, gameId: player.gameId })}
              disabled={!banReason || banMutation.isPending}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              {banExpiry ? "Temp Ban" : "Permanent Ban"}
            </button>
          </ActionCard>

          <ActionCard title="Other Actions">
            <button
              onClick={() => bypassMutation.mutate({ playerAccountId: playerId, staffUserId: "CURRENT_USER" })}
              disabled={player.seniority?.gatesBypassesd || bypassMutation.isPending}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {player.seniority?.gatesBypassesd ? "Gates Already Bypassed" : "Bypass Seniority Gates"}
            </button>
            <div className="flex gap-2">
              <input
                value={resetAnimalId}
                onChange={e => setResetAnimalId(e.target.value)}
                placeholder="Animal ID"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                value={resetAnimalName}
                onChange={e => setResetAnimalName(e.target.value)}
                placeholder="New name"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => resetNameMutation.mutate({ animalId: resetAnimalId, newName: resetAnimalName, staffUserId: "CURRENT_USER", gameId: player.gameId })}
              disabled={!resetAnimalId || !resetAnimalName || resetNameMutation.isPending}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Reset Animal Name
            </button>
          </ActionCard>
        </div>
      )}
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ActionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right break-all", mono && "font-mono text-xs")}>{value}</span>
    </div>
  )
}
