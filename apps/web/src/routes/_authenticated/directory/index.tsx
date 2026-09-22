import { createFileRoute, Link } from "@tanstack/react-router"
import { BookOpen, HeartPulse, Dna, Palette, Brain } from "lucide-react"

export const Route = createFileRoute("/_authenticated/directory/")({
  component: DirectoryHubPage,
})

const DIRECTORIES = [
  {
    icon: <Dna className="size-6 text-chart-3" />,
    title: "Breed Directory",
    desc: "Browse registered breeds, their stats, preferred environments, and founding players.",
    to: "/breeds" as const,
    tutorialAttr: "breeds-directory-card",
  },
  {
    icon: <HeartPulse className="size-6 text-destructive" />,
    title: "Disease Directory",
    desc: "Reference for health conditions: symptoms, onset, genetic links, and prognosis.",
    to: "/directory/diseases" as const,
  },
  {
    icon: <BookOpen className="size-6 text-chart-2" />,
    title: "Conformation Directory",
    desc: "Understand each conformation trait, what it measures, and when animals can be tested.",
    to: "/directory/conformation" as const,
  },
  {
    icon: <Palette className="size-6 text-chart-4" />,
    title: "Coat Color Directory",
    desc: "Explore color loci, genotype combinations, and their expressed phenotypes.",
    to: "/directory/color" as const,
  },
  {
    icon: <Brain className="size-6 text-chart-1" />,
    title: "Personality Directory",
    desc: "Browse personality traits, their label ranges, and how each affects training, mood, and breeding.",
    to: "/directory/personality" as const,
    tutorialAttr: "personality-directory-card",
  },
]

function DirectoryHubPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link to="/town" className="text-sm text-muted-foreground hover:text-foreground">← Town</Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Directories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Game reference guides for players.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {DIRECTORIES.map(({ icon, title, desc, to, tutorialAttr }) => (
          <Link
            key={title}
            to={to}
            data-tutorial={tutorialAttr}
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
