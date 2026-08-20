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
  const [activeTab, setActiveTab] = useState<"sports" | "conformation">("sports")
  const [selectedDisciplineId, setSelectedDisciplineId] = useState("")

  const { data: allDisciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: animal.gameId },
    { enabled: canCompete },
  )
  const stageIndex = animal.lifeStage.stageIndex
  const sportsDisciplines = allDisciplines?.filter((d) =>
    !d.isConformation &&
    (d.minLifeStageIndex === null || stageIndex >= d.minLifeStageIndex) &&
    (d.maxLifeStageIndex === null || stageIndex <= d.maxLifeStageIndex)
  )
  const confDisciplinesForStage = allDisciplines?.filter((d) =>
    d.isConformation &&
    (d.minLifeStageIndex === null || stageIndex >= d.minLifeStageIndex) &&
    (d.maxLifeStageIndex === null || stageIndex <= d.maxLifeStageIndex)
  )

  const isPurebred = !!animal.breed && !animal.breed.isUnregistered
  const isInspected = animal.conformationScores.length > 0

  const utils = trpc.useUtils()
  const setDiscipline = trpc.animal.setDiscipline.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })

  // Sports data — explicitly non-conformation only, no fallback to conformation tier
  const sportsTier = animal.compTiers.find((t) => !t.disciplineDef.isConformation)
  const sportsPoints = animal.weeklyPoints.find(
    (p) => p.disciplineDefId === sportsTier?.disciplineDefId
  )?.points

  // Conformation data — explicitly conformation only
  const confTier = animal.compTiers.find((t) => t.disciplineDef.isConformation)
  const confDisciplineFromQuery = allDisciplines?.find((d) => d.isConformation)
  const confDisciplineName = confTier?.disciplineDef.name ?? confDisciplineFromQuery?.name
  const confStartingTierDef = confDisciplineFromQuery?.compTierDefs?.[0]
  const confPoints = animal.weeklyPoints.find((p) => p.disciplineDefId === confTier?.disciplineDefId)?.points

  // Show a tab if: query not yet loaded (optimistic), disciplines exist for this stage, or animal already has data for it
  const hasSportsDisciplines = !allDisciplines || (sportsDisciplines?.length ?? 0) > 0 || (!!animal.disciplineDef && !animal.disciplineDef.isConformation)
  const hasConformationDisciplines = !allDisciplines || (confDisciplinesForStage?.length ?? 0) > 0 || isInspected || !!confTier
  const availableTabs = (["sports", "conformation"] as const).filter(
    (t) => t === "sports" ? hasSportsDisciplines : hasConformationDisciplines
  )
  const effectiveTab = availableTabs.includes(activeTab) ? activeTab : (availableTabs[0] ?? "sports")

  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)
  const allEquipmentMet = (sportsTier?.disciplineDef.equipmentRequirements ?? []).every(
    (req) => animal.equipment.filter((eq) => eq.itemDef.id === req.itemDef.id).length >= req.quantity
  )
  const allCertsMet = requiredCertDefs.every((def) => {
    const cert = animal.healthCertificates.find((c: Cert) => c.certDef.id === def.id)
    return !!cert && cert.isValid && cert.expiresAtCycle > animal.ageInCycles
  })

  return (
    <Panel title="Competition" icon={<Trophy className="size-4 text-chart-1" />}>
      {!canCompete ? (
        <p className="text-[11px] text-muted-foreground">Not available at this life stage.</p>
      ) : availableTabs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No disciplines are available for this life stage.</p>
      ) : (
        <>
          {isRestricted && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              <Ban className="size-3 shrink-0" />
              Competition restricted due to active treatment
            </div>
          )}

          {/* Tab bar — only shown when both tabs are available */}
          {availableTabs.length > 1 && (
            <div className="mb-3 flex gap-0.5 rounded-md border border-border bg-secondary/30 p-0.5">
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    effectiveTab === tab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "sports" ? "Sports" : "Conformation"}
                </button>
              ))}
            </div>
          )}

          {/* Sports tab */}
          {effectiveTab === "sports" && hasSportsDisciplines && (
            <>
              {animal.disciplineDef ? (
                <>
                  {!allEquipmentMet || !allCertsMet ? (
                    <div className="space-y-3">
                      {(sportsTier?.disciplineDef.equipmentRequirements.length ?? 0) > 0 && (
                        <div>
                          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipment</h4>
                          <div className="space-y-1">
                            {sportsTier!.disciplineDef.equipmentRequirements.map(
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
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <InfoCard label="Discipline" value={animal.disciplineDef.name} />
                        <InfoCard label="Current Tier" value={sportsTier?.tierDef.name ?? "—"} />
                        <InfoCard label="Weekly Points" value={sportsPoints !== undefined ? `${Math.round(sportsPoints)} pts` : "—"} />
                      </div>
                      {sportsTier?.tierDef.advancementThreshold != null && (
                        <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                          <div className="mb-1.5 flex items-center justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Progress to Next Tier
                            </p>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {sportsPoints !== undefined ? Math.round(sportsPoints) : 0} /{" "}
                              {Math.round(sportsTier.tierDef.advancementThreshold)}
                            </span>
                          </div>
                          <Meter
                            value={sportsPoints ?? 0}
                            max={sportsTier.tierDef.advancementThreshold}
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
                  )}
                </>
              ) : readonly ? (
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
                      {sportsDisciplines?.map((d) => (
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
              )}
            </>
          )}

          {/* Conformation tab */}
          {effectiveTab === "conformation" && hasConformationDisciplines && (
            <>
              {!isPurebred ? (
                <p className="text-[11px] text-muted-foreground">Conformation scoring applies to purebreds only.</p>
              ) : !isInspected ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Enter an inspection show at a venue to reveal this animal's conformation score.
                  </p>
                  <div className="pointer-events-none opacity-40">
                    <div className="grid grid-cols-3 gap-2">
                      <InfoCard label="Discipline" value={confDisciplineName ?? "—"} />
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
              ) : confDisciplineName ? (
                <div className="space-y-2">
                  {(() => {
                    const tierName = confTier?.tierDef.name ?? confStartingTierDef?.name
                    const threshold = confTier?.tierDef.advancementThreshold ?? confStartingTierDef?.advancementThreshold
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <InfoCard label="Discipline" value={confDisciplineName} />
                          <InfoCard label="Current Tier" value={tierName ?? "—"} />
                          <InfoCard label="Weekly Points" value={confPoints !== undefined ? `${Math.round(confPoints)} pts` : "—"} />
                        </div>
                        {threshold != null && (
                          <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                            <div className="mb-1.5 flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Progress to Next Tier
                              </p>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {confPoints !== undefined ? Math.round(confPoints) : 0} / {Math.round(threshold)}
                              </span>
                            </div>
                            <Meter value={confPoints ?? 0} max={threshold} tone="condition" className="h-1.5" />
                          </div>
                        )}
                        {!readonly && (
                          <VenuesButton
                            to="/venues"
                            search={{ animalId: animal.id, from: "animal" }}
                            disabled={isRestricted}
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No conformation discipline configured.</p>
              )}
            </>
          )}
        </>
      )}
    </Panel>
  )
}
