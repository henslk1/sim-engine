import type { AnimalProfile } from "../types"
import { Panel, ActionButton, Meter } from "@/components/game/ui"
import { Trophy, CheckCircle, XCircle, Ban, MapPin } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
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

export function CompetitionPanel({ animal, readonly = false }: { animal: AnimalProfile; readonly?: boolean }) {
  const canCompete = animal.lifeStage.canCompete
  const currentTier = animal.compTiers.find((t) => !t.disciplineDef.isConformation) ?? animal.compTiers[0]
  const conformationTiers = animal.compTiers.filter((t) => t.disciplineDef.isConformation)
  const [selectedDisciplineId, setSelectedDisciplineId] = useState("")

  const { data: allDisciplines } = trpc.admin.discipline.list.useQuery(
    { gameId: animal.gameId },
    { enabled: !animal.disciplineDef && canCompete && !readonly },
  )
  const disciplines = allDisciplines?.filter((d) => !d.isConformation)

  const utils = trpc.useUtils()
  const setDiscipline = trpc.animal.setDiscipline.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })
  const latestWeeklyPoints = animal.weeklyPoints.find(
    (p) => p.disciplineDefId === currentTier?.disciplineDefId
  )?.points
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)

  const allEquipmentMet = (currentTier?.disciplineDef.equipmentRequirements ?? []).every(
    (req) => animal.equipment.filter((eq) => eq.itemDef.id === req.itemDef.id).length >= req.quantity
  )
  const allCertsMet = requiredCertDefs.every((def) => {
    const cert = animal.healthCertificates.find((c: Cert) => c.certDef.id === def.id)
    return !!cert && cert.isValid && cert.expiresAtCycle > animal.ageInCycles
  })
  const canBrowseVenues = !isRestricted && allEquipmentMet && allCertsMet

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
      {animal.disciplineDef ? (
        <>
          {!allEquipmentMet || !allCertsMet ? (
            <div className="space-y-3">
              {(currentTier?.disciplineDef.equipmentRequirements.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipment</h4>
                  <div className="space-y-1">
                    {currentTier!.disciplineDef.equipmentRequirements.map(
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
            <>
              <div className="mb-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <InfoCard label="Discipline" value={animal.disciplineDef.name} />
                  <InfoCard label="Current Tier" value={currentTier?.tierDef.name ?? "—"} />
                  <InfoCard label="Weekly Points" value={latestWeeklyPoints !== undefined ? `${Math.round(latestWeeklyPoints)} pts` : "—"} />
                </div>
                {currentTier?.tierDef.advancementThreshold != null && (
                  <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Progress to Next Tier
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {latestWeeklyPoints !== undefined ? Math.round(latestWeeklyPoints) : 0} /{" "}
                        {Math.round(currentTier.tierDef.advancementThreshold)}
                      </span>
                    </div>
                    <Meter
                      value={latestWeeklyPoints ?? 0}
                      max={currentTier.tierDef.advancementThreshold}
                      tone="condition"
                      className="h-1.5"
                    />
                  </div>
                )}
              </div>

            </>
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
              {disciplines?.map((d) => (
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
      {conformationTiers.map((tier) => {
        const confPoints = animal.weeklyPoints.find((p) => p.disciplineDefId === tier.disciplineDefId)?.points
        return (
          <div key={tier.disciplineDefId} className="mt-3 border-t border-border/50 pt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <InfoCard label="Discipline" value={tier.disciplineDef.name} />
              <InfoCard label="Current Tier" value={tier.tierDef.name} />
              <InfoCard label="Weekly Points" value={confPoints !== undefined ? `${Math.round(confPoints)} pts` : "—"} />
            </div>
            {tier.tierDef.advancementThreshold != null && (
              <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress to Next Tier</p>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {confPoints !== undefined ? Math.round(confPoints) : 0} / {Math.round(tier.tierDef.advancementThreshold)}
                  </span>
                </div>
                <Meter value={confPoints ?? 0} max={tier.tierDef.advancementThreshold} tone="condition" className="h-1.5" />
              </div>
            )}
          </div>
        )
      })}
      {canCompete && !readonly && (
        <div className="mt-3 border-t border-border/50 pt-3">
          {canBrowseVenues ? (
            <Link to="/venues" search={{ animalId: animal.id, from: "animal" as const }}>
              <ActionButton variant="soft" className="w-full justify-center">
                <MapPin className="size-3.5" />
                View Venues
              </ActionButton>
            </Link>
          ) : (
            <ActionButton variant="soft" className="w-full justify-center" disabled>
              <MapPin className="size-3.5" />
              View Venues
            </ActionButton>
          )}
        </div>
      )}
      </>
      )}
    </Panel>
  )
}
