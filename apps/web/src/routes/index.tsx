import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { trpc, trpcVanilla } from '@/lib/trpc'

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: myRoles = [] } = trpc.admin.ops.players.myRoles.useQuery(undefined, { enabled: !!session })

  async function handleSignOut() {
    await authClient.signOut()
    await router.invalidate()
  }

  async function handlePlay() {
    if (!session) { void navigate({ to: '/signup' }); return }
    if (!session.user.emailVerified) { void navigate({ to: '/verify-email' }); return }
    const game = await trpcVanilla.admin.game.get.query()
    if (!game) return
    const player = await trpcVanilla.player.me.query({ gameId: game.id })
    void navigate({ to: player ? '/dashboard' : '/setup' })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-serif text-lg font-semibold text-foreground">Sim Engine</span>
          <div className="flex items-center gap-3">
            {session ? (
              <div className="relative group">
                <button className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground overflow-hidden">
                    {session.user.image
                      ? <img src={session.user.image} alt={session.user.name ?? ""} className="h-full w-full object-cover" />
                      : getInitials(session.user.name ?? "?")}
                  </div>
                  <span>{session.user.name}</span>
                </button>
                <div className="absolute right-0 top-full mt-1 hidden group-focus-within:block group-hover:block w-40 rounded-md border border-border bg-card shadow-md py-1 z-50">
                  {myRoles.length > 0 && (
                    <>
                      <Link
                        to="/admin"
                        className="block px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        Admin Console
                      </Link>
                      <div className="my-1 h-px bg-border" />
                    </>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link to="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Sign in
                </Link>
                <Link to="/signup" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="font-serif text-5xl font-semibold tracking-tight text-foreground">
          A world built to be played
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Breed, train, and compete in a living simulation. Every choice shapes your legacy.
        </p>
      </section>

      {/* Games */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="mb-6 font-serif text-2xl font-semibold text-foreground">Available Games</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-2xl">
              🐴
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Horse Sim</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Breed racehorses, develop training programs, and compete for titles.
            </p>
            <button
              onClick={handlePlay}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play now
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <span className="text-xs text-muted-foreground">© Sim Engine</span>
          <div className="flex gap-4">
            <a href="#" className="text-xs text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
            <a href="#" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
