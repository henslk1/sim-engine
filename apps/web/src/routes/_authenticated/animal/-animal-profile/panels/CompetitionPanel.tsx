import type { AnimalProfile } from "../types"
import { Panel, ActionButton, Meter } from "@/components/game/ui"
import { Trophy, CheckCircle, XCircle, Ban, MapPin } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { isTourRunning } from "@/lib/tutorial"
import { cn } from "@/lib/utils"
import { getActiveRestrictions } from "../utils"
import { useTutorialAccess } from "@/lib/tutorial/access"

type Cert = {
  isValid: boolean
  expiresAtCycle: number
  certDef: { id: string }
}

type EquippedItem = { itemDef: { id: string } }
type EquipmentRequirement = {
  id: string
  quantity: number
  requirementGroup: string | null
  itemDef: { id: string; name: string }
}
type CompetitionTier = {
  disciplineDefId: string
  disciplineDef: { equipmentRequirements: EquipmentRequirement[] }
  tierDef: { name: string; advancementThreshold: number | null }
}

// Monday-based UTC week, matching how the engine buckets points in competition/run.ts.
function currentWeekStart() {
  const now = new Date()
  const day = now.getUTCDay()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1))
  start.setUTCHours(0, 0, 0, 0)
  return start.getTime()
}

function InfoCard({ label, value, tutorialKey }: { label: string; value: string; tutorialKey?: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2" data-tutorial={tutorialKey}>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function VenuesButton({ to, search, disabled, tutorialKey }: { to: string; search: Record<string, unknown>; disabled?: boolean; tutorialKey?: string }) {
  if (disabled) {
    return (
      <ActionButton variant="soft" className="w-full justify-center" disabled data-tutorial={tutorialKey}>
        <MapPin className="size-3.5" />
        View Venues
      </ActionButton>
    )
  }
  return (
    <Link to={to} search={search} data-tutorial={tutorialKey}>
      <ActionButton variant="primary" className="w-full justify-center">
        <MapPin className="size-3.5" />
        View Venues
      </ActionButton>
    </Link>
  )
}

export function CompetitionPanel({ animal, readonly = false }: { animal: AnimalProfile; readonly?: boolean }) {
  const tutorialAccess = useTutorialAccess()
  const canCompete = animal.lifeStage.canCompete
  const [activeTabIndex, setActiveTabIndex] = useState<0 | 1>(0)
  const [selectedDisciplineId, setSelectedDisciplineId] = useState("")
  const [selectedSecondDisciplineId, setSelectedSecondDisciplineId] = useState("")
  const [isAddingSecond, setIsAddingSecond] = useState(false)

  const stageIndex = animal.lifeStage.stageIndex
  const { data: allDisciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: animal.gameId },
    { enabled: canCompete },
  )

  const disciplinesForStage = allDisciplines?.filter((d) =>
    (d.minLifeStageIndex === null || stageIndex >= d.minLifeStageIndex) &&
    (d.maxLifeStageIndex === null || stageIndex <= d.maxLifeStageIndex)
  )
  const selectablePrimaryDisciplines = tutorialAccess.restricted && tutorialAccess.step === 192
    ? disciplinesForStage?.filter(d => d.isConformation && d.name === "Weanling Halter")
    : disciplinesForStage

  const disc1 = animal.disciplineDef
  const disc2 = animal.secondaryDisciplineDef
  // The discipline tab bar only renders with two disciplines, and its active
  // label already names the discipline — so the Discipline card directly below
  // it is pure duplication. Dropping it gives the remaining cards ~143px each
  // instead of 92px, which is what was wrapping the longer names.
  const hasDisciplineTabs = !!disc1 && !!disc2
  const compTiers = animal.compTiers as CompetitionTier[]
  const equippedItems = animal.equipment as EquippedItem[]
  const healthCertificates = animal.healthCertificates as Cert[]
  const disc1Tier = disc1 ? compTiers.find((tier) => tier.disciplineDefId === disc1.id) : null
  const disc2Tier = disc2 ? compTiers.find((tier) => tier.disciplineDefId === disc2.id) : null

  const isPurebred = !!animal.breed && !animal.breed.isUnregistered
  const isInspected = animal.conformationScores.length > 0

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const setDiscipline = trpc.animal.setDiscipline.useMutation({ onSuccess: invalidate })
  const setSecondaryDiscipline = trpc.animal.setSecondaryDiscipline.useMutation({
    onSuccess: () => { setIsAddingSecond(false); setSelectedSecondDisciplineId(""); invalidate() },
  })

  const weekStart = currentWeekStart()
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)

  function renderDiscipline(
    disc: { id: string; name: string; isConformation: boolean },
    tier: CompetitionTier | null | undefined,
    isSecondary = false
  ) {
    // Only this week's row counts — the query returns prior weeks too, and without
    // the week check a discipline the animal hasn't competed in since last week
    // would show that week's stale total. Weekly points drive invitational
    // eligibility, so they are shown as their own figure.
    const weeklyPts = animal.weeklyPoints.find(
      (p) => p.disciplineDefId === disc.id && new Date(p.weekStart).getTime() === weekStart
    )?.points
    // Tier progress is the career total in the discipline, matching how the
    // server advances tiers. Using the weekly figure here made the bar reset
    // every Monday and disagree with the animal's own competition history.
    const careerPts = animal.competitionEntries.reduce(
      (sum, e) => e.competition.disciplineDef.id === disc.id ? sum + (e.result?.score ?? 0) : sum,
      0
    )
    const startingTierDef = allDisciplines?.find((d) => d.id === disc.id)?.compTierDefs?.[0]
    const equipmentRequirements = tier?.disciplineDef.equipmentRequirements ?? []
    const individualRequirements = equipmentRequirements.filter(req => !req.requirementGroup)
    const groupedRequirements = new Map<string, EquipmentRequirement[]>()
    for (const requirement of equipmentRequirements) {
      if (!requirement.requirementGroup) continue
      groupedRequirements.set(requirement.requirementGroup, [...(groupedRequirements.get(requirement.requirementGroup) ?? []), requirement])
    }
    const requirementMet = (req: EquipmentRequirement) => equippedItems.filter((equipment) => equipment.itemDef.id === req.itemDef.id).length >= req.quantity
    const allEquipmentMet = individualRequirements.every(requirementMet) && [...groupedRequirements.values()].every(group => group.some(requirementMet))
    const allCertsMet = requiredCertDefs.every((def) => {
      const cert = healthCertificates.find((certificate) => certificate.certDef.id === def.id)
      return !!cert && cert.isValid && cert.expiresAtCycle >= animal.ageInCycles
    })

    // Equipment and certificates are the owner's to satisfy. For a visitor this
    // collapses to null so the views below fall through to the discipline, tier
    // and progress cards — seeing another animal's progress is the point.
    const missingRequirements = !readonly && (!allEquipmentMet || !allCertsMet) ? (
      <div className="space-y-3" data-tutorial={isSecondary ? "secondary-missing-equipment" : "competition-missing-requirements"}>
        {equipmentRequirements.length > 0 && (
          <div data-tutorial={isSecondary ? "secondary-equipment-section" : "competition-equipment-requirements"}>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipment</h4>
            <div className="space-y-1">
              {equipmentRequirements.map((req) => {
                const equipped = equippedItems.filter((equipment) => equipment.itemDef.id === req.itemDef.id).length
                const met = equipped >= req.quantity
                return (
                  <div key={req.id} className="flex items-center gap-1.5 text-[11px]">
                    {met ? <CheckCircle className="size-3.5 shrink-0 text-chart-2" /> : <XCircle className="size-3.5 shrink-0 text-destructive" />}
                    <span className={met ? "text-foreground" : "text-destructive"}>{req.itemDef.name}</span>
                    {req.quantity > 1 && <span className="ml-auto tabular-nums text-muted-foreground">{equipped}/{req.quantity}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {requiredCertDefs.length > 0 && (
          <div data-tutorial="competition-cert-requirements">
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Certificates</h4>
            <div className="space-y-1">
              {requiredCertDefs.map((def) => {
                const cert = healthCertificates.find((certificate) => certificate.certDef.id === def.id)
                const met = !!cert && cert.isValid && cert.expiresAtCycle >= animal.ageInCycles
                return (
                  <div key={def.id} className="flex items-center gap-1.5 text-[11px]">
                    {met ? <CheckCircle className="size-3.5 shrink-0 text-chart-2" /> : <XCircle className="size-3.5 shrink-0 text-destructive" />}
                    <span className={met ? "text-foreground" : "text-destructive"}>{def.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {!readonly && <ActionButton variant="soft" className="w-full justify-center" disabled><MapPin className="size-3.5" />Browse Venues</ActionButton>}
      </div>
    ) : null

    if (disc.isConformation) {
      if (!isPurebred) {
        return <p className="text-[11px] text-muted-foreground">Conformation scoring applies to purebreds only.</p>
      }
      if (!isInspected) {
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Enter an inspection show at a venue to reveal this animal's conformation score.
            </p>
            <div className="pointer-events-none opacity-40">
              <div className={cn("grid gap-2", hasDisciplineTabs ? "grid-cols-2" : "grid-cols-3")}>
                {!hasDisciplineTabs && <InfoCard label="Discipline" value={disc.name} />}
                <InfoCard label="Current Tier" value="—" />
                <InfoCard label="Weekly Points" value="— pts" />
              </div>
            </div>
            {!readonly && (
              isRestricted ? (
                <ActionButton variant="soft" className="w-full justify-center" disabled>
                  <MapPin className="size-3.5" />
                  Find Inspection Show
                </ActionButton>
              ) : (
                <Link to="/venues" search={{ animalId: animal.id, from: "animal" as const }}>
                  <ActionButton variant="soft" className="w-full justify-center">
                    <MapPin className="size-3.5" />
                    Find Inspection Show
                  </ActionButton>
                </Link>
              )
            )}
          </div>
        )
      }
      if (missingRequirements) return missingRequirements
      const tierName = tier?.tierDef.name ?? startingTierDef?.name
      const threshold = tier?.tierDef.advancementThreshold ?? startingTierDef?.advancementThreshold
      return (
        <div className="space-y-2">
          <div className={cn("grid gap-2", hasDisciplineTabs ? "grid-cols-2" : "grid-cols-3")}>
            {!hasDisciplineTabs && <InfoCard label="Discipline" value={disc.name} />}
            <InfoCard label="Current Tier" value={tierName ?? "—"} tutorialKey="tutorial-compete-tier-info" />
            <InfoCard label="Weekly Points" value={weeklyPts !== undefined ? `${Math.round(weeklyPts)} pts` : "—"} />
          </div>
          {threshold != null && (
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2" data-tutorial="tutorial-tier-progress">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress to Next Tier
                </p>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(careerPts)} / {Math.round(threshold)}
                </span>
              </div>
              <Meter value={careerPts} max={threshold} tone="condition" className="h-1.5" />
            </div>
          )}
          {!readonly && (
            <VenuesButton to="/venues" search={{ animalId: animal.id, from: "animal" }} disabled={isRestricted} tutorialKey="view-venues-btn" />
          )}
        </div>
      )
    }

    if (missingRequirements) return missingRequirements

    return (
      <div className="space-y-2">
        <div className={cn("grid gap-2", hasDisciplineTabs ? "grid-cols-2" : "grid-cols-3")}>
          {!hasDisciplineTabs && <InfoCard label="Discipline" value={disc.name} />}
          <InfoCard label="Current Tier" value={tier?.tierDef.name ?? "—"} />
          <InfoCard label="Weekly Points" value={weeklyPts !== undefined ? `${Math.round(weeklyPts)} pts` : "—"} />
        </div>
        {tier?.tierDef.advancementThreshold != null && (
          <div
            className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2"
            data-tutorial={isSecondary ? "secondary-discipline-progress-bar" : undefined}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Progress to Next Tier
              </p>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.round(careerPts)} /{" "}
                {Math.round(tier.tierDef.advancementThreshold)}
              </span>
            </div>
            <Meter
              value={careerPts}
              max={tier.tierDef.advancementThreshold}
              tone="condition"
              className="h-1.5"
            />
          </div>
        )}
        {!readonly && (
          <VenuesButton
            to="/venues"
            search={{ animalId: animal.id, from: "animal" }}
            disabled={isRestricted}
            tutorialKey="view-venues-btn"
          />
        )}
      </div>
    )
  }

  return (
    <Panel title="Competition" icon={<Trophy className="size-4 text-chart-1" />} data-tutorial="competition-panel">
      {disc1 && <span data-tutorial="primary-discipline-name" className="sr-only">{disc1.name}</span>}
      {!canCompete ? (
        <p className="text-[11px] text-muted-foreground">Not available at this life stage.</p>
      ) : (
        <>
          {isRestricted && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              <Ban className="size-3 shrink-0" />
              Competition restricted due to active treatment
            </div>
          )}

          {!disc1 ? (
            readonly ? (
              <p className="text-[11px] text-muted-foreground">No discipline assigned</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">No discipline assigned yet.</p>
                <div className="flex gap-2">
                  <select
                    data-tutorial="discipline-select"
                    value={selectedDisciplineId}
                    onChange={(e) => setSelectedDisciplineId(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choose discipline…</option>
                    {selectablePrimaryDisciplines?.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <ActionButton
                    data-tutorial="discipline-confirm"
                    variant="soft"
                    disabled={!selectedDisciplineId || setDiscipline.isPending}
                    onClick={() => selectedDisciplineId && setDiscipline.mutate({ animalId: animal.id, disciplineDefId: selectedDisciplineId })}
                  >
                    {setDiscipline.isPending ? "Saving…" : "Confirm"}
                  </ActionButton>
                </div>
                {setDiscipline.error && (
                  <p className="text-[11px] text-destructive">{setDiscipline.error.message}</p>
                )}
              </div>
            )
          ) : !disc2 ? (
            <div data-tutorial="primary-discipline-section" className="space-y-3">
              {renderDiscipline(disc1, disc1Tier)}
              {!readonly && (
                isAddingSecond ? (
                  <div data-tutorial="add-discipline-form" className="space-y-2 border-t border-border pt-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">Add Second Discipline</p>
                    <div className="flex gap-2">
                      <select
                        data-tutorial="discipline-select"
                        value={selectedSecondDisciplineId}
                        onChange={(e) => setSelectedSecondDisciplineId(e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Choose discipline…</option>
                        {disciplinesForStage?.filter((d) => d.id !== disc1.id && (!isTourRunning() || d.isTutorialSelectable)).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <ActionButton
                        data-tutorial="discipline-confirm"
                        variant="soft"
                        disabled={!selectedSecondDisciplineId || setSecondaryDiscipline.isPending}
                        onClick={() => selectedSecondDisciplineId && setSecondaryDiscipline.mutate({ animalId: animal.id, disciplineDefId: selectedSecondDisciplineId })}
                      >
                        {setSecondaryDiscipline.isPending ? "Saving…" : "Confirm"}
                      </ActionButton>
                      <ActionButton
                        data-tutorial="discipline-cancel"
                        variant="soft"
                        onClick={() => { setIsAddingSecond(false); setSelectedSecondDisciplineId("") }}
                      >
                        Cancel
                      </ActionButton>
                    </div>
                    {setSecondaryDiscipline.error && (
                      <p className="text-[11px] text-destructive">{setSecondaryDiscipline.error.message}</p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-border pt-2">
                    <ActionButton
                      data-tutorial="add-second-discipline"
                      variant="soft"
                      className="w-full justify-center"
                      onClick={() => setIsAddingSecond(true)}
                    >
                      + Add Second Discipline
                    </ActionButton>
                  </div>
                )
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-0.5 rounded-md border border-border bg-secondary/30 p-0.5">
                <button
                  data-tutorial="discipline-tab-1"
                  onClick={() => setActiveTabIndex(0)}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    activeTabIndex === 0
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {disc1.name}
                </button>
                <button
                  data-tutorial="discipline-tab-2"
                  onClick={() => setActiveTabIndex(1)}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    activeTabIndex === 1
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {disc2.name}
                </button>
              </div>
              <div data-tutorial={activeTabIndex === 1 ? "secondary-discipline-section" : undefined}>
                {activeTabIndex === 0
                  ? renderDiscipline(disc1, disc1Tier)
                  : renderDiscipline(disc2, disc2Tier, true)}
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  )
}
