import { useState } from "react"
import type { AnimalProfile } from "../types"
import { cn } from "@/lib/utils"
import { Panel, Badge, ActionButton, Dialog } from "@/components/game/ui"
import { Stethoscope, ShieldCheck, ShieldAlert, CalendarClock, Pill, FlaskConical, Footprints, CheckCircle2, HelpCircle, AlertTriangle } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"

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

export function HealthPanel({
  animal,
  playerAccountId,
  readonly = false,
}: {
  animal: AnimalProfile
  playerAccountId?: string
  readonly?: boolean
}) {
  const utils = trpc.useUtils()
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)

  const { data: inventory } = trpc.inventory.mine.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId && !readonly },
  )

  const administer = trpc.vet.administerTreatment.useMutation({
    onSuccess: () => {
      utils.animalProfile.get.invalidate({ animalId: animal.id })
      if (playerAccountId) utils.inventory.mine.invalidate({ playerAccountId })
    },
  })

  const [procedureOutcome, setProcedureOutcome] = useState<{ type: "death" | "episode"; conditionName: string } | null>(null)

  const startTreatment = trpc.vet.startTreatment.useMutation({
    onSuccess: (result) => {
      utils.animalProfile.get.invalidate({ animalId: animal.id })
      if (playerAccountId) utils.inventory.mine.invalidate({ playerAccountId })
      if (result.diedFromProcedure) {
        setProcedureOutcome({ type: "death", conditionName: result.conditionName })
      } else if (result.triggeredCondition) {
        setProcedureOutcome({ type: "episode", conditionName: result.triggeredCondition })
      }
    },
  })

  const certDefs = animal.game.healthCertificateDefs

  function hasItems(items: TreatmentRecord["treatmentDef"]["items"]) {
    if (!inventory || items.length === 0) return true
    return items.every((item) => {
      const inv = inventory.find((i) => i.itemDef.id === item.itemDef.id)
      return inv && inv.quantity >= item.quantity
    })
  }

  function missingItems(items: TreatmentRecord["treatmentDef"]["items"]) {
    if (!inventory) return []
    return items.filter((item) => {
      const inv = inventory.find((i) => i.itemDef.id === item.itemDef.id)
      return !inv || inv.quantity < item.quantity
    })
  }

  return (
    <Panel title="Health" icon={<Stethoscope className="size-4 text-destructive" />}>
      {activeConditions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No active conditions</p>
      ) : (
        <div className="space-y-2">
          {activeConditions.map((record: HealthRecord) => {
            const activeTreatments = record.treatmentRecords.filter((t: TreatmentRecord) => t.isActive)
            const isUntreated = activeTreatments.length === 0
            const administeredToday = activeTreatments.some((t) => {
              const isTimeBased = t.treatmentDef.treatmentType === "OTC" || t.treatmentDef.treatmentType === "PRESCRIPTION" || t.treatmentDef.treatmentType === "PLAYER_ACTION"
              return isTimeBased && (t as TreatmentRecord & { lastAdministeredCycle?: number | null }).lastAdministeredCycle === animal.ageInCycles
            })
            const showRed = !administeredToday
            return (
              <div key={record.id} className={cn("overflow-hidden rounded-md border", showRed ? "border-destructive/25" : "border-border")}>
                <div className={cn("flex items-center justify-between gap-2 px-3 py-2", showRed ? "bg-destructive/10" : "bg-secondary/40")}>
                  <div className="flex items-center gap-2">
                    {record.diagnosedAt ? (
                      <>
                        <Badge tone="danger">{record.conditionDef.conditionType}</Badge>
                        <span className="text-sm font-semibold text-foreground">{record.conditionDef.name}</span>
                      </>
                    ) : (
                      <>
                        <HelpCircle className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted-foreground">Unknown illness</span>
                      </>
                    )}
                  </div>
                  {isUntreated && <Badge tone="muted">{record.diagnosedAt ? "Untreated" : "Undiagnosed"}</Badge>}
                </div>

                {!record.diagnosedAt ? (
                  <div className="border-t border-destructive/15 bg-destructive/5 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Visit the vet to diagnose this condition.</p>
                  </div>
                ) : null}

                {record.diagnosedAt && activeTreatments.length === 0 && record.conditionDef.treatments.length === 0 && (
                  <div className="border-t border-border/50 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground italic">No treatment available.</p>
                  </div>
                )}

                {record.diagnosedAt && activeTreatments.length === 0 && !readonly && playerAccountId && record.conditionDef.treatments.length > 0 && (
                  <div className="border-t border-destructive/15 bg-destructive/5 px-3 py-2 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">{record.conditionDef.treatments.length === 1 ? "Start treatment:" : "Choose a treatment:"}</p>
                    {record.conditionDef.treatments.map((treatment) => (
                      <div key={treatment.id} className="flex items-center gap-1.5">
                        <ActionButton
                          variant="soft"
                          className="flex-1 justify-between"
                          disabled={startTreatment.isPending}
                          onClick={() => startTreatment.mutate({ animalId: animal.id, playerAccountId, healthRecordId: record.id, treatmentDefId: treatment.id })}
                        >
                          <span>{treatment.name}</span>
                          <span className="text-[10px] opacity-60">
                            {TREATMENT_LABEL[treatment.treatmentType]}
                            {treatment.durationCycles != null
                              ? ` · ${treatment.durationCycles} cycles`
                              : treatment.treatmentType !== "VET_PROCEDURE" ? " · Lifelong" : ""}
                          </span>
                        </ActionButton>
                        {treatment.treatmentType === "VET_PROCEDURE" && (
                          <span
                            title="Certain heritable conditions can cause severe or fatal reactions under anesthesia. Your vet strongly recommends screening your animal's genetics before booking any surgical procedure."
                            className="shrink-0 cursor-help"
                          >
                            <AlertTriangle className="size-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    ))}
                    {startTreatment.error && <p className="text-[11px] text-destructive">{startTreatment.error.message}</p>}
                  </div>
                )}

                {record.diagnosedAt && activeTreatments.map((t: TreatmentRecord) => {
                  const { treatmentType, items } = t.treatmentDef
                  const isPending = administer.isPending && administer.variables?.treatmentRecordId === t.id
                  const canAdminister = hasItems(items)
                  const missing = missingItems(items)

                  return (
                    <div key={t.id} className={cn("border-t px-3 py-2", isUntreated ? "border-destructive/15 bg-destructive/5" : "border-border/50 bg-transparent")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{t.treatmentDef.name}</span>
                        <Badge tone="muted">{TREATMENT_LABEL[treatmentType]}</Badge>
                      </div>
                      {t.treatmentDef.durationCycles != null ? (() => {
                        const remaining = (t.startedCycle + t.treatmentDef.durationCycles) - animal.ageInCycles
                        return (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {remaining} cycle{remaining !== 1 ? "s" : ""} remaining
                          </p>
                        )
                      })() : (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Lifelong medication</p>
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
                              ? live.isLifelong
                                ? " · Lifelong"
                                : ` · ${live.remainingCycles} cycle${live.remainingCycles !== 1 ? "s" : ""} remaining`
                              : rd.durationCycles != null
                              ? ` · ${rd.durationCycles} cycles`
                              : ""}
                          </p>
                        )
                      })}

                      {!readonly && playerAccountId && treatmentType !== "ACTIVITY_RESTRICTION" && treatmentType !== "VET_PROCEDURE" && (() => {
                        const isTimeBased = treatmentType === "OTC" || treatmentType === "PRESCRIPTION" || treatmentType === "PLAYER_ACTION"
                        const administeredToday = isTimeBased && (t as typeof t & { lastAdministeredCycle?: number | null }).lastAdministeredCycle === animal.ageInCycles
                        const cyclesRemaining = t.treatmentDef.durationCycles != null
                          ? (t.startedCycle + t.treatmentDef.durationCycles) - animal.ageInCycles
                          : null

                        if (administeredToday) {
                          return (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-chart-2">
                              <CheckCircle2 className="size-3.5 shrink-0" />
                              <span>
                                Administered{cyclesRemaining != null ? ` · ${cyclesRemaining} cycle${cyclesRemaining !== 1 ? "s" : ""} remaining` : " · Lifelong"}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <div className="mt-1.5">
                            {treatmentType === "OTC" && missing.length > 0 ? (
                              <div className="space-y-1">
                                <p className="text-[11px] text-destructive">
                                  Missing: {missing.map((m) => m.itemDef.name).join(", ")}
                                </p>
                                <Link to="/vet" search={{ animalId: animal.id, service: "otc" }}>
                                  <ActionButton variant="soft" className="w-full justify-center">
                                    <FlaskConical className="size-3.5" /> Buy at Vet
                                  </ActionButton>
                                </Link>
                              </div>
                            ) : (
                              <ActionButton
                                variant="soft"
                                className="w-full justify-center"
                                disabled={isPending || (treatmentType === "OTC" && !canAdminister)}
                                onClick={() =>
                                  administer.mutate({ treatmentRecordId: t.id, playerAccountId })
                                }
                              >
                                {isPending ? (
                                  "Applying…"
                                ) : treatmentType === "OTC" ? (
                                  <><FlaskConical className="size-3.5" /> Administer OTC</>
                                ) : treatmentType === "PRESCRIPTION" ? (
                                  <><Pill className="size-3.5" /> Administer Rx</>
                                ) : treatmentType === "VET_PROCEDURE" ? (
                                  <><CalendarClock className="size-3.5" /> Book Procedure</>
                                ) : (
                                  <><Footprints className="size-3.5" /> Perform Care</>
                                )}
                              </ActionButton>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {administer.error && (
        <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {administer.error.message}
        </p>
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
                      <Link to="/vet" search={{ animalId: animal.id, service: "certificates" }}>
                        <ActionButton variant="soft" className="h-6 px-2 text-[11px]">
                          Book Testing
                        </ActionButton>
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {procedureOutcome && (
        <Dialog
          open
          onClose={() => setProcedureOutcome(null)}
          title={procedureOutcome.type === "death" ? "Fatal Procedural Complication" : "Procedural Complication"}
        >
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              {procedureOutcome.type === "death"
                ? `During the procedure, ${animal.name} experienced a severe genetic reaction to anesthesia caused by ${procedureOutcome.conditionName}. Despite the vet's best efforts, ${animal.name} did not survive.`
                : `During the procedure, ${animal.name} experienced a ${procedureOutcome.conditionName} episode triggered by the anesthesia. They have been stabilized, but the condition is now active and will require treatment.`}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setProcedureOutcome(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}
    </Panel>
  )
}
