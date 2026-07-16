import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Stethoscope, ChevronLeft, CheckCircle, Dna, Syringe, Package, ShieldCheck, ShieldAlert, ShieldX, FlaskConical, ShoppingCart, HeartCrack } from "lucide-react"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/vet")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
  }),
  component: VetPage,
})

const CONDITION_TYPE_LABEL: Record<string, string> = {
  ILLNESS: "Illness",
  INJURY: "Injury",
}

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

  const navigate = useNavigate()

  const utils = trpc.useUtils()

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

  const { data: certDefs } = trpc.vet.listCertDefs.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

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

  const selectedExamService = examServices.find((s) => s.id === selectedExamServiceId)
  const untreatedCount = healthRecords?.filter((r) => r.treatmentRecords.length === 0).length ?? 0

  function getBalance(currencyDefId: string) {
    return balances?.find((b) => b.currencyDef.id === currencyDefId)?.balance ?? 0
  }

  function handleExam() {
    if (!selectedAnimalId || !selectedExamServiceId || !playerAccountId) return
    exam.mutate({ animalId: selectedAnimalId, playerAccountId, vetServiceDefId: selectedExamServiceId })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        {initialAnimalId && (
          <Link to="/animal/$animalId" params={{ animalId: initialAnimalId }} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-5" />
          </Link>
        )}
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground flex items-center gap-2">
            <Stethoscope className="size-5" /> Vet Office
          </h1>
          {balances && balances.length > 0 && (
            <div className="mt-0.5 flex items-center gap-3">
              {balances.map((b) => (
                <span key={b.id} className="text-sm text-muted-foreground">
                  {b.currencyDef.symbol ?? b.currencyDef.name}{" "}
                  <span className="font-semibold text-foreground">{b.balance.toLocaleString()}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Animal selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Animal</label>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={selectedAnimalId}
          onChange={(e) => { setSelectedAnimalId(e.target.value); exam.reset() }}
        >
          <option value="">Select an animal…</option>
          {aliveAnimals.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.breed.name} · {a.lifeStage.name} · {a.sex === "MALE" ? "M" : "F"}
            </option>
          ))}
        </select>
      </div>

      {selectedAnimalId && (
        <>
          {/* Health Exam section */}
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Stethoscope className="size-4 text-destructive" /> Health Exam
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {healthLoading ? (
                <p className="text-sm text-muted-foreground">Loading health records…</p>
              ) : !healthRecords || healthRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active conditions.</p>
              ) : (
                <div className="space-y-2">
                  {healthRecords.map((r) => {
                    const hasTreatment = r.treatmentRecords.length > 0
                    return (
                      <div key={r.id} className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-foreground">{r.conditionDef.name}</span>
                            <span className="ml-2 text-[11px] text-muted-foreground">
                              {CONDITION_TYPE_LABEL[r.conditionDef.conditionType] ?? r.conditionDef.conditionType}
                            </span>
                          </div>
                          <span className={["text-[11px] font-medium", hasTreatment ? "text-chart-2" : "text-destructive"].join(" ")}>
                            {hasTreatment ? "Treatment assigned" : "Untreated"}
                          </span>
                        </div>
                        {hasTreatment && r.treatmentRecords.map((t) => (
                          <p key={t.id} className="mt-0.5 text-[11px] text-muted-foreground">
                            {t.treatmentDef.name} · {t.treatmentDef.treatmentType}
                          </p>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {exam.data && (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
                  <CheckCircle className="size-4 text-primary" />
                  Exam complete — {exam.data.treatedCount} condition{exam.data.treatedCount !== 1 ? "s" : ""} diagnosed
                </div>
              )}
              {exam.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {exam.error.message}
                </p>
              )}

              {examServices.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Exam Service</label>
                    <select
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      value={selectedExamServiceId}
                      onChange={(e) => setSelectedExamServiceId(e.target.value)}
                    >
                      <option value="">Select service…</option>
                      {examServices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.baseCost > 0 ? `${s.baseCost} ${s.currencyDef.symbol ?? s.currencyDef.name}` : "Free"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    disabled={
                      !selectedExamServiceId ||
                      exam.isPending ||
                      untreatedCount === 0 ||
                      (selectedExamService && selectedExamService.baseCost > 0
                        ? getBalance(selectedExamService.currencyDefId) < selectedExamService.baseCost
                        : false)
                    }
                    onClick={handleExam}
                  >
                    {exam.isPending ? "Running…" : `Run Exam${untreatedCount > 0 ? ` (${untreatedCount})` : ""}`}
                  </Button>
                </div>
              )}
              {examServices.length === 0 && (
                <p className="text-sm text-muted-foreground">No exam services configured for this game.</p>
              )}
            </div>
          </section>

          {/* OTC Medications */}
          {vetStoreListings && vetStoreListings.length > 0 && (
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FlaskConical className="size-4 text-chart-3" /> OTC Medications
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {vetStoreListings.map((listing) => {
                  const owned = playerInventory?.find((i) => i.itemDef.id === listing.itemDefId)?.quantity ?? 0
                  const isPending = buyItem.isPending && buyItem.variables?.listingId === listing.id
                  return (
                    <div key={listing.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{listing.itemDef.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {listing.price > 0
                            ? `${listing.price} ${listing.currencyDef.symbol ?? listing.currencyDef.name}`
                            : "Free"}
                          {owned > 0 && ` · ${owned} in inventory`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!playerAccountId || isPending}
                        onClick={() =>
                          playerAccountId &&
                          buyItem.mutate({ listingId: listing.id, playerAccountId })
                        }
                      >
                        {isPending ? "Buying…" : <><ShoppingCart className="size-3.5 mr-1" />Buy</>}
                      </Button>
                    </div>
                  )
                })}
              </div>
              {buyItem.error && (
                <p className="px-4 pb-3 text-sm text-destructive">{buyItem.error.message}</p>
              )}
            </section>
          )}

          {/* Health Certificates */}
          {certDefs && certDefs.length > 0 && (
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-chart-2" /> Health Certificates
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {certDefs.map((def) => {
                  const cert = animalCerts?.certs.find((c) => c.certDefId === def.id)
                  const ageInCycles = animalCerts?.ageInCycles ?? 0
                  const isExpired = cert && (!cert.isValid || cert.expiresAtCycle <= ageInCycles)
                  const isValid = cert && cert.isValid && !isExpired
                  const isPending = issueCert.isPending && issueCert.variables?.certDefId === def.id
                  const remainingCycles = cert ? cert.expiresAtCycle - ageInCycles : 0

                  return (
                    <div key={def.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex items-center gap-3">
                        {isValid ? (
                          <ShieldCheck className="size-4 shrink-0 text-chart-2" />
                        ) : isExpired ? (
                          <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                        ) : (
                          <ShieldX className="size-4 shrink-0 text-destructive" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{def.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {isValid
                              ? `Valid · expires in ${remainingCycles} cycle${remainingCycles !== 1 ? "s" : ""}`
                              : isExpired
                              ? "Expired"
                              : "Not certified"}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!playerAccountId || isPending}
                        onClick={() =>
                          playerAccountId &&
                          issueCert.mutate({ animalId: selectedAnimalId, playerAccountId, certDefId: def.id })
                        }
                      >
                        {isPending ? "Issuing…" : isValid ? "Renew" : "Issue"}
                      </Button>
                    </div>
                  )
                })}
              </div>
              {issueCert.error && (
                <p className="px-4 pb-3 text-sm text-destructive">{issueCert.error.message}</p>
              )}
            </section>
          )}

          {/* Euthanize */}
          <section className="rounded-lg border border-destructive/30 bg-card">
            <div className="border-b border-destructive/20 px-4 py-3">
              <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
                <HeartCrack className="size-4" /> Euthanasia
              </h2>
            </div>
            <div className="p-4">
              {euthanize.error && (
                <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {euthanize.error.message}
                </p>
              )}
              {confirmEuthanize ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    This will permanently mark the animal as deceased. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={euthanize.isPending}
                      onClick={() => euthanize.mutate({ animalId: selectedAnimalId })}
                    >
                      {euthanize.isPending ? "Processing…" : "Confirm Euthanasia"}
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmEuthanize(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmEuthanize(true)}>
                  <HeartCrack className="size-4 mr-2" /> Euthanize Animal
                </Button>
              )}
            </div>
          </section>

          {/* Genetic & Breeding Services */}
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Dna className="size-4 text-chart-4" /> Genetic & Breeding Services
              </h2>
            </div>
            <div className="divide-y divide-border/50">
              {[
                { icon: <Package className="size-4 text-muted-foreground" />, label: "Collect Sample", desc: "Collect sperm or egg for storage" },
                { icon: <Syringe className="size-4 text-muted-foreground" />, label: "Artificial Insemination", desc: "Inseminate with stored genetic material" },
                { icon: <Dna className="size-4 text-muted-foreground" />, label: "Embryo Flush", desc: "Flush embryos from a pregnant animal" },
                { icon: <Syringe className="size-4 text-muted-foreground" />, label: "Implant Embryo", desc: "Implant a stored embryo into a recipient" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {icon}
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled>Coming soon</Button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
