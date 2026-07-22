import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { CheckCircle2, Circle, Lock, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/")({
  component: GameSetupChecklist,
})

type Counts = {
  gameConfig: boolean
  currencies: number
  species: number
  lifeStages: number
  stats: number
  personalityTraits: number
  breeds: number
  loci: number
  alleles: number
  expressionRules: number
  geneticPanels: number
  conformationSections: number
  items: number
  careActions: number
  healthConditions: number
  treatments: number
  healthCerts: number
  trainingActions: number
  intensityTiers: number
  stageActivities: number
  titles: number
  disciplines: number
  competitionTiers: number
  venues: number
  seasonCategories: number
  records: number
  vetServices: number
  storeListings: number
  gameShopBreedConfigs: number
  groupPrestigeTiers: number
}

type CountKey = keyof Counts

interface Section {
  key: CountKey
  label: string
  route: string
  deps: CountKey[]
}

function makeGroups(gameId: string): { label: string; sections: Section[] }[] {
  return [
    {
      label: "Foundation",
      sections: [
        { key: "gameConfig", label: "Game Config", route: `/admin/games/${gameId}/config`, deps: [] },
        { key: "currencies", label: "Currencies", route: `/admin/games/${gameId}/currencies`, deps: ["gameConfig"] },
      ],
    },
    {
      label: "Animals",
      sections: [
        { key: "species", label: "Species", route: `/admin/games/${gameId}/species`, deps: [] },
        { key: "lifeStages", label: "Life Stages", route: `/admin/games/${gameId}/life-stages`, deps: [] },
        { key: "stats", label: "Stats", route: `/admin/games/${gameId}/stats`, deps: [] },
        { key: "personalityTraits", label: "Personality Traits", route: `/admin/games/${gameId}/personality-traits`, deps: [] },
        { key: "breeds", label: "Breeds", route: `/admin/games/${gameId}/breeds`, deps: ["species", "lifeStages", "stats"] },
      ],
    },
    {
      label: "Genetics",
      sections: [
        { key: "alleles", label: "Loci & Alleles", route: `/admin/games/${gameId}/loci`, deps: [] },
        { key: "expressionRules", label: "Expression Rules", route: `/admin/games/${gameId}/expression-rules`, deps: ["alleles"] },
        { key: "geneticPanels", label: "Genetic Panels", route: `/admin/games/${gameId}/genetic-panels`, deps: ["loci"] },
        { key: "conformationSections", label: "Conformation Sections", route: `/admin/games/${gameId}/conformation-sections`, deps: [] },
      ],
    },
    {
      label: "Economy",
      sections: [
        { key: "items", label: "Items", route: `/admin/games/${gameId}/items`, deps: ["currencies"] },
        { key: "vetServices", label: "Vet Services", route: `/admin/games/${gameId}/vet-services`, deps: ["currencies"] },
        { key: "storeListings", label: "Store Listings", route: `/admin/games/${gameId}/store-listings`, deps: ["items"] },
        { key: "gameShopBreedConfigs", label: "Game Shop", route: `/admin/games/${gameId}/game-shop`, deps: ["breeds", "currencies"] },
      ],
    },
    {
      label: "Care & Health",
      sections: [
        { key: "careActions", label: "Care Actions", route: `/admin/games/${gameId}/care-actions`, deps: ["currencies"] },
        { key: "healthConditions", label: "Health Conditions", route: `/admin/games/${gameId}/health-conditions`, deps: [] },
        { key: "treatments", label: "Treatments", route: `/admin/games/${gameId}/treatments`, deps: ["items", "healthConditions"] },
        { key: "healthCerts", label: "Health Certificates", route: `/admin/games/${gameId}/health-certificates`, deps: [] },
      ],
    },
    {
      label: "Training",
      sections: [
        { key: "trainingActions", label: "Training Actions", route: `/admin/games/${gameId}/training-actions`, deps: ["stats"] },
        { key: "intensityTiers", label: "Intensity Tiers", route: `/admin/games/${gameId}/intensity-tiers`, deps: [] },
        { key: "stageActivities", label: "Stage Activities", route: `/admin/games/${gameId}/stage-activities`, deps: ["lifeStages", "personalityTraits"] },
        { key: "titles", label: "Titles", route: `/admin/games/${gameId}/titles`, deps: [] },
      ],
    },
    {
      label: "Competition",
      sections: [
        { key: "disciplines", label: "Disciplines", route: `/admin/games/${gameId}/disciplines`, deps: ["stats"] },
        { key: "competitionTiers", label: "Competition Tiers", route: `/admin/games/${gameId}/competition-tiers`, deps: ["disciplines"] },
        { key: "venues", label: "Venues", route: `/admin/games/${gameId}/venues`, deps: ["disciplines"] },
        { key: "seasonCategories", label: "Season Categories", route: `/admin/games/${gameId}/season-categories`, deps: ["competitionTiers"] },
        { key: "records", label: "Records", route: `/admin/games/${gameId}/records`, deps: ["disciplines"] },
      ],
    },
    {
      label: "Groups",
      sections: [
        { key: "groupPrestigeTiers", label: "Prestige Tiers", route: `/admin/games/${gameId}/group-prestige-tiers`, deps: [] },
      ],
    },
  ]
}

const LABEL_MAP_KEYS: [CountKey, string][] = [
  ["gameConfig", "Game Config"], ["currencies", "Currencies"], ["species", "Species"],
  ["lifeStages", "Life Stages"], ["stats", "Stats"], ["personalityTraits", "Personality Traits"],
  ["breeds", "Breeds"], ["alleles", "Loci & Alleles"], ["expressionRules", "Expression Rules"],
  ["geneticPanels", "Genetic Panels"], ["conformationSections", "Conformation Sections"],
  ["items", "Items"], ["vetServices", "Vet Services"], ["storeListings", "Store Listings"],
  ["gameShopBreedConfigs", "Game Shop"], ["careActions", "Care Actions"],
  ["healthConditions", "Health Conditions"], ["treatments", "Treatments"],
  ["healthCerts", "Health Certificates"], ["trainingActions", "Training Actions"],
  ["intensityTiers", "Intensity Tiers"], ["stageActivities", "Stage Activities"],
  ["titles", "Titles"], ["disciplines", "Disciplines"], ["competitionTiers", "Competition Tiers"],
  ["venues", "Venues"], ["seasonCategories", "Season Categories"], ["records", "Records"],
  ["groupPrestigeTiers", "Prestige Tiers"],
]
const LABEL_MAP = Object.fromEntries(LABEL_MAP_KEYS) as Partial<Record<CountKey, string>>

function isDone(key: CountKey, counts: Counts): boolean {
  const val = counts[key]
  return typeof val === "boolean" ? val : val > 0
}

function GameSetupChecklist() {
  const { gameId } = Route.useParams()

  const { data: counts } = trpc.admin.game.setupCounts.useQuery({ gameId })

  if (!counts) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const groups = makeGroups(gameId)
  const allSections = groups.flatMap((g) => g.sections)
  const configuredCount = allSections.filter((s) => isDone(s.key, counts)).length
  const total = allSections.length
  const pct = Math.round((configuredCount / total) * 100)

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-serif text-xl font-semibold text-foreground">Setup Checklist</h1>
          <span className="text-sm tabular-nums text-muted-foreground">
            {configuredCount}/{total} configured
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.sections.map((section) => {
              const done = isDone(section.key, counts)
              const unmetDeps = section.deps.filter((d) => !isDone(d, counts))
              const locked = unmetDeps.length > 0
              const rawCount = counts[section.key]
              const displayCount = typeof rawCount === "number" ? rawCount : null

              return (
                <div
                  key={section.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3.5 py-3 text-sm",
                    locked
                      ? "cursor-not-allowed border-border/40 bg-card/40 opacity-50"
                      : done
                        ? "border-chart-2/30 bg-chart-2/5"
                        : "border-border bg-card",
                  )}
                >
                  <span className="shrink-0">
                    {locked ? (
                      <Lock className="size-4 text-muted-foreground/60" />
                    ) : done ? (
                      <CheckCircle2 className="size-4 text-chart-2" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium leading-none", locked ? "text-muted-foreground" : "text-foreground")}>
                      {section.label}
                    </p>
                    {locked && unmetDeps.length > 0 && (
                      <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
                        Needs: {unmetDeps.map((d) => LABEL_MAP[d] ?? d).join(", ")}
                      </p>
                    )}
                  </div>

                  {!locked && (
                    <div className="flex shrink-0 items-center gap-2">
                      {done && displayCount !== null && (
                        <span className="text-xs font-semibold tabular-nums text-chart-2">
                          {displayCount}
                        </span>
                      )}
                      <Link
                        to={section.route as never}
                        className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-medium transition-colors",
                          done
                            ? "text-muted-foreground hover:text-foreground"
                            : "text-primary hover:text-primary/80",
                        )}
                      >
                        {done ? "Edit" : "Configure"}
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
