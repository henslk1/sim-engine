import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import {
  Stethoscope, ShoppingBag, FileText, AlertTriangle,
  FlaskConical, Dna, Baby, Syringe, Database,
  ChevronRight, ChevronLeft, Check, CheckCircle, Plus,
  ShieldCheck, ShieldAlert, ShieldX, HeartCrack, Coins,
  Snowflake, Info,
} from "lucide-react"
import { cn } from "@/lib/utils"

const SERVICE_KEYS: ServiceKey[] = ["diagnostics", "otc", "certificates", "euthanasia", "collect", "embryo-create", "embryo-implant", "insemination", "storage"]

export const Route = createFileRoute("/_authenticated/vet")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
    service: SERVICE_KEYS.includes(search.service as ServiceKey) ? (search.service as ServiceKey) : undefined,
  }),
  component: VetPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceKey =
  | "diagnostics" | "otc" | "certificates" | "euthanasia"
  | "collect" | "embryo-create" | "embryo-implant" | "insemination" | "storage"

const SERVICES: { key: ServiceKey; label: string; icon: React.ReactNode; section: "medical" | "genetics" }[] = [
  { key: "diagnostics",    label: "Diagnostic Exam",          icon: <Stethoscope size={14} />, section: "medical" },
  { key: "otc",            label: "OTC Medications",          icon: <ShoppingBag size={14} />, section: "medical" },
  { key: "certificates",   label: "Health Certificates",      icon: <FileText size={14} />,    section: "medical" },
  { key: "euthanasia",     label: "Euthanasia",               icon: <AlertTriangle size={14} />, section: "medical" },
  { key: "collect",        label: "Collect Material",         icon: <FlaskConical size={14} />, section: "genetics" },
  { key: "embryo-create",  label: "Create Embryo",           icon: <Dna size={14} />,          section: "genetics" },
  { key: "embryo-implant", label: "Implant Embryo",          icon: <Baby size={14} />,          section: "genetics" },
  { key: "insemination",   label: "Artificial Insemination", icon: <Syringe size={14} />,      section: "genetics" },
  { key: "storage",        label: "Storage Units",            icon: <Database size={14} />,    section: "genetics" },
]

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h2 className="font-serif text-lg font-semibold text-foreground">{children}</h2>
      <div className="mt-1 h-px flex-1 bg-border" />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  )
}

function SelectInput({ value, onChange, children, className }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
    >
      {children}
    </select>
  )
}

function PrimaryButton({ onClick, disabled, children, variant = "primary" }: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: "primary" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40",
        variant === "danger"
          ? "bg-destructive text-destructive-foreground"
          : "bg-primary text-primary-foreground",
      )}
    >
      {children}
    </button>
  )
}

// ─── Panels ───────────────────────────────────────────────────────────────────

type AliveAnimal = {
  id: string
  name: string
  breed: { name: string }
  sex: string
  lifeStage: { name: string }
  status: string
  ageInCycles: number
  isCastrated: boolean
  breedingCooldownUntilCycle: number | null
  geneticCollectionCooldownUntilCycle: number | null
  pregnancies: { id: string }[]
  _count: { healthRecords: number }
  healthCertificates: { certDefId: string; isValid: boolean; expiresAtCycle: number }[]
}

function DiagnosticsPanel({
  aliveAnimals,
  examServices,
  playerAccountId,
  balances,
  selectedAnimalId,
  onSelectAnimal,
}: {
  aliveAnimals: AliveAnimal[]
  examServices: { id: string; name: string; baseCost: number; currencyDefId: string; currencyDef: { name: string; symbol: string | null } }[]
  playerAccountId: string | undefined
  balances: { currencyDef: { id: string }; balance: number }[] | undefined
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
}) {
  const [serviceId, setServiceId] = useState("")
  const utils = trpc.useUtils()

  const filteredAnimals = aliveAnimals.filter(a => a._count.healthRecords > 0)
  const effectiveAnimalId = filteredAnimals.some(a => a.id === selectedAnimalId) ? selectedAnimalId : ""

  const { data: healthRecords, isLoading: healthLoading } = trpc.vet.animalHealth.useQuery(
    { animalId: effectiveAnimalId },
    { enabled: !!effectiveAnimalId },
  )

  const exam = trpc.vet.exam.useMutation({
    onSuccess: () => {
      utils.vet.animalHealth.invalidate({ animalId: effectiveAnimalId })
      utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    },
  })

  const selectedService = examServices.find((s) => s.id === serviceId)
  const undiagnosedCount = healthRecords?.filter((r) => !r.diagnosedAt).length ?? 0
  const getBalance = (currencyDefId: string) =>
    balances?.find((b) => b.currencyDef.id === currencyDefId)?.balance ?? 0

  return (
    <div>
      <SectionLabel>Diagnostic Health Examination</SectionLabel>
      {exam.data && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Exam complete — {exam.data.diagnosedCount} condition{exam.data.diagnosedCount !== 1 ? "s" : ""} diagnosed
        </div>
      )}
      {exam.error && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {exam.error.message}
        </div>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Patient</FieldLabel>
          <SelectInput value={effectiveAnimalId} onChange={(v) => { onSelectAnimal(v); exam.reset() }}>
            <option value="">— Select animal —</option>
            {filteredAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.breed.name} · {a.sex === "MALE" ? "M" : "F"} · {a.lifeStage.name}
              </option>
            ))}
          </SelectInput>
        </div>

        {effectiveAnimalId && (
          <div>
            {healthLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !healthRecords || healthRecords.length === 0 ? (
              <div className="flex items-center gap-2 rounded border border-border bg-secondary/30 px-3 py-2.5 text-sm">
                <Check className="size-3.5 text-chart-2" />
                <span className="text-muted-foreground">No active conditions on record.</span>
              </div>
            ) : (
              <div className="grid gap-2">
                {healthRecords.map((r) => {
                  const isDiagnosed = !!r.diagnosedAt
                  const hasTreatment = r.treatmentRecords.length > 0
                  const statusColor = !isDiagnosed
                    ? "bg-amber-500/15 text-amber-600"
                    : hasTreatment
                      ? "bg-chart-2/15 text-chart-2"
                      : "bg-destructive/15 text-destructive"
                  const statusLabel = !isDiagnosed ? "Undiagnosed" : hasTreatment ? "In treatment" : "Untreated"
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 rounded border border-border bg-card px-3 py-2">
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded text-[10px] font-bold", statusColor)}>
                        {!isDiagnosed ? <AlertTriangle size={11} /> : hasTreatment ? <Check size={11} /> : <AlertTriangle size={11} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {isDiagnosed ? r.conditionDef.name : <span className="text-muted-foreground italic">Unknown illness</span>}
                        </p>
                        {hasTreatment && r.treatmentRecords.map((t) => (
                          <p key={t.id} className="text-xs text-muted-foreground">{t.treatmentDef.name}</p>
                        ))}
                      </div>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider",
                        !isDiagnosed ? "bg-amber-500/12 text-amber-600" : hasTreatment ? "bg-chart-2/12 text-chart-2" : "bg-destructive/12 text-destructive",
                      )}>
                        {statusLabel}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {examServices.length > 0 && (
          <div>
            <FieldLabel>Examination Type</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {examServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={cn(
                    "flex items-center justify-between rounded border px-3 py-2.5 text-sm transition-colors",
                    serviceId === s.id
                      ? "border-primary/60 bg-primary/8 text-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.baseCost > 0 ? `${s.baseCost} ${s.currencyDef.symbol ?? s.currencyDef.name}` : "Free"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <PrimaryButton
          disabled={
            !effectiveAnimalId || !serviceId || exam.isPending || undiagnosedCount === 0 ||
            !!(selectedService?.baseCost && getBalance(selectedService.currencyDefId) < selectedService.baseCost)
          }
          onClick={() => {
            if (!effectiveAnimalId || !serviceId || !playerAccountId) return
            exam.mutate({ animalId: effectiveAnimalId, playerAccountId, vetServiceDefId: serviceId })
          }}
        >
          {exam.isPending ? "Running…" : `Run Exam${undiagnosedCount > 0 ? ` (${undiagnosedCount} undiagnosed)` : ""}`}
        </PrimaryButton>
      </div>
    </div>
  )
}

function OTCPanel({
  vetStoreListings,
  playerInventory,
  playerAccountId,
}: {
  vetStoreListings: { id: string; itemDefId: string; price: number; itemDef: { id: string; name: string; description: string | null; category: string | null } }[]
  playerInventory: { itemDef: { id: string }; quantity: number }[] | undefined
  playerAccountId: string | undefined
}) {
  const utils = trpc.useUtils()
  const buyItem = trpc.inventory.buy.useMutation({
    onSuccess: () => {
      utils.inventory.mine.invalidate({ playerAccountId: playerAccountId! })
      utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    },
  })

  return (
    <div>
      <SectionLabel>Over-the-Counter Medications</SectionLabel>
      {buyItem.data && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Purchase complete. Item added to your inventory.
        </div>
      )}
      {buyItem.error && (
        <p className="mb-4 text-sm text-destructive">{buyItem.error.message}</p>
      )}
      <div className="grid gap-2">
        {vetStoreListings.map((listing) => {
          const owned = playerInventory?.find((i) => i.itemDef.id === listing.itemDefId)?.quantity ?? 0
          const isPending = buyItem.isPending && buyItem.variables?.listingId === listing.id
          return (
            <div key={listing.id} className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{listing.itemDef.name}</span>
                  {listing.itemDef.category && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
                      {listing.itemDef.category}
                    </span>
                  )}
                </div>
                {listing.itemDef.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{listing.itemDef.description}</p>
                )}
                {owned > 0 && (
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{owned} in inventory</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {listing.price === 0 ? "Free" : listing.price.toLocaleString()}
                </span>
                <button
                  type="button"
                  disabled={!playerAccountId || isPending}
                  onClick={() => playerAccountId && buyItem.mutate({ listingId: listing.id, playerAccountId })}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Plus size={11} />
                  {isPending ? "Buying…" : "Buy"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CertificatesPanel({
  certDefs,
  aliveAnimals,
  playerAccountId,
  selectedAnimalId,
  onSelectAnimal,
}: {
  certDefs: { id: string; name: string; validForCycles: number; requiredForCompetition: boolean }[]
  aliveAnimals: AliveAnimal[]
  playerAccountId: string | undefined
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
}) {
  const utils = trpc.useUtils()

  const filteredAnimals = certDefs.length === 0
    ? aliveAnimals
    : aliveAnimals.filter(a =>
        certDefs.some(def => {
          const cert = a.healthCertificates.find(c => c.certDefId === def.id)
          return !cert || !cert.isValid || cert.expiresAtCycle <= a.ageInCycles
        })
      )
  const effectiveAnimalId = filteredAnimals.some(a => a.id === selectedAnimalId) ? selectedAnimalId : ""

  const { data: animalCerts } = trpc.vet.animalCerts.useQuery(
    { animalId: effectiveAnimalId },
    { enabled: !!effectiveAnimalId },
  )

  const issueCert = trpc.vet.issueCert.useMutation({
    onSuccess: () => {
      utils.vet.animalCerts.invalidate({ animalId: effectiveAnimalId })
      utils.animalProfile.get.invalidate({ animalId: effectiveAnimalId })
      utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    },
  })

  const ageInCycles = animalCerts?.ageInCycles ?? 0

  return (
    <div>
      <SectionLabel>Health Certificates</SectionLabel>
      {issueCert.data && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Certificate issued and added to records.
        </div>
      )}
      {issueCert.error && (
        <p className="mb-4 text-sm text-destructive">{issueCert.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Animal</FieldLabel>
          <SelectInput value={effectiveAnimalId} onChange={(v) => { onSelectAnimal(v); issueCert.reset() }}>
            <option value="">— Select animal —</option>
            {filteredAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.breed.name} · {a.sex === "MALE" ? "M" : "F"}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          {certDefs.map((def) => {
            const cert = animalCerts?.certs.find((c) => c.certDefId === def.id)
            const isExpired = cert && (!cert.isValid || cert.expiresAtCycle <= ageInCycles)
            const isValid = cert && cert.isValid && !isExpired
            const remainingCycles = cert ? cert.expiresAtCycle - ageInCycles : 0
            const isPending = issueCert.isPending && issueCert.variables?.certDefId === def.id

            const statusMeta = isValid
              ? { icon: ShieldCheck, cls: "text-chart-2 bg-chart-2/12" }
              : isExpired
                ? { icon: ShieldAlert, cls: "text-chart-1 bg-chart-1/12" }
                : { icon: ShieldX, cls: "text-destructive bg-destructive/12" }
            const StatusIcon = statusMeta.icon

            return (
              <div key={def.id} className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2.5 text-sm">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded", statusMeta.cls)}>
                  <StatusIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{def.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {!effectiveAnimalId ? "Select an animal" : isValid
                      ? `Expires in ${remainingCycles} cycle${remainingCycles !== 1 ? "s" : ""}`
                      : isExpired ? "Expired" : "Not certified"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!effectiveAnimalId || !playerAccountId || isPending}
                  onClick={() => playerAccountId && issueCert.mutate({ animalId: effectiveAnimalId, playerAccountId, certDefId: def.id })}
                  className={cn(
                    "shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    isValid
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {isPending ? "Issuing…" : isValid ? "Renew" : "Issue"}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EuthanasiaPanel({ aliveAnimals }: { aliveAnimals: AliveAnimal[] }) {
  const [animalId, setAnimalId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const euthanize = trpc.vet.euthanize.useMutation({
    onSuccess: () => {
      utils.animal.list.invalidate()
      setAnimalId("")
      setConfirmed(false)
      navigate({ to: "/vet" })
    },
  })

  const selectedAnimal = aliveAnimals.find((a) => a.id === animalId)

  return (
    <div>
      <SectionLabel>Euthanasia Services</SectionLabel>
      <div className="mb-5 flex items-start gap-2.5 rounded border border-destructive/20 bg-destructive/5 px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-destructive/70" />
        <p className="text-xs text-destructive/80 leading-relaxed">
          This action is permanent and cannot be undone. The animal will be removed from your stable.
        </p>
      </div>
      {euthanize.error && (
        <p className="mb-4 text-sm text-destructive">{euthanize.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Patient</FieldLabel>
          <SelectInput value={animalId} onChange={(v) => { setAnimalId(v); setConfirmed(false) }}>
            <option value="">— Select animal —</option>
            {aliveAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.breed.name} · {a.sex === "MALE" ? "M" : "F"}
              </option>
            ))}
          </SelectInput>
        </div>

        {selectedAnimal && (
          <div className="rounded border border-border bg-card p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Patient Summary</p>
            <div className="grid grid-cols-2 gap-1 text-sm">
              <div><span className="text-muted-foreground">Name: </span><span className="font-medium">{selectedAnimal.name}</span></div>
              <div><span className="text-muted-foreground">Breed: </span>{selectedAnimal.breed.name}</div>
              <div><span className="text-muted-foreground">Sex: </span>{selectedAnimal.sex === "MALE" ? "Male" : "Female"}</div>
              <div><span className="text-muted-foreground">Stage: </span>{selectedAnimal.lifeStage.name}</div>
            </div>
          </div>
        )}

        {confirmed ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={euthanize.isPending}
              onClick={() => euthanize.mutate({ animalId })}
              className="flex-1 rounded bg-destructive py-2.5 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {euthanize.isPending ? "Processing…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              className="flex-1 rounded border border-border py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <PrimaryButton variant="danger" disabled={!animalId} onClick={() => setConfirmed(true)}>
            <span className="flex items-center justify-center gap-2">
              <HeartCrack size={14} />
              Euthanize {selectedAnimal?.name ?? "Animal"}
            </span>
          </PrimaryButton>
        )}
      </div>
    </div>
  )
}

function CollectPanel({
  aliveAnimals,
  playerAccountId,
  storedMaterials,
  selectedAnimalId,
  onSelectAnimal,
}: {
  aliveAnimals: AliveAnimal[]
  playerAccountId: string | undefined
  storedMaterials: { id: string; materialType: string; animal: { name: string; breed?: { name: string } } | null; collectedAt: string | Date; storageType: string }[]
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
}) {
  const [materialType, setMaterialType] = useState<"SPERM" | "EGG">("SPERM")
  const utils = trpc.useUtils()

  const filteredAnimals = aliveAnimals.filter(a => {
    if (a.isCastrated) return false
    if (a.geneticCollectionCooldownUntilCycle !== null && a.geneticCollectionCooldownUntilCycle > a.ageInCycles) return false
    if (materialType === "SPERM") return a.sex === "MALE"
    return a.sex === "FEMALE" && a.pregnancies.length === 0
  })
  const effectiveAnimalId = filteredAnimals.some(a => a.id === selectedAnimalId) ? selectedAnimalId : ""

  const collectMaterial = trpc.breeding.material.collectMaterial.useMutation({
    onSuccess: () => {
      utils.breeding.material.myStorage.invalidate({ playerAccountId: playerAccountId! })
      onSelectAnimal("")
    },
  })

  const relevantStored = storedMaterials.filter((m) => m.materialType === materialType)

  return (
    <div>
      <SectionLabel>Collect Genetic Material</SectionLabel>
      {collectMaterial.isSuccess && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Collection successful. Sample stored in your genetic bank.
        </div>
      )}
      {collectMaterial.isError && (
        <p className="mb-4 text-sm text-destructive">{collectMaterial.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Material Type</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(["SPERM", "EGG"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setMaterialType(t); onSelectAnimal(""); collectMaterial.reset() }}
                className={cn(
                  "rounded border py-2.5 text-sm transition-colors",
                  materialType === t ? "border-primary/60 bg-primary/8 text-primary" : "border-border hover:bg-muted",
                )}
              >
                {t === "SPERM" ? "Sperm (Male)" : "Egg (Female)"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Donor</FieldLabel>
          <SelectInput value={effectiveAnimalId} onChange={(v) => { onSelectAnimal(v); collectMaterial.reset() }}>
            <option value="">— Select animal —</option>
            {filteredAnimals.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.breed.name}</option>
            ))}
          </SelectInput>
        </div>
        <PrimaryButton
          disabled={!effectiveAnimalId || collectMaterial.isPending || !playerAccountId}
          onClick={() => collectMaterial.mutate({ animalId: effectiveAnimalId, materialType, storageType: "PERSONAL" })}
        >
          {collectMaterial.isPending ? "Collecting…" : "Collect Sample"}
        </PrimaryButton>
      </div>

      {relevantStored.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {materialType === "SPERM" ? "Stored Sperm" : "Stored Eggs"}
          </p>
          <div className="grid gap-2">
            {relevantStored.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
                <span className="font-medium text-foreground">{m.animal?.name ?? "Unknown"}</span>
                <div className="flex items-center gap-3">
                  {m.animal?.breed?.name && (
                    <span className="text-xs text-muted-foreground">{m.animal.breed.name}</span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(m.collectedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CreateEmbryoPanel({
  playerAccountId,
  storedSperm,
  storedEggs,
}: {
  playerAccountId: string | undefined
  storedSperm: { id: string; animal: { name: string } | null; collectedAt: string | Date }[]
  storedEggs: { id: string; animal: { name: string } | null; collectedAt: string | Date }[]
}) {
  const [spermId, setSpermId] = useState("")
  const [eggId, setEggId] = useState("")
  const utils = trpc.useUtils()

  const createEmbryo = trpc.breeding.material.createEmbryo.useMutation({
    onSuccess: () => {
      utils.breeding.material.myStorage.invalidate({ playerAccountId: playerAccountId! })
      setSpermId("")
      setEggId("")
    },
  })

  return (
    <div>
      <SectionLabel>Create Embryo</SectionLabel>
      {createEmbryo.isSuccess && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Embryo created and placed in cryogenic storage.
        </div>
      )}
      {createEmbryo.isError && (
        <p className="mb-4 text-sm text-destructive">{createEmbryo.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Stored Sperm</FieldLabel>
          <SelectInput value={spermId} onChange={setSpermId}>
            <option value="">— Select sample —</option>
            {storedSperm.map((m) => (
              <option key={m.id} value={m.id}>
                {m.animal?.name ?? "Unknown"} · {new Date(m.collectedAt).toLocaleDateString()}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <FieldLabel>Stored Egg</FieldLabel>
          <SelectInput value={eggId} onChange={setEggId}>
            <option value="">— Select sample —</option>
            {storedEggs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.animal?.name ?? "Unknown"} · {new Date(m.collectedAt).toLocaleDateString()}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="rounded border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-mono uppercase tracking-wider">Note</p>
          <p>Embryo viability is calculated from donor compatibility. The resulting embryo will be stored in your genetic bank.</p>
        </div>
        <PrimaryButton
          disabled={!spermId || !eggId || createEmbryo.isPending || !playerAccountId}
          onClick={() => createEmbryo.mutate({ spermId, eggId, playerAccountId: playerAccountId! })}
        >
          {createEmbryo.isPending ? "Creating…" : "Create Embryo"}
        </PrimaryButton>
      </div>
    </div>
  )
}

function ImplantEmbryoPanel({
  aliveAnimals,
  playerAccountId,
  storedEmbryos,
  selectedAnimalId,
  onSelectAnimal,
}: {
  aliveAnimals: AliveAnimal[]
  playerAccountId: string | undefined
  storedEmbryos: { id: string; animal: { name: string } | null; collectedAt: string | Date }[]
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
}) {
  const [embryoId, setEmbryoId] = useState("")
  const utils = trpc.useUtils()

  const filteredSurrogates = aliveAnimals.filter(a =>
    a.sex === "FEMALE" &&
    a.pregnancies.length === 0 &&
    (a.breedingCooldownUntilCycle === null || a.breedingCooldownUntilCycle <= a.ageInCycles)
  )
  const effectiveSurrogateId = filteredSurrogates.some(a => a.id === selectedAnimalId) ? selectedAnimalId : ""

  const implant = trpc.breeding.material.implant.useMutation({
    onSuccess: () => {
      utils.animal.list.invalidate()
      utils.breeding.material.myStorage.invalidate({ playerAccountId: playerAccountId! })
      onSelectAnimal("")
      setEmbryoId("")
    },
  })

  return (
    <div>
      <SectionLabel>Implant Embryo</SectionLabel>
      {implant.isSuccess && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          Embryo implanted. Monitor the recipient for pregnancy confirmation.
        </div>
      )}
      {implant.isError && (
        <p className="mb-4 text-sm text-destructive">{implant.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Embryo</FieldLabel>
          <SelectInput value={embryoId} onChange={setEmbryoId}>
            <option value="">— Select embryo —</option>
            {storedEmbryos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.animal?.name ?? "Unknown"} · {new Date(m.collectedAt).toLocaleDateString()}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <FieldLabel>Recipient Female</FieldLabel>
          <SelectInput value={effectiveSurrogateId} onChange={(v) => { onSelectAnimal(v); implant.reset() }}>
            <option value="">— Select animal —</option>
            {filteredSurrogates.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.breed.name} · {a.lifeStage.name}</option>
            ))}
          </SelectInput>
        </div>
        <PrimaryButton
          disabled={!embryoId || !effectiveSurrogateId || implant.isPending}
          onClick={() => implant.mutate({ embryoId, surrogateAnimalId: effectiveSurrogateId })}
        >
          {implant.isPending ? "Implanting…" : "Implant Embryo"}
        </PrimaryButton>
      </div>
    </div>
  )
}

function AIPanel({
  aliveAnimals,
  playerAccountId,
  storedSperm,
  selectedAnimalId,
  onSelectAnimal,
}: {
  aliveAnimals: AliveAnimal[]
  playerAccountId: string | undefined
  storedSperm: { id: string; animal: { name: string } | null; collectedAt: string | Date }[]
  selectedAnimalId: string
  onSelectAnimal: (id: string) => void
}) {
  const [spermId, setSpermId] = useState("")
  const utils = trpc.useUtils()

  const filteredFemales = aliveAnimals.filter(a =>
    a.sex === "FEMALE" &&
    a.pregnancies.length === 0 &&
    (a.breedingCooldownUntilCycle === null || a.breedingCooldownUntilCycle <= a.ageInCycles)
  )
  const effectiveDamId = filteredFemales.some(a => a.id === selectedAnimalId) ? selectedAnimalId : ""

  const artificialInsemination = trpc.breeding.material.artificialInsemination.useMutation({
    onSuccess: () => {
      utils.animal.list.invalidate()
      onSelectAnimal("")
      setSpermId("")
    },
  })

  return (
    <div>
      <SectionLabel>Artificial Insemination</SectionLabel>
      {artificialInsemination.isSuccess && (
        <div className="mb-4 flex items-start gap-2.5 rounded border border-chart-2/30 bg-chart-2/8 px-3 py-2.5 text-sm text-foreground">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-chart-2" />
          {artificialInsemination.data.conceived
            ? `Conceived — pregnancy started (${artificialInsemination.data.offspringCount} offspring).`
            : "Procedure complete. No conception this cycle."}
        </div>
      )}
      {artificialInsemination.isError && (
        <p className="mb-4 text-sm text-destructive">{artificialInsemination.error.message}</p>
      )}
      <div className="grid gap-4">
        <div>
          <FieldLabel>Female</FieldLabel>
          <SelectInput value={effectiveDamId} onChange={(v) => { onSelectAnimal(v); artificialInsemination.reset() }}>
            <option value="">— Select animal —</option>
            {filteredFemales.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.breed.name} · {a.lifeStage.name}</option>
            ))}
          </SelectInput>
        </div>
        <div>
          <FieldLabel>Stored Sperm</FieldLabel>
          <SelectInput value={spermId} onChange={setSpermId}>
            <option value="">— Select sample —</option>
            {storedSperm.map((m) => (
              <option key={m.id} value={m.id}>
                {m.animal?.name ?? "Unknown"} · {new Date(m.collectedAt).toLocaleDateString()}
              </option>
            ))}
          </SelectInput>
        </div>
        <PrimaryButton
          disabled={!effectiveDamId || !spermId || artificialInsemination.isPending || !playerAccountId}
          onClick={() => artificialInsemination.mutate({ spermId, damId: effectiveDamId, playerAccountId: playerAccountId! })}
        >
          {artificialInsemination.isPending ? "Processing…" : "Perform AI"}
        </PrimaryButton>
      </div>
    </div>
  )
}

function StorageSectionList({
  materials,
}: {
  materials: { id: string; materialType: string; animal: { name: string; breed?: { name: string } } | null; collectedAt: string | Date }[]
}) {
  if (materials.length === 0) return <p className="text-xs text-muted-foreground">No material stored.</p>
  return (
    <div className="grid gap-0">
      {materials.map((m) => (
        <div key={m.id} className="flex items-center gap-3 border-b border-border/50 py-1.5 text-sm last:border-0">
          <Snowflake size={12} className="shrink-0 text-muted-foreground/60" />
          <span className="flex-1 font-medium text-foreground">{m.animal?.name ?? "Unknown"}</span>
          {m.animal?.breed?.name && (
            <span className="text-xs text-muted-foreground">{m.animal.breed.name}</span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {m.materialType === "SPERM" ? "Sperm" : m.materialType === "EGG" ? "Egg" : "Embryo"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(m.collectedAt).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  )
}

function StorageCapacityBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0
  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="font-mono text-xs text-muted-foreground">{used} / {total} slots</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StoragePanel({
  storage,
  storedMaterials,
  storageLoading,
}: {
  storage: { capacity: { geneticStorageBase: number | null; geneticStorageSubscription: number | null; geneticStoragePurchased: number | null } | null } | undefined
  storedMaterials: { id: string; materialType: string; animal: { name: string; breed?: { name: string } } | null; collectedAt: string | Date; storageType: string }[]
  storageLoading: boolean
}) {
  const cap = storage?.capacity
  const personalTotal = (cap?.geneticStorageBase ?? 0) + (cap?.geneticStorageSubscription ?? 0)
  const vetTotal = cap?.geneticStoragePurchased ?? 0

  const personalMaterials = storedMaterials.filter((m) => m.storageType === "PERSONAL")
  const vetMaterials = storedMaterials.filter((m) => m.storageType === "VET")

  return (
    <div>
      <SectionLabel>Genetic Material Storage</SectionLabel>
      {storageLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <StorageCapacityBar used={personalMaterials.length} total={personalTotal} label="Personal Storage" />
            <div className="mt-3">
              <StorageSectionList materials={personalMaterials} />
            </div>
          </div>
          <div>
            <StorageCapacityBar used={vetMaterials.length} total={vetTotal} label="Vet Storage" />
            {vetTotal === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Purchase vet storage slots to store material here.</p>
            )}
            {vetTotal > 0 && (
              <div className="mt-3">
                <StorageSectionList materials={vetMaterials} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function VetPage() {
  const { animalId: initialAnimalId, service: initialService } = Route.useSearch()
  const [active, setActive] = useState<ServiceKey>(initialService ?? "diagnostics")
  const [selectedAnimalId, setSelectedAnimalId] = useState(initialAnimalId ?? "")

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: animals } = trpc.animal.list.useQuery()
  const aliveAnimals = animals?.filter((a) => a.status === "ALIVE") ?? []

  const { data: vetServices } = trpc.vet.listServices.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const examServices = vetServices?.filter((s) => s.serviceType === "EXAM") ?? []

  const { data: balances } = trpc.player.balances.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const { data: certDefs } = trpc.vet.listCertDefs.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const { data: vetStoreListings } = trpc.inventory.listStore.useQuery(
    { gameId: gameId!, shopType: "VET" },
    { enabled: !!gameId },
  )

  const { data: playerInventory } = trpc.inventory.mine.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const { data: storage, isLoading: storageLoading } = trpc.breeding.material.myStorage.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const storedMaterials = storage?.materials ?? []
  const storedSperm = storedMaterials.filter((m) => m.materialType === "SPERM")
  const storedEggs = storedMaterials.filter((m) => m.materialType === "EGG")
  const storedEmbryos = storedMaterials.filter((m) => m.materialType === "EMBRYO")

  const medical = SERVICES.filter((s) => s.section === "medical")
  const genetics = SERVICES.filter((s) => s.section === "genetics")

  const activePanel: React.ReactNode = (() => {
    switch (active) {
      case "diagnostics":
        return <DiagnosticsPanel aliveAnimals={aliveAnimals} examServices={examServices} playerAccountId={playerAccountId} balances={balances} selectedAnimalId={selectedAnimalId} onSelectAnimal={setSelectedAnimalId} />
      case "otc":
        return <OTCPanel vetStoreListings={vetStoreListings ?? []} playerInventory={playerInventory} playerAccountId={playerAccountId} />
      case "certificates":
        return <CertificatesPanel certDefs={certDefs ?? []} aliveAnimals={aliveAnimals} playerAccountId={playerAccountId} selectedAnimalId={selectedAnimalId} onSelectAnimal={setSelectedAnimalId} />
      case "euthanasia":
        return <EuthanasiaPanel aliveAnimals={aliveAnimals} />
      case "collect":
        return <CollectPanel aliveAnimals={aliveAnimals} playerAccountId={playerAccountId} storedMaterials={storedMaterials} selectedAnimalId={selectedAnimalId} onSelectAnimal={setSelectedAnimalId} />
      case "embryo-create":
        return <CreateEmbryoPanel playerAccountId={playerAccountId} storedSperm={storedSperm} storedEggs={storedEggs} />
      case "embryo-implant":
        return <ImplantEmbryoPanel aliveAnimals={aliveAnimals} playerAccountId={playerAccountId} storedEmbryos={storedEmbryos} selectedAnimalId={selectedAnimalId} onSelectAnimal={setSelectedAnimalId} />
      case "insemination":
        return <AIPanel aliveAnimals={aliveAnimals} playerAccountId={playerAccountId} storedSperm={storedSperm} selectedAnimalId={selectedAnimalId} onSelectAnimal={setSelectedAnimalId} />
      case "storage":
        return <StoragePanel storage={storage} storedMaterials={storedMaterials} storageLoading={storageLoading} />
    }
  })()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            {initialAnimalId && (
              <Link to="/animal/$animalId" params={{ animalId: initialAnimalId }} className="text-muted-foreground hover:text-foreground">
                <ChevronLeft size={18} />
              </Link>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded border border-primary/30 bg-primary/10">
              <Stethoscope size={16} className="text-primary" />
            </div>
            <h1 className="font-serif text-base font-semibold text-foreground">Veterinary Office</h1>
          </div>
          {balances && balances.length > 0 && (
            <div className="flex items-center gap-2">
              {balances.map((b, i) => (
                <span
                  key={b.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums shadow-sm ring-1",
                    i === 0 ? "bg-card text-foreground ring-border" : "bg-accent/20 text-accent-foreground ring-accent/30",
                  )}
                >
                  <Coins className="size-4 text-chart-1" />
                  {b.balance.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto grid max-w-5xl grid-cols-[220px_1fr] gap-6 px-6 py-6">

        {/* Sidebar */}
        <aside className="shrink-0">
          <nav className="sticky top-6 flex flex-col gap-0.5">
            <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Medical</p>
            {medical.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors",
                  active === s.key
                    ? s.key === "euthanasia"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground"
                    : s.key === "euthanasia"
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-muted",
                )}
              >
                <span className={active === s.key ? "opacity-80" : "opacity-50"}>{s.icon}</span>
                <span className="flex-1 leading-tight">{s.label}</span>
                {active === s.key && <ChevronRight size={12} className="opacity-50" />}
              </button>
            ))}

            <div className="my-3 border-t border-border" />
            <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Genetics</p>
            {genetics.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors",
                  active === s.key
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span className={active === s.key ? "opacity-80" : "opacity-50"}>{s.icon}</span>
                <span className="flex-1 leading-tight">{s.label}</span>
                {active === s.key && <ChevronRight size={12} className="opacity-50" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="self-start rounded border border-border bg-card p-6">
          {activePanel}
        </main>
      </div>
    </div>
  )
}
