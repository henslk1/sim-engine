import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import {
  Stethoscope, ChevronLeft, CheckCircle, Package,
  ShieldCheck, ShieldAlert, ShieldX, FlaskConical,
  HeartCrack, Coins, Snowflake, AlertTriangle, Check, Plus, Sparkles, Microscope,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/vet")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
  }),
  component: VetPage,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  accent = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-xl border shadow-sm",
        accent ? "border-accent/40 bg-accent/5" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          accent ? "border-accent/30" : "border-border",
        )}
      >
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function VetPage() {
  const { animalId: initialAnimalId } = Route.useSearch()

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

  const [selectedAnimalId, setSelectedAnimalId] = useState(initialAnimalId ?? "")
  const [selectedExamServiceId, setSelectedExamServiceId] = useState("")
  const [confirmEuthanize, setConfirmEuthanize] = useState(false)
  const [selectedSpermId, setSelectedSpermId] = useState("")
  const [selectedEggId, setSelectedEggId] = useState("")

  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const { data: storage, isLoading: storageLoading } = trpc.breedingMaterial.myStorage.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const { data: healthRecords, isLoading: healthLoading } = trpc.vet.animalHealth.useQuery(
    { animalId: selectedAnimalId },
    { enabled: !!selectedAnimalId },
  )

  const { data: vetStoreListings } = trpc.inventory.listStore.useQuery(
    { gameId: gameId!, shopType: "VET" },
    { enabled: !!gameId },
  )

  const { data: playerInventory } = trpc.inventory.mine.useQuery(
    { playerAccountId: playerAccountId! },
    { enabled: !!playerAccountId },
  )

  const buyItem = trpc.inventory.buy.useMutation({
    onSuccess: () => {
      utils.inventory.mine.invalidate({ playerAccountId: playerAccountId! })
      utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    },
  })

  const { data: certDefs } = trpc.vet.listCertDefs.useQuery({ gameId: gameId! }, { enabled: !!gameId })

  const { data: animalCerts } = trpc.vet.animalCerts.useQuery(
    { animalId: selectedAnimalId },
    { enabled: !!selectedAnimalId },
  )

  const issueCert = trpc.vet.issueCert.useMutation({
    onSuccess: () => {
      utils.vet.animalCerts.invalidate({ animalId: selectedAnimalId })
      utils.animalProfile.get.invalidate({ animalId: selectedAnimalId })
    },
  })

  const exam = trpc.vet.exam.useMutation({
    onSuccess: () => {
      utils.vet.animalHealth.invalidate({ animalId: selectedAnimalId })
      utils.player.balances.invalidate({ playerAccountId: playerAccountId! })
    },
  })

  const euthanize = trpc.vet.euthanize.useMutation({
    onSuccess: () => {
      utils.animal.list.invalidate()
      setSelectedAnimalId("")
      setConfirmEuthanize(false)
      navigate({ to: "/vet" })
    },
  })

  const createEmbryo = trpc.breedingMaterial.createEmbryo.useMutation({
    onSuccess: () => {
      utils.breedingMaterial.myStorage.invalidate({ playerAccountId: playerAccountId! })
      setSelectedSpermId("")
      setSelectedEggId("")
    },
  })

  const storedMaterials = storage?.materials ?? []
  const storedSperm = storedMaterials.filter((m) => m.materialType === "SPERM")
  const storedEggs  = storedMaterials.filter((m) => m.materialType === "EGG")
  const storedEmbryos = storedMaterials.filter((m) => m.materialType === "EMBRYO")

  const selectedExamService = examServices.find((s) => s.id === selectedExamServiceId)
  const untreatedCount = healthRecords?.filter((r) => r.treatmentRecords.length === 0).length ?? 0
  const selectedAnimal = aliveAnimals.find((a) => a.id === selectedAnimalId)

  function getBalance(currencyDefId: string) {
    return balances?.find((b) => b.currencyDef.id === currencyDefId)?.balance ?? 0
  }

  function handleExam() {
    if (!selectedAnimalId || !selectedExamServiceId || !playerAccountId) return
    exam.mutate({ animalId: selectedAnimalId, playerAccountId, vetServiceDefId: selectedExamServiceId })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          {initialAnimalId && (
            <Link to="/animal/$animalId" params={{ animalId: initialAnimalId }} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-5" />
            </Link>
          )}
          <div>
            <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold tracking-tight text-foreground">
              <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Stethoscope className="size-5" />
              </span>
              Vet Office
            </h1>
          </div>
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

      {/* Main 2-col grid */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">

            {/* Left: Health exam + OTC meds */}
            <div className="flex flex-col gap-5 lg:col-span-2">

              {/* Health Exam */}
              <SectionCard icon={<Stethoscope className="size-4 text-primary" />} title="Health Exam">
                {/* Patient dropdown */}
                <select
                  value={selectedAnimalId}
                  onChange={(e) => { setSelectedAnimalId(e.target.value); exam.reset() }}
                  className="w-full rounded-md border border-border bg-card py-2 pl-3 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-3"
                >
                  <option value="">Select animal…</option>
                  {aliveAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.breed.name} · {a.sex === "MALE" ? "M" : "F"} · {a.lifeStage.name}
                    </option>
                  ))}
                </select>
                {/* Active conditions */}
                {healthLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !healthRecords || healthRecords.length === 0 ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-chart-2/30 bg-chart-2/8 px-3 py-2.5">
                    <Check className="size-4 text-chart-2" />
                    <p className="text-sm text-foreground">No active conditions.</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {healthRecords.map((r) => {
                      const hasTreatment = r.treatmentRecords.length > 0
                      return (
                        <li key={r.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/25 p-2.5">
                          <span className={cn(
                            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ring-1",
                            hasTreatment
                              ? "bg-chart-2/12 text-chart-2 ring-chart-2/30"
                              : "bg-destructive/12 text-destructive ring-destructive/30",
                          )}>
                            {hasTreatment ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              {r.conditionDef.name}
                              <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1",
                                hasTreatment
                                  ? "bg-chart-2/12 text-chart-2 ring-chart-2/30"
                                  : "bg-destructive/12 text-destructive ring-destructive/30",
                              )}>
                                {hasTreatment ? "In treatment" : "Untreated"}
                              </span>
                            </p>
                            {hasTreatment && r.treatmentRecords.map((t) => (
                              <p key={t.id} className="text-[11px] text-muted-foreground">
                                {t.treatmentDef.name}
                              </p>
                            ))}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* Exam result / error */}
                {exam.data && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
                    <CheckCircle className="size-4 text-primary" />
                    Exam complete — {exam.data.treatedCount} condition{exam.data.treatedCount !== 1 ? "s" : ""} diagnosed
                  </div>
                )}
                {exam.error && (
                  <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {exam.error.message}
                  </p>
                )}

                {/* Clickable exam services */}
                {examServices.length > 0 && (
                  <div className="mt-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {examServices.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedExamServiceId(s.id)}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            selectedExamServiceId === s.id
                              ? "border-primary/60 bg-primary/8"
                              : "border-border bg-secondary/30 hover:bg-secondary/50",
                          )}
                        >
                          <span className="text-sm font-semibold text-foreground">{s.name}</span>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                            {s.baseCost > 0
                              ? `${s.baseCost} ${s.currencyDef.symbol ?? s.currencyDef.name}`
                              : "Free"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={
                        !selectedExamServiceId ||
                        exam.isPending ||
                        untreatedCount === 0 ||
                        (selectedExamService && selectedExamService.baseCost > 0
                          ? getBalance(selectedExamService.currencyDefId) < selectedExamService.baseCost
                          : false)
                      }
                      onClick={handleExam}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Stethoscope className="size-4" />
                      {exam.isPending ? "Running…" : `Run Exam${untreatedCount > 0 ? ` (${untreatedCount})` : ""}`}
                    </button>
                  </div>
                )}
                {examServices.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No exam services configured.</p>
                )}
              </SectionCard>

              {/* OTC Medications */}
              {vetStoreListings && vetStoreListings.length > 0 && (
                <SectionCard icon={<FlaskConical className="size-4 text-primary" />} title="OTC Medications">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {vetStoreListings.map((listing) => {
                      const owned = playerInventory?.find((i) => i.itemDef.id === listing.itemDefId)?.quantity ?? 0
                      const isPending = buyItem.isPending && buyItem.variables?.listingId === listing.id
                      return (
                        <article key={listing.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md">
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-secondary/50 to-card">
                            <div className="flex h-full items-center justify-center">
                              <Package className="size-10 text-muted-foreground/20 transition-transform duration-300 group-hover:scale-105" />
                            </div>
                            {owned > 0 && (
                              <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
                                {owned} in stock
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-2 p-3">
                            <h3 className="font-serif text-base font-semibold leading-tight text-foreground text-balance">
                              {listing.itemDef.name}
                            </h3>
                            {listing.itemDef.description && (
                              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                                {listing.itemDef.description}
                              </p>
                            )}
                            {listing.itemDef.category && (
                              <div className="mt-auto pt-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {listing.itemDef.category}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                              <div className="flex items-center gap-1 text-sm font-bold tabular-nums text-foreground">
                                <Coins className="size-3.5 text-chart-1" />
                                {listing.price === 0 ? "Free" : listing.price.toLocaleString()}
                              </div>
                              <button
                                type="button"
                                disabled={!playerAccountId || isPending}
                                onClick={() => playerAccountId && buyItem.mutate({ listingId: listing.id, playerAccountId })}
                                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                              >
                                <Plus className="size-3.5" />
                                {isPending ? "Buying…" : "Buy"}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  {buyItem.error && (
                    <p className="mt-2 text-sm text-destructive">{buyItem.error.message}</p>
                  )}
                </SectionCard>
              )}
            </div>

            {/* Right: Certs + Euthanasia */}
            <div className="flex flex-col gap-5">

              {/* Health Certificates */}
              {certDefs && certDefs.length > 0 && (
                <SectionCard icon={<ShieldCheck className="size-4 text-primary" />} title="Health Certificates">
                  {!selectedAnimalId ? (
                    <p className="text-sm text-muted-foreground">Select an animal to view certificates.</p>
                  ) : (
                  <ul className="flex flex-col gap-2">
                    {certDefs.map((def) => {
                      const cert = animalCerts?.certs.find((c) => c.certDefId === def.id)
                      const ageInCycles = animalCerts?.ageInCycles ?? 0
                      const isExpired = cert && (!cert.isValid || cert.expiresAtCycle <= ageInCycles)
                      const isValid = cert && cert.isValid && !isExpired
                      const isPending = issueCert.isPending && issueCert.variables?.certDefId === def.id
                      const remainingCycles = cert ? cert.expiresAtCycle - ageInCycles : 0

                      const statusMeta = isValid
                        ? { icon: ShieldCheck, className: "text-chart-2 bg-chart-2/12 ring-chart-2/30" }
                        : isExpired
                          ? { icon: ShieldAlert, className: "text-chart-1 bg-chart-1/12 ring-chart-1/30" }
                          : { icon: ShieldX, className: "text-destructive bg-destructive/12 ring-destructive/30" }
                      const StatusIcon = statusMeta.icon

                      return (
                        <li key={def.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/25 p-2.5">
                          <span className={cn("grid size-8 shrink-0 place-items-center rounded-md ring-1", statusMeta.className)}>
                            <StatusIcon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">{def.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {isValid
                                ? `Expires in ${remainingCycles} cycle${remainingCycles !== 1 ? "s" : ""}`
                                : isExpired
                                  ? "Expired"
                                  : "Not certified"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!playerAccountId || isPending}
                            onClick={() => playerAccountId && issueCert.mutate({ animalId: selectedAnimalId, playerAccountId, certDefId: def.id })}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                              isValid
                                ? "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                                : "bg-primary text-primary-foreground hover:bg-primary/90",
                            )}
                          >
                            {isPending ? "Issuing…" : isValid ? "Renew" : "Issue"}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  )}
                  {issueCert.error && (
                    <p className="mt-2 text-sm text-destructive">{issueCert.error.message}</p>
                  )}
                </SectionCard>
              )}

              {/* Euthanasia */}
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <HeartCrack className="size-4 text-destructive" />
                  <h3 className="text-sm font-semibold text-destructive">Euthanasia</h3>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Permanent. Cannot be undone.
                </p>
                {euthanize.error && (
                  <p className="mt-2 text-sm text-destructive">{euthanize.error.message}</p>
                )}
                {confirmEuthanize ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={euthanize.isPending}
                      onClick={() => euthanize.mutate({ animalId: selectedAnimalId })}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {euthanize.isPending ? "Processing…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEuthanize(false)}
                      className="inline-flex flex-1 items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmEuthanize(true)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <HeartCrack className="size-3.5" />
                    Euthanize {selectedAnimal?.name ?? "Animal"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Genetic & Breeding Services */}
          <div className="mt-5">
            <SectionCard
              icon={<Sparkles className="size-4 text-accent" />}
              title="Genetic & Breeding Services"
              accent
            >
              {/* Create Embryo */}
              <div className="rounded-lg border border-border bg-secondary/25 p-3">
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-card text-muted-foreground ring-1 ring-border">
                    <Microscope className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">Create Embryo</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Combine stored sperm and egg to produce a viable embryo in vitro.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedSpermId}
                    onChange={(e) => setSelectedSpermId(e.target.value)}
                    className="rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select sperm…</option>
                    {storedSperm.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.animal?.name ?? "Unknown"} — {new Date(m.collectedAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedEggId}
                    onChange={(e) => setSelectedEggId(e.target.value)}
                    className="rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select egg…</option>
                    {storedEggs.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.animal?.name ?? "Unknown"} — {new Date(m.collectedAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedSpermId || !selectedEggId || createEmbryo.isPending || !playerAccountId}
                    onClick={() =>
                      createEmbryo.mutate({
                        spermId: selectedSpermId,
                        eggId: selectedEggId,
                        playerAccountId: playerAccountId!,
                      })
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/85 disabled:opacity-50"
                  >
                    <Microscope className="size-3.5" />
                    {createEmbryo.isPending ? "Creating…" : "Create Embryo"}
                  </button>
                  {createEmbryo.isError && (
                    <p className="text-xs text-destructive">{createEmbryo.error.message}</p>
                  )}
                  {createEmbryo.isSuccess && (
                    <p className="text-xs text-chart-2">Embryo created successfully.</p>
                  )}
                </div>
              </div>

              {/* Genetic Storage */}
              <div className="mt-4 rounded-lg border border-border bg-secondary/25 p-3">
                <div className="mb-2.5 flex items-center gap-2">
                  <Snowflake className="size-4 text-chart-3" />
                  <h4 className="text-sm font-semibold text-foreground">Genetic Storage</h4>
                  {storage?.capacity && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {storedMaterials.length} /{" "}
                      {(storage.capacity.geneticStorageBase ?? 0) +
                        (storage.capacity.geneticStorageSubscription ?? 0) +
                        (storage.capacity.geneticStoragePurchased ?? 0)}
                    </span>
                  )}
                </div>
                {storageLoading ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : storedMaterials.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No material stored.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {storedMaterials.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {m.materialType === "SPERM" ? "Sperm" : m.materialType === "EGG" ? "Egg" : "Embryo"}
                          </span>
                          <span className="text-xs font-medium text-foreground">{m.animal?.name ?? "Unknown"}</span>
                          {m.animal?.breed?.name && (
                            <span className="text-xs text-muted-foreground">{m.animal.breed.name}</span>
                          )}
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {new Date(m.collectedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
    </div>
  )
}
