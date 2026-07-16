import { useRouter, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="font-serif text-lg font-semibold text-foreground"><Link to="/">Sim Engine</Link></span>
          <Link to="/town" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Town</Link>
          <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Shop</Link>
        </div>
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
            <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}