import type { AnimalProfile } from "../types"
import { Panel, Badge, ActionButton } from "@/components/game/ui"
import { Stethoscope, ShieldCheck, FlaskConical, CalendarClock, Pill } from "lucide-react"

type HealthRecord = AnimalProfile["healthRecords"][number]
type TreatmentRecord = HealthRecord["treatmentRecords"][number]

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

export function HealthPanel({ animal }: { animal: AnimalProfile }) {
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)
  const hasOTCTreatment = activeConditions.some((r) =>
    r.treatmentRecords.some((t) => t.isActive && t.treatmentDef.treatmentType === "OTC")
  )

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
                {/* Condition header */}
                <div className="flex items-center justify-between gap-2 bg-destructive/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="danger">{record.conditionDef.conditionType}</Badge>
                    <span className="text-sm font-semibold text-foreground">{record.conditionDef.name}</span>
                  </div>
                  {isUntreated && <Badge tone="muted">Untreated</Badge>}
                </div>

                {/* Treatments */}
                {activeTreatments.map((t: TreatmentRecord) => {
                  const activeRestrictions = t.activityRestriction.filter((r) => r.isActive)
                  const needsAction = t.treatmentDef.treatmentType === "PRESCRIPTION" || t.treatmentDef.treatmentType === "VET_PROCEDURE"
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
                      {needsAction && (
                        <div className="mt-1.5">
                          <ActionButton variant="soft" disabled className="justify-center w-full">
                            {t.treatmentDef.treatmentType === "PRESCRIPTION"
                              ? <><Pill className="size-3.5" /> Administer Medication</>
                              : <><CalendarClock className="size-3.5" /> Book Procedure</>
                            }
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

      <div className="mt-3 flex gap-2">
        <ActionButton variant="soft" disabled className="flex-1 justify-center">
          <Stethoscope className="size-3.5" />
          Visit Vet
        </ActionButton>
        {hasOTCTreatment && (
          <ActionButton variant="soft" disabled className="flex-1 justify-center">
            <FlaskConical className="size-3.5" />
            Buy OTC Meds
          </ActionButton>
        )}
      </div>

      {animal.healthCertificates.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Certificates
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {animal.healthCertificates.map((cert: AnimalProfile["healthCertificates"][number]) => (
              <span
                key={cert.id}
                className="inline-flex items-center gap-1 rounded-md border border-chart-2/30 bg-chart-2/10 px-2 py-1 text-[11px] font-medium text-chart-2"
              >
                <ShieldCheck className="size-3" /> {cert.certDef.name}
              </span>
            ))}
          </div>
        </>
      )}

      {animal.testResults.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Panel Tests
          </h4>
          <div className="space-y-1.5">
            {animal.testResults.map((t: AnimalProfile["testResults"][number]) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
              >
                <span className="text-xs font-semibold text-foreground">{t.conditionDef.name}</span>
                <Badge tone="success">Tested · {t.result}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
