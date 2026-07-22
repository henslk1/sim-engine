import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/economy")({
  component: OpsEconomy,
})

const TXN_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Purchase",
  PRIZE: "Prize",
  BREEDING_FEE: "Breeding Fee",
  COMPETITION_ENTRY: "Competition Entry",
  MARKETPLACE_SALE: "Marketplace Sale",
  MARKETPLACE_PURCHASE: "Marketplace Purchase",
  STORE_PURCHASE: "Store Purchase",
  CARE_FEE: "Care Fee",
  VET_SERVICE_FEE: "Vet Fee",
  ESCROW_HOLD: "Escrow Hold",
  ESCROW_RELEASE: "Escrow Release",
  ESCROW_REFUND: "Escrow Refund",
  CURRENCY_EXCHANGE: "Currency Exchange",
  RAFFLE_TICKET: "Raffle Ticket",
  GIFT: "Gift",
  SUBSCRIPTION: "Subscription",
  ADMIN_ADJUSTMENT: "Admin Adjustment",
  STUD_FEE: "Stud Fee",
  ENTRY_FEE_SHARE: "Entry Fee Share",
  GROUP_CONTRIBUTION: "Group Contribution",
  GROUP_TREASURY_PAYOUT: "Group Payout",
  GROUP_CARE_CHARGE: "Group Care Charge",
  GROUP_FEE_SHARE: "Group Fee Share",
}

function OpsEconomy() {
  const { gameId } = Route.useParams()
  const [txnTypeFilter, setTxnTypeFilter] = useState("")

  const { data: stats } = trpc.admin.ops.economy.stats.useQuery(
    { gameId: gameId! },
    {},
  )

  const { data: txnData, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.admin.ops.economy.transactions.useInfiniteQuery(
    { gameId: gameId!, txnType: txnTypeFilter || undefined, limit: 50 },
    { getNextPageParam: (last) => last.nextCursor },
  )

  const transactions = txnData?.pages.flatMap(p => p.txns) ?? []

  return (
    <div className="space-y-3 p-4 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Economy</h1>

      {stats && (
        <>
          <section>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Currency in Circulation</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.circulation.map(c => (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.name}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {c.symbol}{c.totalInCirculation.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.currencyType}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">7-Day Volume by Type</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transaction Type</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Count</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.dailyVolume.map(v => (
                    <tr key={v.txnType} className="border-t border-border">
                      <td className="px-3 py-2">{TXN_TYPE_LABELS[v.txnType] ?? v.txnType}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{v.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{v.total.toLocaleString()}</td>
                    </tr>
                  ))}
                  {stats.dailyVolume.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No transactions in the last 7 days.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transaction Ledger</h2>
          <select
            value={txnTypeFilter}
            onChange={e => setTxnTypeFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All types</option>
            {Object.entries(TXN_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs font-mono">{t.txnType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.currencyDef.symbol}{t.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.fromPlayerAccount?.username ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.toPlayerAccount?.username ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No transactions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mt-3 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
  )
}
