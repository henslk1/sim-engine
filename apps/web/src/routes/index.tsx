import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div>
      {/* Top Nav */}
      <header>
        <div>
          <span>Sim Engine</span>
          <div>
            <Link to="/login">Sign in</Link>
            <Link to="/signup">Sign up</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section>
        <h1>Welcome to Sim Engine</h1>
        <p>A browser-based animal simulation platform.</p>
        <div>
          <Link to="/signup">Get Started</Link>
          <Link to="/login">Sign in</Link>
        </div>
      </section>

      {/* Games */}
      <section>
        <h2>Available Games</h2>
        <div>
          <div>
            <h3>Horse Sim</h3>
            <p>Breed, train, and compete with horses.</p>
            <Link to="/dashboard">Play now →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
