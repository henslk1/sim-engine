import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { authClient } from "@/lib/auth-client"
import { useState } from "react"
import { User, CreditCard, Bell, Lock, ChevronRight, Archive } from "lucide-react"
import { cn } from "@/lib/utils"

type TabKey = "profile" | "subscription" | "notifications" | "privacy" | "archive"

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "profile",       label: "Profile & Account", icon: <User size={14} /> },
  { key: "subscription",  label: "Subscription",      icon: <CreditCard size={14} /> },
  { key: "notifications", label: "Notifications",     icon: <Bell size={14} /> },
  { key: "privacy",       label: "Privacy",           icon: <Lock size={14} /> },
  { key: "archive",       label: "Animal Archive",    icon: <Archive size={14} /> },
]

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
})

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h2 className="font-serif text-lg font-semibold text-foreground">{children}</h2>
      <div className="mt-1 h-px flex-1 bg-border" />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  )
}

function ProfileTab({ playerAccountId }: { playerAccountId: string }) {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const { data: account } = trpc.player.getMyAccount.useQuery(
    { gameId: gameData?.id! },
    { enabled: !!gameData?.id }
  )
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword]         = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwError, setPwError]     = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwPending, setPwPending] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match"); return }
    if (newPassword.length < 8) { setPwError("New password must be at least 8 characters"); return }
    setPwPending(true); setPwError(null)
    const { error } = await authClient.changePassword({ newPassword, currentPassword, revokeOtherSessions: false })
    if (error) { setPwError(error.message ?? "Password change failed"); setPwPending(false); return }
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
    setPwSuccess(true); setPwPending(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel>Account Info</SectionLabel>
        <div className="grid gap-2 text-sm">
          {([
            { label: "Email",        value: account?.email },
            { label: "Username",     value: account?.playerAccounts[0]?.username },
            { label: "Display Name", value: account?.name },
          ] as const).map(({ label, value }) => (
            <div key={label} className="rounded border border-border bg-background px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium text-foreground">{value ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Change Password</SectionLabel>
        {pwSuccess && (
          <div className="mb-4 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
            Password updated successfully.
          </div>
        )}
        <form onSubmit={handleChangePassword} className="grid gap-4">
          <div>
            <FieldLabel>Current Password</FieldLabel>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <FieldLabel>New Password</FieldLabel>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <FieldLabel>Confirm New Password</FieldLabel>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          <button
            type="submit"
            disabled={pwPending}
            className="w-full rounded bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {pwPending ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  )
}

function SubscriptionTab({ playerAccountId }: { playerAccountId: string }) {
  const { data: sub } = trpc.player.getSubscription.useQuery({ playerAccountId })

  if (!sub) {
    return (
      <div>
        <SectionLabel>Subscription</SectionLabel>
        <div className="rounded border border-border bg-card p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No active subscription.</p>
          <p className="text-xs text-muted-foreground">Subscription purchases will be available at launch.</p>
        </div>
      </div>
    )
  }

  const status = !sub.isActive ? "Inactive" : sub.pausedAt ? "Paused" : "Active"
  const statusColor = !sub.isActive ? "text-muted-foreground" : sub.pausedAt ? "text-chart-1" : "text-chart-2"
  const perks = [
    sub.subscriptionTier.hasGeneReveal && "Gene Reveal",
    sub.subscriptionTier.hasPlayerStore && "Player Store",
  ].filter(Boolean).join(", ") || "None"

  return (
    <div>
      <SectionLabel>Subscription</SectionLabel>
      <div className="rounded border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-foreground">{sub.subscriptionTier.name}</p>
            <p className="text-sm text-muted-foreground">${(sub.subscriptionTier.cost / 100).toFixed(2)} / month</p>
          </div>
          <span className={cn("text-sm font-medium", statusColor)}>{status}</span>
        </div>
        <div className="grid gap-1 text-sm border-t border-border pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires</span>
            <span>{new Date(sub.expiresAt).toLocaleDateString()}</span>
          </div>
          {sub.pausedAt && sub.resumesAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Resumes</span>
              <span>{new Date(sub.resumesAt).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Perks</span>
            <span>{perks}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Full subscription management coming at launch.</p>
      </div>
    </div>
  )
}

function NotificationsTab({ playerAccountId }: { playerAccountId: string }) {
  const { data: settings, refetch } = trpc.player.getNotificationSettings.useQuery({ playerAccountId })
  const updateMutation = trpc.player.updateNotificationSetting.useMutation({ onSuccess: () => refetch() })

  return (
    <div>
      <SectionLabel>Notifications</SectionLabel>
      {!settings || settings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notification topics configured.</p>
      ) : (
        <div className="space-y-2">
          {settings.map(s => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center justify-between rounded border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{s.topicDef.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{s.topicDef.topicKey}</p>
              </div>
              <input
                type="checkbox"
                checked={s.isEnabled}
                onChange={e => updateMutation.mutate({ playerAccountId, topicDefId: s.topicDefId, isEnabled: e.target.checked })}
                className="size-4 accent-primary"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function PrivacyTab({ playerAccountId }: { playerAccountId: string }) {
  const { data: blocked, refetch } = trpc.player.getBlockedPlayers.useQuery({ playerAccountId })
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const unblockMutation = trpc.social.unblockPlayer.useMutation({ onSuccess: () => refetch() })

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel>Blocked Players</SectionLabel>
        {!blocked || blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked players.</p>
        ) : (
          <div className="space-y-2">
            {blocked.map(b => (
              <div key={b.id} className="flex items-center justify-between rounded border border-border bg-card px-4 py-3">
                <p className="text-sm font-medium text-foreground">{b.blockedPlayer.username}</p>
                <button
                  type="button"
                  onClick={() => unblockMutation.mutate({
                    blockerPlayerId: playerAccountId,
                    blockedPlayerId: b.blockedPlayerId,
                    gameId: gameData?.id!,
                  })}
                  disabled={unblockMutation.isPending}
                  className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <SectionLabel>Friend Requests</SectionLabel>
        <p className="text-sm text-muted-foreground">
          Manage friend requests on the{" "}
          <a href="/friend-requests" className="text-primary hover:underline">Friend Requests</a> page.
        </p>
      </div>
    </div>
  )
}

function ArchiveTab({ playerAccountId }: { playerAccountId: string }) {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const { data: buried = [] } = trpc.animal.listInactive.useQuery({ playerAccountId })

  const cycleToAge = (n: number) => {
    const cpy = gameData?.gameConfig?.cyclesPerYear ?? 12
    return `${Math.floor(n / cpy)}y ${n % cpy}m`
  }

  return (
    <div>
      <SectionLabel>Buried Animals</SectionLabel>
      {buried.length === 0 ? (
        <p className="text-sm text-muted-foreground">No buried animals.</p>
      ) : (
        <div className="space-y-1.5">
          {buried.map(a => (
            <a key={a.id} href={`/animal/${a.id}`} className="flex items-center justify-between rounded border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40">
              <div>
                <p className="font-medium text-foreground/70">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.breed?.name ?? a.breedName ?? ""} · {cycleToAge(a.ageInCycles)}
                  {a.diedAt ? ` · Died ${new Date(a.diedAt).toLocaleDateString()}` : ""}
                  {a.causeOfDeath ? ` · ${a.causeOfDeath.replace(/_/g, " ")}` : ""}
                </p>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Buried</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountPage() {
  const [active, setActive] = useState<TabKey>("profile")
  const { data: gameData }  = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const activePanel: React.ReactNode = (() => {
    if (!playerAccountId) return null
    switch (active) {
      case "profile":       return <ProfileTab playerAccountId={playerAccountId} />
      case "subscription":  return <SubscriptionTab playerAccountId={playerAccountId} />
      case "notifications": return <NotificationsTab playerAccountId={playerAccountId} />
      case "privacy":       return <PrivacyTab playerAccountId={playerAccountId} />
      case "archive":       return <ArchiveTab playerAccountId={playerAccountId} />
    }
  })()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-primary/30 bg-primary/10">
            <User size={16} className="text-primary" />
          </div>
          <h1 className="font-serif text-base font-semibold text-foreground">Account Settings</h1>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl grid-cols-[200px_1fr] gap-6 px-6 py-6">
        <aside className="shrink-0">
          <nav className="sticky top-6 flex flex-col gap-0.5">
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors",
                  active === tab.key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <span className={active === tab.key ? "opacity-80" : "opacity-50"}>{tab.icon}</span>
                <span className="flex-1 leading-tight">{tab.label}</span>
                {active === tab.key && <ChevronRight size={12} className="opacity-50" />}
              </button>
            ))}
          </nav>
        </aside>
        <main className="self-start rounded border border-border bg-card p-6">
          {activePanel ?? <p className="text-sm text-muted-foreground">Loading…</p>}
        </main>
      </div>
    </div>
  )
}
