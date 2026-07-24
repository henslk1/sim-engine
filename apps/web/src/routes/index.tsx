import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-serif text-lg font-semibold text-foreground">Sim Engine</span>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign up
            </Link>
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
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/signup"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started
          </Link>
          <Link
            to="/login"
            className="rounded-md border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
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
            <Link
              to="/dashboard"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              Play now →
            </Link>
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
