import type { AnimalProfile } from "../types"
import { Panel, ActionButton, Meter } from "@/components/game/ui"
import { Trophy, CheckCircle, XCircle, Ban, MapPin } from "lucide-react"
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
  const currentTier = animal.compTiers[0]
  const latestWeeklyPoints = animal.weeklyPoints[0]?.points
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("COMPETITION") || restrictions.has("ALL")

  const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)

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

          {!readonly && (
            <ActionButton variant="soft" disabled className="w-full justify-center">
              <MapPin className="size-3.5" />
              Browse Venues
            </ActionButton>
          )}

          {(currentTier?.disciplineDef.equipmentRequirements.length ?? 0) > 0 || requiredCertDefs.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
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
            </div>
          ) : null}

        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">No discipline assigned</p>
      )}
      </>
      )}
    </Panel>
  )
}
