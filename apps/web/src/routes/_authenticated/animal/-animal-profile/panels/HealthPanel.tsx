import type { AnimalProfile } from "../types"
import { Panel, Badge, ActionButton } from "@/components/game/ui"
import { Stethoscope, ShieldCheck, ShieldAlert, FlaskConical, CalendarClock, Pill } from "lucide-react"

type HealthRecord = AnimalProfile["healthRecords"][number]
type TreatmentRecord = HealthRecord["treatmentRecords"][number]
type Cert = AnimalProfile["healthCertificates"][number]

const TREATMENT_LABEL: Record<string, string> = {
  OTC: "OTC",
  PRESCRIPTION: "Rx",
  VET_PROCEDURE: "Procedure",
  ACTIVITY_RESTRICTION: "Restriction",
  PLAYER_ACTION: "Self-care",
}

const RESTRICTION_LABEL: Record<string, string> = {
  TRAINING: "Training",
  COMPETITION: "Competition",
  BREEDING: "Breeding",
  CARE_ACTION: "Care actions",
  ALL: "All activities",
}

export function HealthPanel({ animal, readonly = false }: { animal: AnimalProfile; readonly?: boolean }) {
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)
  const hasOTCTreatment = activeConditions.some((r) =>
    r.treatmentRecords.some((t) => t.isActive && t.treatmentDef.treatmentType === "OTC")
  )

  const certDefs = animal.game.healthCertificateDefs

  return (
    <Panel title="Health" icon={<Stethoscope className="size-4 text-destructive" />}>
      {activeConditions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No active conditions</p>
      ) : (
        <div className="space-y-2">
          {activeConditions.map((record: HealthRecord) => {
            const activeTreatments = record.treatmentRecords.filter((t: TreatmentRecord) => t.isActive)
            const isUntreated = activeTreatments.length === 0
            return (
              <div key={record.id} className="overflow-hidden rounded-md border border-destructive/25">
                <div className="flex items-center justify-between gap-2 bg-destructive/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="danger">{record.conditionDef.conditionType}</Badge>
                    <span className="text-sm font-semibold text-foreground">{record.conditionDef.name}</span>
                  </div>
                  {isUntreated && <Badge tone="muted">Untreated</Badge>}
                </div>

                {activeTreatments.map((t: TreatmentRecord) => {
                  const needsAction =
                    t.treatmentDef.treatmentType === "PRESCRIPTION" ||
                    t.treatmentDef.treatmentType === "VET_PROCEDURE"
                  return (
                    <div key={t.id} className="border-t border-destructive/15 bg-destructive/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{t.treatmentDef.name}</span>
                        <Badge tone="muted">{TREATMENT_LABEL[t.treatmentDef.treatmentType]}</Badge>
                      </div>
                      {t.treatmentDef.durationCycles != null && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Duration: {t.treatmentDef.durationCycles} cycle{t.treatmentDef.durationCycles !== 1 ? "s" : ""}
                        </p>
                      )}
                      {t.treatmentDef.restrictionDefs.map((rd) => {
                        const live = t.activityRestriction.find(
                          (r) => r.isActive && r.restrictionType === rd.restrictionType
                        )
                        return (
                          <p key={rd.id} className="mt-0.5 text-[11px] text-destructive/80">
                            {RESTRICTION_LABEL[rd.restrictionType]} restricted
                            {(rd.maxIntensityTier ?? live?.maxIntensityTier) != null &&
                              ` · max tier ${rd.maxIntensityTier ?? live?.maxIntensityTier}`}
                            {live
                              ? ` · ${live.remainingCycles} cycle${live.remainingCycles !== 1 ? "s" : ""} remaining`
                              : rd.durationCycles != null
                              ? ` · ${rd.durationCycles} cycles`
                              : ""}
                          </p>
                        )
                      })}
                      {needsAction && !readonly && (
                        <div className="mt-1.5">
                          <ActionButton variant="soft" disabled className="w-full justify-center">
                            {t.treatmentDef.treatmentType === "PRESCRIPTION" ? (
                              <><Pill className="size-3.5" /> Administer Medication</>
                            ) : (
                              <><CalendarClock className="size-3.5" /> Book Procedure</>
                            )}
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {hasOTCTreatment && !readonly && (
        <div className="mt-3">
          <ActionButton variant="soft" disabled className="w-full justify-center">
            <FlaskConical className="size-3.5" />
            Buy OTC Meds
          </ActionButton>
        </div>
      )}

      {certDefs.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Certificates
          </h4>
          <div className="space-y-1.5">
            {certDefs.map((def) => {
              const cert = animal.healthCertificates.find((c: Cert) => c.certDef.id === def.id)
              const isExpired = cert && (cert.expiresAtCycle <= animal.ageInCycles || !cert.isValid)
              const isMissing = !cert
              const cyclesLeft = cert ? cert.expiresAtCycle - animal.ageInCycles : null

              return (
                <div
                  key={def.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    {isMissing || isExpired ? (
                      <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <ShieldCheck className="size-3.5 shrink-0 text-chart-2" />
                    )}
                    <span className="text-xs font-semibold text-foreground">{def.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isMissing ? (
                      <Badge tone="danger">Not certified</Badge>
                    ) : isExpired ? (
                      <Badge tone="danger">Expired</Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {cyclesLeft} cycle{cyclesLeft !== 1 ? "s" : ""} left
                      </span>
                    )}
                    {!readonly && (
                      <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">
                        Book Testing
                      </ActionButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
