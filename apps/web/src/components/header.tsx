import { useRouter, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionButton } from "./game/ui";
import { trpc } from "@/lib/trpc";
import { Coins, Gem } from "lucide-react";

type Session = typeof authClient.$Infer.Session 

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function Header({ session }: { session: Session}) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    await router.invalidate()
    router.navigate({ to: "/login" })
  }

  const { user } = session

  const navigate = useNavigate()
  const location = useLocation()

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""
  const { data: me } = trpc.player.me.useQuery({ gameId }, { enabled: !!gameId, staleTime: 5 * 60 * 1000 })
  const { data: myRoles = [] } = trpc.admin.ops.players.myRoles.useQuery()
  const { data: friendRequestData } = trpc.social.getFriendRequests.useQuery(
    { playerAccountId: me?.id!, gameId },
    { enabled: !!me?.id && !!gameId }
  )
  const pendingRequests = friendRequestData?.pendingCount ?? 0

  const { data: balances } = trpc.player.balances.useQuery(
    { playerAccountId: me?.id ?? "" },
    { enabled: !!me?.id },
  )
  const goldBalance = balances?.find(b => b.currencyDef.currencyType === "BASE")?.balance
  const premiumBalance = balances?.find(b => b.currencyDef.currencyType === "PREMIUM")

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="font-serif text-lg font-semibold text-foreground"><Link to="/">Sim Engine</Link></span>
          <Link to="/stable" data-tutorial="stable-nav" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Stable</Link>
          <Link to="/town" data-tutorial="town-nav" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Town</Link>
          <Link to="/shop" data-tutorial="shop-nav" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Shop</Link>
          <Link to="/directory" data-tutorial="directory-nav" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Directory</Link>
        </div>
        <div className="flex items-center gap-3">
          {me && gameId && <TestCurrencyButton playerAccountId={me.id} gameId={gameId} />}
          {me && (
            <span
              data-tutorial="gold-balance"
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-bold tabular-nums ring-1 ring-border"
            >
              <Coins className="size-3.5 text-chart-1" />
              {(goldBalance ?? 0).toLocaleString()}
            </span>
          )}
          {me && premiumBalance !== undefined && (
            <span
              data-tutorial="premium-balance"
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-bold tabular-nums ring-1 ring-border"
            >
              <Gem className="size-3.5 text-violet-400" />
              {(premiumBalance?.balance ?? 0).toLocaleString()}
            </span>
          )}
          <ActionButton
          variant="danger"
            onClick={() => navigate({ to: "/bug-reports", search: { from: location.pathname } })}
          >
            Bug Report
          </ActionButton>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted outline-none">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground overflow-hidden">
                {user.image ? (
                  <img src={user.image} alt={user.name ?? ""} className="h-full w-full object-cover" />
                ) : (
                  getInitials(user.name ?? "?")
                )}
              </div>
              <span>{user.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {me?.username && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/player/$username" params={{ username: me.username }} className="cursor-pointer">
                      View Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link to="/account" className="cursor-pointer">Account Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/friend-requests" className="cursor-pointer">
                  Friend Requests{pendingRequests > 0 ? ` (${pendingRequests})` : ""}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/support" className="cursor-pointer">Support</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {myRoles.length > 0 && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="cursor-pointer">Admin Console</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

function TestCurrencyButton({ playerAccountId, gameId }: { playerAccountId: string; gameId: string }) {
  const utils = trpc.useUtils()
  const [flash, setFlash] = useState(false)

  const grant = trpc.player.addTestCurrency.useMutation({
    onSuccess: () => {
      utils.player.balances.invalidate({ playerAccountId })
      setFlash(true)
    },
  })

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(false), 1200)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <ActionButton
      onClick={() => grant.mutate({ playerAccountId, gameId })}
      className={flash ? "bg-green-600 text-white hover:bg-green-600 scale-105" : "transition-transform"}
    >
      {flash ? "✓ Added!" : "Add 1,000 Gold"}
    </ActionButton>
  )
}