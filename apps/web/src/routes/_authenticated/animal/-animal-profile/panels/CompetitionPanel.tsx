import type { AnimalProfile } from "../types"
import { Panel, ActionButton, Meter } from "@/components/game/ui"
import { Trophy, CheckCircle, XCircle, Ban, MapPin } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import { getActiveRestrictions } from "../utils"

type Cert = AnimalProfile["healthCertificates"][number]

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function VenuesButton({ to, search, disabled }: { to: string; search: Record<string, unknown>; disabled?: boolean }) {
  if (disabled) {
    return (
      <ActionButton variant="soft" className="w-full justify-center" disabled>
        <MapPin className="size-3.5" />
        View Venues
      </ActionButton>
    )
  }
  return (
    <Link to={to} search={search}>
      <ActionButton variant="soft" className="w-full justify-center">
        <MapPin className="size-3.5" />
        View Venues
      </ActionButton>
    </Link>
  )
}

export function CompetitionPanel({ animal, readonly = false }: { animal: AnimalProfile; readonly?: boolean }) {
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

  const disc1 = animal.disciplineDef
  const disc2 = animal.secondaryDisciplineDef
  const disc1Tier = disc1 ? animal.compTiers.find((t) => t.disciplineDefId === disc1.id) : null
  const disc2Tier = disc2 ? animal.compTiers.find((t) => t.disciplineDefId === disc2.id) : null

  const isPurebred = !!animal.breed && !animal.breed.isUnregistered
  const isInspected = animal.conformationScores.length > 0

  const utils = trpc.useUtils()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const setDiscipline = trpc.animal.setDiscipline.useMutation({ onSuccess: invalidate })
  const setSecondaryDiscipline = trpc.animal.setSecondaryDiscipline.useMutation({
    onSuccess: () => { setIsAddingSecond(false); setSelectedSecondDisciplineId(""); invalidate() },
  })

  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)

  function renderDiscipline(
    disc: { id: string; name: string; isConformation: boolean },
    tier: AnimalProfile["compTiers"][number] | null | undefined
  ) {
    const weeklyPts = animal.weeklyPoints.find((p) => p.disciplineDefId === disc.id)?.points
    const startingTierDef = allDisciplines?.find((d) => d.id === disc.id)?.compTierDefs?.[0]

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
              <div className="grid grid-cols-3 gap-2">
                <InfoCard label="Discipline" value={disc.name} />
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
      const tierName = tier?.tierDef.name ?? startingTierDef?.name
      const threshold = tier?.tierDef.advancementThreshold ?? startingTierDef?.advancementThreshold
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <InfoCard label="Discipline" value={disc.name} />
            <InfoCard label="Current Tier" value={tierName ?? "—"} />
            <InfoCard label="Weekly Points" value={weeklyPts !== undefined ? `${Math.round(weeklyPts)} pts` : "—"} />
          </div>
          {threshold != null && (
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress to Next Tier
                </p>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {weeklyPts !== undefined ? Math.round(weeklyPts) : 0} / {Math.round(threshold)}
                </span>
              </div>
              <Meter value={weeklyPts ?? 0} max={threshold} tone="condition" className="h-1.5" />
            </div>
          )}
          {!readonly && (
            <VenuesButton to="/venues" search={{ animalId: animal.id, from: "animal" }} disabled={isRestricted} />
          )}
        </div>
      )
    }

    // Sport discipline
    const allEquipmentMet = (tier?.disciplineDef.equipmentRequirements ?? []).every(
      (req) => animal.equipment.filter((eq) => eq.itemDef.id === req.itemDef.id).length >= req.quantity
    )
    const allCertsMet = requiredCertDefs.every((def) => {
      const cert = animal.healthCertificates.find((c: Cert) => c.certDef.id === def.id)
      return !!cert && cert.isValid && cert.expiresAtCycle > animal.ageInCycles
    })

    if (!allEquipmentMet || !allCertsMet) {
      return (
        <div className="space-y-3">
          {(tier?.disciplineDef.equipmentRequirements.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipment</h4>
              <div className="space-y-1">
                {tier!.disciplineDef.equipmentRequirements.map(
                  (req: AnimalProfile["compTiers"][number]["disciplineDef"]["equipmentRequirements"][number]) => {
                    const equipped = animal.equipment.filter(
                      (eq: AnimalProfile["equipment"][number]) => eq.itemDef.id === req.itemDef.id
                    ).length
                    const met = equipped >= req.quantity
                    return (
                      <div key={req.id} className="flex items-center gap-1.5 text-[11px]">
                        {met ? (
                          <CheckCircle className="size-3.5 shrink-0 text-chart-2" />
                        ) : (
                          <XCircle className="size-3.5 shrink-0 text-destructive" />
                        )}
                        <span className={met ? "text-foreground" : "text-destructive"}>{req.itemDef.name}</span>
                        {req.quantity > 1 && (
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {equipped}/{req.quantity}
                          </span>
                        )}
                      </div>
                    )
                  }
                )}
              </div>
            </div>
          )}
          {requiredCertDefs.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Certificates</h4>
              <div className="space-y-1">
                {requiredCertDefs.map((def) => {
                  const cert = animal.healthCertificates.find((c: Cert) => c.certDef.id === def.id)
                  const met = !!cert && cert.isValid && cert.expiresAtCycle > animal.ageInCycles
                  return (
                    <div key={def.id} className="flex items-center gap-1.5 text-[11px]">
                      {met ? (
                        <CheckCircle className="size-3.5 shrink-0 text-chart-2" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0 text-destructive" />
                      )}
                      <span className={met ? "text-foreground" : "text-destructive"}>{def.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {!readonly && (
            <ActionButton variant="soft" className="w-full justify-center" disabled>
              <MapPin className="size-3.5" />
              Browse Venues
            </ActionButton>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <InfoCard label="Discipline" value={disc.name} />
          <InfoCard label="Current Tier" value={tier?.tierDef.name ?? "—"} />
          <InfoCard label="Weekly Points" value={weeklyPts !== undefined ? `${Math.round(weeklyPts)} pts` : "—"} />
        </div>
        {tier?.tierDef.advancementThreshold != null && (
          <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Progress to Next Tier
              </p>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {weeklyPts !== undefined ? Math.round(weeklyPts) : 0} /{" "}
                {Math.round(tier.tierDef.advancementThreshold)}
              </span>
            </div>
            <Meter
              value={weeklyPts ?? 0}
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
          />
        )}
      </div>
    )
  }

  return (
    <Panel title="Competition" icon={<Trophy className="size-4 text-chart-1" />}>
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
                    value={selectedDisciplineId}
                    onChange={(e) => setSelectedDisciplineId(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choose discipline…</option>
                    {disciplinesForStage?.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <ActionButton
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
            <div className="space-y-3">
              {renderDiscipline(disc1, disc1Tier)}
              {!readonly && (
                isAddingSecond ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">Add Second Discipline</p>
                    <div className="flex gap-2">
                      <select
                        value={selectedSecondDisciplineId}
                        onChange={(e) => setSelectedSecondDisciplineId(e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Choose discipline…</option>
                        {disciplinesForStage?.filter((d) => d.id !== disc1.id).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <ActionButton
                        variant="soft"
                        disabled={!selectedSecondDisciplineId || setSecondaryDiscipline.isPending}
                        onClick={() => selectedSecondDisciplineId && setSecondaryDiscipline.mutate({ animalId: animal.id, disciplineDefId: selectedSecondDisciplineId })}
                      >
                        {setSecondaryDiscipline.isPending ? "Saving…" : "Confirm"}
                      </ActionButton>
                      <ActionButton
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
              {activeTabIndex === 0
                ? renderDiscipline(disc1, disc1Tier)
                : renderDiscipline(disc2, disc2Tier)}
            </>
          )}
        </>
      )}
    </Panel>
  )
}
