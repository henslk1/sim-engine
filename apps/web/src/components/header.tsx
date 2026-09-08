import { useRouter, Link, useNavigate, useLocation } from "@tanstack/react-router";
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
  const { data: me } = trpc.player.me.useQuery({ gameId }, { enabled: !!gameId, staleTime: Infinity })
  const { data: friendRequestData } = trpc.social.getFriendRequests.useQuery(
    { playerAccountId: me?.id!, gameId },
    { enabled: !!me?.id && !!gameId }
  )
  const pendingRequests = friendRequestData?.pendingCount ?? 0

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="font-serif text-lg font-semibold text-foreground"><Link to="/">Sim Engine</Link></span>
          <Link to="/stable" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Stable</Link>
          <Link to="/town" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Town</Link>
          <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Shop</Link>
        </div>
        <div className="flex items-center gap-3">
          {me && gameId && <TestCurrencyButton playerAccountId={me.id} gameId={gameId} />}
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
              <DropdownMenuItem asChild>
                <Link to="/admin" className="cursor-pointer">Admin Console</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
  const grant = trpc.player.addTestCurrency.useMutation({
    onSuccess: () => utils.player.balances.invalidate({ playerAccountId }),
  })

  return (
    <ActionButton
      onClick={() => grant.mutate({ playerAccountId, gameId })}
      disabled={grant.isPending || grant.isSuccess}
    >
      {grant.isSuccess ? "+1,000 ✓" : grant.isPending ? "…" : "+1,000"}
    </ActionButton>
  )
}