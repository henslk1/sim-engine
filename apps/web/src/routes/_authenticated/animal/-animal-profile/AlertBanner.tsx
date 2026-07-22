import type { AnimalProfile } from "./types"
import { getActiveRestrictions } from "./utils"
import { Stethoscope, Clock, Ban, Skull, Baby, Package, ShieldAlert, AlertTriangle } from "lucide-react"
import type { ReactNode } from "react"

const RESTRICTION_LABEL: Record<string, string> = {
  TRAINING: "Training",
  COMPETITION: "Competition",
  BREEDING: "Breeding",
  CARE_ACTION: "Care actions",
  ALL: "All activities",
}

const toneClass = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  accent: "border-accent/30 bg-accent/10 text-accent-foreground",
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof toneClass
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function AlertBanner({ animal }: { animal: AnimalProfile }) {
  const banners: ReactNode[] = []

  // Priority 1: Undiagnosed conditions only — once diagnosed, treatment is known and scheduled
  const undiagnosedConditions = animal.healthRecords.filter((r) => r.isActive && !r.diagnosedAt)
  if (undiagnosedConditions.length > 0) {
    banners.push(
      <Banner key="health" tone="danger" icon={<Stethoscope className="size-3.5 shrink-0" />}>
        Unknown illness
        {undiagnosedConditions.length > 1 && ` +${undiagnosedConditions.length - 1} more`}
        {" — "}Visit the vet
      </Banner>
    )
  }

  // Priority 2: Neglect death risk — energy at 0 while careScore below threshold
  const config = animal.game.gameConfig
  const neglectActive =
    animal.status === "ALIVE" &&
    (config?.energyLowCarePenalty ?? 0) > 0 &&
    (animal.energy?.currentEnergy ?? 0) === 0 &&
    (animal.careScore?.score ?? 0) < (config?.energyLowCareThreshold ?? 0)
  if (neglectActive) {
    banners.push(
      <Banner key="neglect" tone="danger" icon={<AlertTriangle className="size-3.5 shrink-0" />}>
        {animal.name} may die from neglect — restore energy immediately
      </Banner>
    )
  }

  // Priority 3: Long-term care overdue (past grace period)
  const overdue = animal.longTermCareRecords.filter(
    (r) => animal.ageInCycles > r.nextDueCycle + r.longTermCareActionDef.gracePeriodCycles
  )
  if (overdue.length > 0) {
    const first = overdue[0]
    banners.push(
      <Banner key="care" tone="warning" icon={<Clock className="size-3.5 shrink-0" />}>
        {first.longTermCareActionDef.name} is overdue
        {overdue.length > 1 && ` · +${overdue.length - 1} more`}
      </Banner>
    )
  }

  // Priority 3: Active restrictions
  const restrictions = getActiveRestrictions(animal)
  if (restrictions.size > 0) {
    const labels = [...restrictions]
      .map((r) => RESTRICTION_LABEL[r] ?? r)
      .join(", ")
    banners.push(
      <Banner key="restriction" tone="warning" icon={<Ban className="size-3.5 shrink-0" />}>
        Activity restricted: {labels}
      </Banner>
    )
  }

  // Priority 4: Missing competition equipment
  const currentTier = animal.compTiers[0]
  if (animal.disciplineDef && currentTier) {
    const missingEquipment = currentTier.disciplineDef.equipmentRequirements.filter((req) => {
      const equipped = animal.equipment.filter(
        (eq: AnimalProfile["equipment"][number]) => eq.itemDef.id === req.itemDef.id
      ).length
      return equipped < req.quantity
    })
    if (missingEquipment.length > 0) {
      banners.push(
        <Banner key="equipment" tone="warning" icon={<Package className="size-3.5 shrink-0" />}>
          Missing equipment: {missingEquipment.map((r) => r.itemDef.name).join(", ")}
        </Banner>
      )
    }
  }

  // Priority 5: Missing or expired health certificates
  if (animal.disciplineDef) {
    const requiredCertDefs = animal.game.healthCertificateDefs.filter((d) => d.requiredForCompetition)
    const missingCerts = requiredCertDefs.filter((def) => {
      const cert = animal.healthCertificates.find(
        (c: AnimalProfile["healthCertificates"][number]) => c.certDef.id === def.id
      )
      return !cert || !cert.isValid || cert.expiresAtCycle <= animal.ageInCycles
    })
    if (missingCerts.length > 0) {
      banners.push(
        <Banner key="certs" tone="warning" icon={<ShieldAlert className="size-3.5 shrink-0" />}>
          Certificate required: {missingCerts.map((d) => d.name).join(", ")}
        </Banner>
      )
    }
  }

  // Priority 6: Death — pending bury / archive
  if (animal.status === "DECEASED") {
    banners.push(
      <Banner key="death" tone="danger" icon={<Skull className="size-3.5 shrink-0" />}>
        {animal.name} has passed away — choose to Bury or Archive
      </Banner>
    )
  }

  // Priority 7: Birth imminent
  const preg = animal.pregnancies[0]
  if (preg && preg.currentCycles >= preg.requiredCycles) {
    banners.push(
      <Banner key="birth" tone="accent" icon={<Baby className="size-3.5 shrink-0" />}>
        Birth imminent
      </Banner>
    )
  }

  if (banners.length === 0) return null

  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-2 border-b border-border px-4 py-2">
      {banners}
    </div>
  )
}
