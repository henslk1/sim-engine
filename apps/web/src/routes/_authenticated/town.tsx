import { createFileRoute, Link } from "@tanstack/react-router"
import { Stethoscope, Trophy, ShoppingBag } from "lucide-react"

export const Route = createFileRoute("/_authenticated/town")({
  component: TownPage,
})

const FACILITIES = [
  {
    icon: <Stethoscope className="size-6 text-destructive" />,
    title: "Vet Office",
    desc: "Run health exams, assign treatments, and manage genetic services.",
    to: "/vet" as const,
  },
  {
    icon: <Trophy className="size-6 text-chart-1" />,
    title: "Competition Venues",
    desc: "Browse open competitions and enter your animals.",
    to: "/venues" as const,
  },
  {
    icon: <ShoppingBag className="size-6 text-chart-4" />,
    title: "Shop",
    desc: "Purchase items, animals, and premium upgrades.",
    to: "/shop" as const,
  },
]

function TownPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Town</h1>
        <p className="mt-1 text-sm text-muted-foreground">Select a facility to visit.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FACILITIES.map(({ icon, title, desc, to }) => (
          <Link
            key={title}
            to={to}
            className="group flex items-start gap-4 rounded-lg border border-border bg-card px-4 py-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
