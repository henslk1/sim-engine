import { createFileRoute, Outlet, Link } from "@tanstack/react-router"

const navGroups = [
  {
    label: "Game Setup",
    links: [{ to: "/admin/game-config", label: "Game Config" }],
  },
  {
    label: "Animals",
    links: [
      { to: "/admin/species", label: "Species"},
      { to: "/admin/life-stages", label: "Life Stages" },
      { to: "/admin/stats", label: "Stats" },
      { to: "/admin/breeds", label: "Breeds"},
    ],
  },
  {
    label: "Genetics",
    links: [
      { to: "/admin/loci", label: "Loci & Alleles" },
      { to: "/admin/expression-rules", label: "Expression Rules" },
      { to: "/admin/genetic-panels", label: "Genetic Panels"},
    ],
  },
  {
    label: "Care & Health",
    links: [
      { to: "/admin/care-actions", label: "Care Actions" },
      { to: "/admin/health-conditions", label: "Health Conditions" },
      { to: "/admin/treatments", label: "Treatments" },
      { to: "/admin/health-certificates", label: "Health Certificates" },
    ],
  },
  {
    label: "Training",
    links: [
      { to: "/admin/training-actions", label: "Training Actions" },
      { to: "/admin/intensity-tiers", label: "Intensity Tiers" },
      { to: "/admin/stage-activities", label: "Stage Activities" },
      { to: "/admin/titles", label: "Titles" }, 
    ],
  },
  {
    label: "Competition",
    links: [
      { to: "/admin/disciplines", label: "Disciplines" },
      { to: "/admin/competition-tiers", label: "Competition Tiers" },
      { to: "/admin/conformation-standards", label: "Conformation Standards" },
      { to: "/admin/season-categories", label: "Season Categories" }, 
      { to: "/admin/records", label: "Records" },
      { to: "/admin/prize-config", label: "Prize Config" },
    ],
  },
  {
    label: "Economy", 
    links: [
      { to: "/admin/currencies", label: "Currencies" },
      { to: "/admin/items", label: "Items" },
      { to: "/admin/vet-services", label: "Vet Services" },
    ],
  },
  {
    label: "World",
    links: [
      { to: "/admin/notification-topics", label: "Notification Topics" },
      { to: "/admin/directory-filters", label: "Directory Filters" },
      { to: "/admin/tutorial-steps", label: "Tutorial Steps" },
    ],
  },
]

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
})


function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 p-y3">
          <span className="font-serif text-sm font-semibold text-foreground">Admin Console</span>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Game
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              {group.links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                  activeProps={{ className: "block rounded-md px-2 py-1.5 text-sm bg-primary/10 text-primary font-medium"}}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
