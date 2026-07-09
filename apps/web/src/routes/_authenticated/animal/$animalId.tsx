import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { Panel, Badge, Meter, Stat, ActionButton } from "@/components/game/ui"
import { cn } from "@/lib/utils"
import {
  Stethoscope,
  Heart,
  Dumbbell,
  Trophy,
  Baby,
  Dna,
  Network,
  TrendingUp,
  Ruler,
  ScrollText,
  Users,
  Store,
  Tag,
  Award,
  Gift,
  Package,
  Skull,
  ShieldCheck,
  Sparkles,
  Clock,
  Brain,
  Sword,
  GitBranch,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

type AnimalProfile = RouterOutputs["animalProfile"]["get"]

export const Route = createFileRoute("/_authenticated/animal/$animalId")({
  component: AnimalProfilePage,
})

function AnimalProfilePage() {
  const { animalId } = Route.useParams()
  const { data: animal, isLoading } = trpc.animalProfile.get.useQuery({ animalId })

  if (isLoading)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  if (!animal) return <div className="p-8 text-sm">Animal not found</div>

  const config = animal.game.gameConfig
  function cycleToAge(cycle: number) {
    if (!config) return `cycle ${cycle}`
    const y = Math.floor(cycle / config.cyclesPerYear)
    const m = cycle % config.cyclesPerYear
    return `${y}y ${m}m`
  }

  const activeConditions = animal.healthRecords.filter((r) => r.isActive)
  const currentTier = animal.compTiers[0]
  const latestWeeklyPoints = animal.weeklyPoints[0]?.points
  const preg = animal.pregnancies[0]
  const breedingGrade = computeBreedingGrade(animal, config)
  const breedingGradeColor: Record<string, string> = {
    A: "text-chart-2",
    B: "text-sky-500",
    C: "text-amber-400",
    D: "text-orange-500",
    F: "text-destructive",
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-transparent text-foreground">

      {/* Header */}
      <div className="flex shrink-0 flex-col items-center gap-3 border-b border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {animal.name}
          </h1>
          <Badge tone="success">{animal.status}</Badge>
          {activeConditions.length > 0 && (
            <Badge tone="danger">
              <Stethoscope className="size-3" />
              {activeConditions.length} condition{activeConditions.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <ActionButton variant="soft" disabled>
          <Clock className="size-3.5" />
          Advance Age
        </ActionButton>

        {/* Vitals */}
        <div className="grid w-full max-w-lg grid-cols-5 gap-x-4 gap-y-2">
          {(
            [
              { label: "Energy", value: animal.energy?.currentEnergy ?? 0, max: animal.energy?.maxEnergy ?? 100, tone: "energy" as const },
              { label: "Mood", value: animal.mood?.value ?? 0, max: 100, tone: "mood" as const },
              { label: "Condition", value: animal.condition?.value ?? 0, max: 100, tone: "condition" as const },
              { label: "Care", value: animal.careScore?.score ?? 0, max: 100, tone: "care" as const },
              { label: "Immunity", value: animal.immunity?.value ?? 0, max: animal.immunity?.innateMax ?? 100, tone: "immunity" as const },
            ] as const
          ).map((v) => (
            <div key={v.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{v.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-foreground">{Math.round(v.value)}</span>
              </div>
              <Meter value={v.value} max={v.max} tone={v.tone} />
            </div>
          ))}
        </div>
      </div>

      {/* Info strip */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 border-b border-border bg-card/50 px-4 py-2">
        <InfoChip>{animal.breed.name}</InfoChip>
        <InfoChip>{animal.sex}</InfoChip>
        <InfoChip>{animal.lifeStage.name}</InfoChip>
        <InfoChip>Age {cycleToAge(animal.ageInCycles)}</InfoChip>
        {animal.breedGeneration !== null && (
          <InfoChip><GitBranch className="size-3" /> Gen {animal.breedGeneration}</InfoChip>
        )}
        {animal.breedComposition.map((bc: AnimalProfile["breedComposition"][number]) => (
          <InfoChip key={bc.breedId}>{bc.breed.name} {Math.round(bc.percentage)}%</InfoChip>
        ))}
        {animal.brands.map((b: AnimalProfile["brands"][number]) => (
          <BrandChip key={b.id} path={b.playerBrand.path} />
        ))}
        <span className="inline-flex items-center justify-center rounded-md bg-secondary/60 px-2 py-1" title={`Breeding quality: ${breedingGrade}`}>
          <Heart className={cn("size-3", breedingGradeColor[breedingGrade])} fill="currentColor" />
        </span>
        {animal.disciplineDef && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            <Trophy className="size-3 text-chart-1" /> {animal.disciplineDef.name}
          </span>
        )}
        {animal.titles.map((t: AnimalProfile["titles"][number]) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            <Award className="size-3" /> {t.titleDef.name}
          </span>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid min-h-0 gap-3 grid-cols-1 min-[1400px]:h-full min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.6fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">

          {/* Col 1 */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_auto_minmax(0,1fr)]">

            <Panel title="Health" icon={<Stethoscope className="size-4 text-destructive" />}>
              {activeConditions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No active conditions</p>
              ) : (
                <div className="space-y-1.5">
                  {activeConditions.map((record: AnimalProfile["healthRecords"][number]) => (
                    <div key={record.id} className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{record.conditionDef.name}</span>
                        <Badge tone="danger">Active</Badge>
                      </div>
                      {record.treatmentRecords.map((t: AnimalProfile["healthRecords"][number]["treatmentRecords"][number]) => (
                        <p key={t.id} className="mt-1 text-[11px] text-muted-foreground">
                          Treating: <span className="font-medium text-foreground">{t.treatmentDef.name}</span>
                          {t.activityRestriction && <span className="text-destructive"> · activity restricted</span>}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {animal.healthCertificates.length > 0 && (
                <>
                  <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Certificates</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {animal.healthCertificates.map((cert: AnimalProfile["healthCertificates"][number]) => (
                      <span key={cert.id} className="inline-flex items-center gap-1 rounded-md border border-chart-2/30 bg-chart-2/10 px-2 py-1 text-[11px] font-medium text-chart-2">
                        <ShieldCheck className="size-3" /> {cert.certDef.name}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {animal.testResults.length > 0 && (
                <>
                  <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Panel Tests</h4>
                  <div className="space-y-1.5">
                    {animal.testResults.map((t: AnimalProfile["testResults"][number]) => (
                      <div key={t.id} className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                        <span className="text-xs font-semibold text-foreground">{t.conditionDef.name}</span>
                        <Badge tone="success">Tested · {t.result}</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>

            {/* Breeding */}
            <Panel title="Breeding" icon={<Baby className="size-4 text-accent-foreground" />}>
              {(() => {
                const coiColor = animal.inbreedingCoefficient < 0.0625 ? "text-chart-2" : animal.inbreedingCoefficient < 0.125 ? "text-amber-500" : "text-destructive"
                return (
                  <div className="mb-3 flex items-center gap-4 border-b border-border pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      COI — <span className={cn("font-bold tabular-nums", coiColor)}>{(animal.inbreedingCoefficient * 100).toFixed(2)}%</span>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Quality — <span className="font-bold">{breedingGrade}</span>
                    </span>
                    {animal.breedComposition.length > 1 && (
                      <Badge tone="muted">Cross</Badge>
                    )}
                  </div>
                )
              })()}

              {/* Pregnancy */}
              
              {animal.pregnancies.length > 0 ? (
                <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Active Pregnancy</span>
                    <Badge tone="accent"><Sparkles className="size-3" /> Expecting</Badge>
                  </div>
                  {preg.breedingRecord.sire && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Sire: <span className="font-medium text-foreground">{preg.breedingRecord.sire.name}</span>
                    </p>
                  )}
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Gestation</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {preg.currentCycles} / {preg.requiredCycles} months
                      </span>
                    </div>
                    <Meter value={preg.currentCycles} max={preg.requiredCycles} tone="mood" className="h-1.5" />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">{/* TODO: breed action button */}Not pregnant</p>
              )}
            </Panel>

            <Panel title="Daily Log" icon={<ScrollText className="size-4 text-muted-foreground" />}>
              {animal.careLogs.length === 0 && animal.trainingLogs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No recent activity</p>
              ) : (
                <ol className="relative space-y-2 border-l border-border pl-4">
                  {animal.careLogs.slice(0, 5).map((log: AnimalProfile["careLogs"][number]) => (
                    <li key={`care-${log.id}`} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-chart-4 ring-2 ring-card" />
                      <div className="flex items-center gap-2">
                        <Badge tone="muted">c{log.cycleNumber}</Badge>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-chart-4">care</span>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground">{log.careActionDef.name}</p>
                    </li>
                  ))}
                  {animal.trainingLogs.slice(0, 5).map((log: AnimalProfile["trainingLogs"][number]) => (
                    <li key={`train-${log.id}`} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-chart-2 ring-2 ring-card" />
                      <div className="flex items-center gap-2">
                        <Badge tone="muted">c{log.cycleNumber}</Badge>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-chart-2">training</span>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground">{log.trainingActionDef.name}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {/* Col 2 */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">

            <Panel
              title="Training"
              icon={<Dumbbell className="size-4 text-chart-2" />}
              action={config ? <Badge tone="outline">Cap = innate × {config.trainingCeilingMultiplier}</Badge> : undefined}
            >
              <div className="space-y-2">
                {animal.stats.map((stat: AnimalProfile["stats"][number]) => {
                  const cap = config
                    ? stat.innateValue * config.trainingCeilingMultiplier
                    : stat.innateValue * 1.5
                  return (
                    <div key={stat.statDef.name} className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{stat.statDef.name}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          <span className="font-semibold text-foreground">{Math.round(stat.trainedValue)}</span> / {Math.round(cap)}
                        </span>
                      </div>
                      <Meter value={stat.trainedValue} max={cap} tone="condition" className="mb-1.5 h-1.5" />
                      <div className="flex gap-3 text-[11px] text-muted-foreground">
                        <span>Innate <span className="font-medium text-foreground">{Math.round(stat.innateValue)}</span></span>
                        <span>Trained <span className="font-medium text-foreground">{Math.round(stat.trainedValue)}</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>

            <Panel title="Competition" icon={<Trophy className="size-4 text-chart-1" />}>
              {animal.disciplineDef ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2">
                      <Stat label="Discipline" value={animal.disciplineDef.name} />
                    </div>
                    <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2">
                      <Stat label="Current Tier" value={currentTier?.tierDef.name ?? "—"} />
                    </div>
                  </div>

                  {latestWeeklyPoints !== undefined && (
                    <div className="mt-2 rounded-md border border-border/70 bg-secondary/30 px-3 py-2">
                      <Stat label="Weekly Points" value={`${Math.round(latestWeeklyPoints)} pts`} />
                    </div>
                  )}

                  {animal.competitionEntries.length > 0 && (
                    <div className="mt-3">
                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Entries</h4>
                      <div className="overflow-hidden rounded-md border border-border/70">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-secondary/50 text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1 font-medium">Venue</th>
                              <th className="px-2 py-1 font-medium">Tier</th>
                              <th className="px-2 py-1 text-right font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {animal.competitionEntries.map((entry: AnimalProfile["competitionEntries"][number]) => (
                              <tr key={entry.id} className="border-t border-border/60">
                                <td className="px-2 py-1 font-medium text-foreground">{entry.competition.venue.name}</td>
                                <td className="px-2 py-1 text-muted-foreground">{entry.tierDef.name}</td>
                                <td className="px-2 py-1 text-right">
                                  {entry.result ? (
                                    entry.result.placement !== null ? (
                                      <Badge tone={entry.result.placement === 1 ? "success" : entry.result.placement <= 3 ? "accent" : "muted"}>
                                        #{entry.result.placement}
                                      </Badge>
                                    ) : (
                                      <span className="tabular-nums text-foreground">{entry.result.score.toFixed(1)}</span>
                                    )
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">No discipline assigned</p>
              )}
            </Panel>
          </div>

          {/* Col 3 */}
          <div className="order-first flex min-h-0 flex-col gap-3 min-[1400px]:order-none min-[1400px]:grid min-[1400px]:grid-rows-[auto_minmax(0,1fr)]">

            <div className="relative flex aspect-[3/2] w-full shrink-0 items-end overflow-hidden rounded-lg border border-border bg-gradient-to-br from-secondary to-muted shadow-sm">
              <div className="w-full bg-gradient-to-t from-card/90 to-transparent px-4 py-3">
                <p className="font-serif text-lg font-semibold text-foreground">{animal.name}</p>
                <p className="text-xs text-muted-foreground">{animal.breed.name} · {animal.lifeStage.name}</p>
              </div>
            </div>

            <WorkspaceTabs animal={animal} animalId={animalId} cycleToAge={cycleToAge} config={config} />
          </div>

          {/* Col 4+5 */}
          <div className="flex min-h-0 flex-col gap-3 min-[1400px]:col-span-2 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[1400px]:grid-rows-[auto_auto_minmax(0,1fr)]">

            <Panel title="Daily Care" icon={<Heart className="size-4 text-chart-4" />}>
              {animal.longTermCareRecords.length > 0 && (
                <>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Long-Term Schedule</h4>
                  <div className="space-y-1.5">
                    {animal.longTermCareRecords.map((record: AnimalProfile["longTermCareRecords"][number]) => (
                      <div key={record.id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                        <p className="text-xs font-semibold text-foreground">{record.longTermCareActionDef.name}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {record.lastPerformedCycle !== null && (
                            <span className="text-[11px] text-muted-foreground">last {cycleToAge(record.lastPerformedCycle)}</span>
                          )}
                          <Badge tone="muted">due {cycleToAge(record.nextDueCycle)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {animal.careLogs.length > 0 && (
                <>
                  <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Care</h4>
                  <div className="space-y-1.5">
                    {animal.careLogs.map((log: AnimalProfile["careLogs"][number]) => (
                      <div key={log.id} className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                        <span className="text-xs font-semibold text-foreground">{log.careActionDef.name}</span>
                        <span className="text-[11px] text-muted-foreground">{cycleToAge(log.cycleNumber)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {animal.longTermCareRecords.length === 0 && animal.careLogs.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No care records</p>
              )}
            </Panel>

            {/* Owner Actions */}
            <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border bg-secondary/40 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Owner Actions</h3>
              </header>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                <OwnerActionList />
              </div>
            </div>

            {/* Personality */}
            <Panel title="Personality" icon={<Brain className="size-4 text-chart-5" />}>
              {animal.personality.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No personality data</p>
              ) : (
                <div className="space-y-2">
                  {animal.personality.map((trait: AnimalProfile["personality"][number]) => (
                    <div key={trait.traitDef.name}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{trait.traitDef.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {trait.traitLabel && (
                            <span className="mr-1.5 font-medium text-foreground">{trait.traitLabel}</span>
                          )}
                          <span className="tabular-nums">{Math.round(trait.value)}</span>
                        </span>
                      </div>
                      <Meter value={trait.value} max={100} tone="mood" className="h-1" />
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Items Equipped */}
            <Panel title="Equipped" icon={<Sword className="size-4 text-muted-foreground" />}>
              {animal.equipment.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No items equipped</p>
              ) : (
                <div className="space-y-1.5">
                  {animal.equipment.map((eq: AnimalProfile["equipment"][number]) => (
                    <div key={eq.id} className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                      <span className="text-xs font-semibold text-foreground">{eq.itemDef.name}</span>
                      <Badge tone="muted">{eq.slot}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="flex min-h-0 flex-col min-[1400px]:col-span-2">
              <Panel title="Conformation" icon={<Ruler className="size-4 text-chart-2" />}>
                {animal.conformationScores.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {animal.conformationScores.map((score: AnimalProfile["conformationScores"][number]) => (
                      <div key={score.breedId} className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{score.breed.name}</span>
                          <span className="text-sm font-bold tabular-nums text-primary">{score.score.toFixed(1)}</span>
                        </div>
                        <Meter value={score.score} max={100} tone="condition" className="h-1.5" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No conformation scores</p>
                )}
              </Panel>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}

function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-1 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

function BrandChip({ path }: { path: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-secondary/60 p-1" title="Player brand">
      <svg viewBox="0 0 100 100" className="size-4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  )
}

const OWNER_ACTIONS: { Icon: LucideIcon; label: string; destructive?: boolean }[] = [
  { Icon: Users, label: "Move to Group" },
  { Icon: Package, label: "Equip / Unequip Item" },
  { Icon: Trophy, label: "Enter in Competition" },
  { Icon: Award, label: "Create Stud Listing" },
  { Icon: Stethoscope, label: "Visit Vet" },
  { Icon: Tag, label: "Brand this Animal" },
  { Icon: Store, label: "List on Marketplace" },
  { Icon: Gift, label: "Gift Animal" },
]

function OwnerActionList() {
  return (
    <>
      {OWNER_ACTIONS.map(({ Icon, label }) => (
        <button
          key={label}
          type="button"
          disabled
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="size-4 text-muted-foreground" />
          <span className="flex-1">{label}</span>
        </button>
      ))}
      <div className="my-1.5 border-t border-border" />
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Skull className="size-4" />
        <span className="flex-1">Bury / Archive</span>
      </button>
    </>
  )
}

type WorkspaceTab = "pedigree" | "genetics" | "comp-history" | "offspring" | "stat-history"

const WORKSPACE_TABS: { id: WorkspaceTab; label: string; Icon: LucideIcon }[] = [
  { id: "pedigree", label: "Pedigree", Icon: Network },
  { id: "genetics", label: "Genetics", Icon: Dna },
  { id: "comp-history", label: "Comp. History", Icon: Trophy },
  { id: "offspring", label: "Offspring", Icon: Baby },
  { id: "stat-history", label: "Stat History", Icon: TrendingUp },
]

function WorkspaceTabs({
  animal,
  animalId,
  cycleToAge,
  config,
}: {
  animal: AnimalProfile
  animalId: string
  cycleToAge: (n: number) => string
  config: AnimalProfile["game"]["gameConfig"]
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("genetics")
  const { data: offspring, isLoading: offspringLoading } = trpc.animalProfile.getOffspring.useQuery(
    { animalId },
    { enabled: activeTab === "offspring" }
  )
  const { data: statHistory, isLoading: statHistoryLoading } = trpc.animalProfile.getStatHistory.useQuery(
    { animalId },
    { enabled: activeTab === "stat-history" }
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-border bg-secondary/40 px-2 py-1.5">
        {WORKSPACE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              activeTab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-4xl min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "pedigree" && <PedigreeTab animal={animal} />}
        {activeTab === "genetics" && <GeneticsTab animal={animal} config={config} />}
        {activeTab === "comp-history" && <CompHistoryTab animal={animal} cycleToAge={cycleToAge} />}
        {activeTab === "offspring" && <OffspringTab data={offspring} isLoading={offspringLoading} cycleToAge={cycleToAge} />}
        {activeTab === "stat-history" && <StatHistoryTab data={statHistory} isLoading={statHistoryLoading} />}
      </div>
    </div>
  )
}

function PedigreeTab({ animal }: { animal: AnimalProfile }) {
  return (
    <div>
      {animal.breedComposition.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {animal.breedComposition.map((bc: AnimalProfile["breedComposition"][number]) => (
            <Badge key={bc.breedId} tone="outline">
              {bc.breed.name} · {Math.round(bc.percentage)}%
            </Badge>
          ))}
        </div>
      )}
      <div className="mb-3 flex items-center gap-4 border-b border-border pb-2">
        {(() => {
          const coiColor = animal.inbreedingCoefficient < 0.0625 ? "text-chart-2" : animal.inbreedingCoefficient < 0.125 ? "text-amber-500" : "text-destructive"
          return (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                COI — <span className={cn("font-bold tabular-nums", coiColor)}>{(animal.inbreedingCoefficient * 100).toFixed(2)}%</span>
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Born — <span className="font-bold text-foreground">{new Date(animal.bornAt).toLocaleDateString()}</span>
              </span>
            </>
          )
        })()}
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Bred by{" "}
        <span className="font-medium text-foreground">
          {animal.breeder?.username ?? "Unknown"}
        </span>
      </p>
      {animal.ancestors.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No pedigree on record.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/70">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Relationship</th>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Breed</th>
                <th className="px-2 py-1 font-medium">Sex</th>
                <th className="px-2 py-1 font-medium">Status</th>
                <th className="px-2 py-1 text-right font-medium">COI</th>
              </tr>
            </thead>
            <tbody>
              {animal.ancestors.map((a: AnimalProfile["ancestors"][number]) => {
                const rel = a.depth === 1 ? "Parent" : a.depth === 2 ? "Grandparent" : a.depth === 3 ? "Great-grandparent" : `Gen-${a.depth} ancestor`
                return (
                  <tr key={a.ancestor.id} className="border-t border-border/60">
                    <td className="px-2 py-1 text-muted-foreground">{rel}</td>
                    <td className="px-2 py-1 font-medium text-foreground">{a.ancestor.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{a.ancestor.breed.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{a.ancestor.sex}</td>
                    <td className="px-2 py-1"><Badge tone={a.ancestor.status === "ACTIVE" ? "success" : "muted"}>{a.ancestor.status}</Badge></td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{(a.ancestor.inbreedingCoefficient * 100).toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      
    </div>
  )
}

function OffspringTab({
  data,
  isLoading,
  cycleToAge,
}: {
  data: RouterOutputs["animalProfile"]["getOffspring"] | undefined
  isLoading: boolean
  cycleToAge: (n: number) => string
}) {
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Loading…</p>
  if (!data || data.length === 0) return <p className="text-[11px] text-muted-foreground">No offspring on record.</p>
  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Name</th>
            <th className="px-2 py-1 font-medium">Breed</th>
            <th className="px-2 py-1 font-medium">Sex</th>
            <th className="px-2 py-1 font-medium">Status</th>
            <th className="px-2 py-1 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {data.map((o: RouterOutputs["animalProfile"]["getOffspring"][number]) => (
            <tr key={o.id} className="border-t border-border/60">
              <td className="px-2 py-1 font-medium text-foreground">{o.name}</td>
              <td className="px-2 py-1 text-muted-foreground">{o.breed.name}</td>
              <td className="px-2 py-1 text-muted-foreground">{o.sex}</td>
              <td className="px-2 py-1"><Badge tone={o.status === "ACTIVE" ? "success" : "muted"}>{o.status}</Badge></td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{cycleToAge(o.ageInCycles)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatHistoryTab({
  data,
  isLoading,
}: {
  data: RouterOutputs["animalProfile"]["getStatHistory"] | undefined
  isLoading: boolean
}) {
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Loading…</p>
  if (!data || data.length === 0) return <p className="text-[11px] text-muted-foreground">No stat history recorded yet.</p>
  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Stat</th>
            <th className="px-2 py-1 text-right font-medium">Innate</th>
            <th className="px-2 py-1 text-right font-medium">Trained</th>
            <th className="px-2 py-1 text-right font-medium">Cycle</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h: RouterOutputs["animalProfile"]["getStatHistory"][number]) => (
            <tr key={h.id} className="border-t border-border/60">
              <td className="px-2 py-1 font-medium text-foreground">{h.statDef.name}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{Math.round(h.innateValue)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-foreground">{Math.round(h.trainedValue)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{h.cycleNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GeneticsTab({
  animal,
  config,
}: {
  animal: AnimalProfile
  config: AnimalProfile["game"]["gameConfig"]
}) {
  type Genotype = NonNullable<AnimalProfile["genotypes"]>[number]
  const groups = animal.genotypes.reduce<Record<string, Genotype[]>>((acc: Record<string, Genotype[]>, g: Genotype) => {
    const key = g.locus.displayGroup ?? "Other"
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="overflow-hidden rounded-md border border-border/70">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Locus</th>
              <th className="px-2 py-1 font-medium">Group</th>
              <th className="px-2 py-1 text-center font-medium">Genotype</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(groups) as Array<[string, Genotype[]]>).flatMap(([group, genotypes]) =>
              genotypes.map((g, i) => (
                <tr key={g.locusId} className="border-t border-border/60">
                  <td className="px-2 py-1 font-medium text-foreground">{g.locus.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{i === 0 ? group : ""}</td>
                  <td className="px-2 py-1 text-center">
                    {g.isTestedByOwner ? (
                      <span className="inline-block rounded bg-chart-5/12 px-1.5 py-0.5 font-mono font-semibold text-chart-5">
                        {g.alleleOne.symbol}/{g.alleleTwo.symbol}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground/60">untested</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Innate Stats</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Sets the training cap for each stat.</p>
        <div className="space-y-1.5">
          {animal.stats.map((s: AnimalProfile["stats"][number]) => {
            const cap = config
              ? s.innateValue * config.trainingCeilingMultiplier
              : s.innateValue * 1.5
            return (
              <div key={s.statDef.name} className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                <span className="text-xs font-medium text-foreground">{s.statDef.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{Math.round(s.innateValue)}</span>
                  {" "}→ cap {Math.round(cap)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CompHistoryTab({
  animal,
  cycleToAge,
}: {
  animal: AnimalProfile
  cycleToAge: (n: number) => string
}) {
  return (
    <div>
      {animal.titles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {animal.titles.map((t: AnimalProfile["titles"][number]) => (
            <Badge key={t.id} tone="default">
              <Award className="size-3" /> {t.titleDef.name} · {cycleToAge(t.cycleNumber)}
            </Badge>
          ))}
        </div>
      )}
      {animal.competitionEntries.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/70">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Venue</th>
                <th className="px-2 py-1 font-medium">Tier</th>
                <th className="px-2 py-1 text-right font-medium">Score</th>
                <th className="px-2 py-1 text-right font-medium">Place</th>
              </tr>
            </thead>
            <tbody>
              {animal.competitionEntries.map((entry: AnimalProfile["competitionEntries"][number]) => (
                <tr key={entry.id} className="border-t border-border/60">
                  <td className="px-2 py-1 font-medium text-foreground">{entry.competition.venue.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{entry.tierDef.name}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-foreground">{entry.result?.score.toFixed(1) ?? "—"}</td>
                  <td className="px-2 py-1 text-right">
                    {entry.result?.placement != null ? (
                      <Badge tone={entry.result.placement === 1 ? "success" : entry.result.placement <= 3 ? "accent" : "muted"}>
                        #{entry.result.placement}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No competition entries yet</p>
      )}
    </div>
  )
}

function computeBreedingGrade(
  animal: AnimalProfile,
  config: AnimalProfile["game"]["gameConfig"]
): string {
  const components: number[] = []

  // Care
  components.push((animal.careScore?.score ?? 0) / 100)

  // Competition tier
  const tierIndex = animal.compTiers[0]?.tierDef.tierIndex ?? -1
  components.push(tierIndex < 0 ? 0 : Math.min((tierIndex + 1) / 10, 1))

  // Inbreeding (0 = 1.0; 25 = 0 )
  components.push(Math.max(0, 1 - animal.inbreedingCoefficient / 0.25))

  // Training completion
  if (animal.stats.length > 0 && config) {
    const avg = animal.stats.reduce((sum: number, s: AnimalProfile["stats"][number]) => {
      const cap = s.innateValue * config.trainingCeilingMultiplier 
      return sum + Math.min(s.trainedValue / cap, 1)
    }, 0) / animal.stats.length
    components.push(avg)
  } else {
    components.push(0)
  }

  // Conformation for purebreds
  const isCross = animal.breedComposition.length > 1
  if (!isCross && animal.conformationScores.length > 0) {
    const avg = animal.conformationScores.reduce((sum: number, s: AnimalProfile["conformationScores"][number]) => sum + s.score, 0) / animal.conformationScores.length
    components.push(avg / 100)
  }

  const pct = (components.reduce((a, b) => a + b, 0) /components.length) * 100

  switch(true) {
    case (pct >= 85): return "A"
    case (pct >= 70): return "B"
    case (pct >= 55): return "C"
    case (pct >= 40): return "D"
    default: return "F"
  }
}
