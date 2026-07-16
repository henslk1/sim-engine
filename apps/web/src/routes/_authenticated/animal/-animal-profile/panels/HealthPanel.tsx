import type { AnimalProfile } from "../types"
import { Panel, Badge, ActionButton } from "@/components/game/ui"
import { Stethoscope, ShieldCheck, ShieldAlert, CalendarClock, Pill, FlaskConical, Footprints } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"

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
                  const { treatmentType, items } = t.treatmentDef
                  const isPending = administer.isPending && administer.variables?.treatmentRecordId === t.id
                  const canAdminister = hasItems(items)
                  const missing = missingItems(items)

                  return (
                    <div key={t.id} className="border-t border-destructive/15 bg-destructive/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{t.treatmentDef.name}</span>
                        <Badge tone="muted">{TREATMENT_LABEL[treatmentType]}</Badge>
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

                      {!readonly && playerAccountId && treatmentType !== "ACTIVITY_RESTRICTION" && (
                        <div className="mt-1.5">
                          {treatmentType === "OTC" && missing.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] text-destructive">
                                Missing: {missing.map((m) => m.itemDef.name).join(", ")}
                              </p>
                              <Link to="/vet" search={{ animalId: animal.id }}>
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
                      )}
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
                      <Link to="/vet" search={{ animalId: animal.id }}>
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
    </Panel>
  )
}
