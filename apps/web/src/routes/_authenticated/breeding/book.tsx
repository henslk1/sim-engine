import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useTutorialAccess } from "@/lib/tutorial/access"
import { trpc } from "@/lib/trpc"
import { ActionButton } from "@/components/game/ui"
import { ArrowLeft, Dna, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCOIColor } from "../animal/-animal-profile/utils"
import { ParentCard, PredictorSection } from "./-breeding-shared"

export const Route = createFileRoute("/_authenticated/breeding/book")({
  validateSearch: (search: Record<string, unknown>) => ({
    listingId: (search.listingId as string) ?? "",
    damId: (search.damId as string) || undefined,
  }),
  component: BookBreedingPage,
})

type EligibleDam = {
  id: string
  name: string
  ageInCycles: number
  fertility: number
  inbreedingCoefficient: number
  breedName: string | null
  breed: { id: string; name: string } | null
  lifeStage: { name: string }
  mood: { value: number } | null
  energy: { currentEnergy: number } | null
}

function BookBreedingPage() {
  const { listingId, damId: initialDamId } = Route.useSearch()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [selectedDamId, setSelectedDamId] = useState<string | null>(initialDamId ?? null)
  const [result, setResult] = useState<{ conceived: boolean; damId: string; damName: string } | null>(null)

  const tutorialAccess = useTutorialAccess()
  const isTutorialMode = tutorialAccess.running && tutorialAccess.step >= 142 && tutorialAccess.step <= 152
  const recoveringTutorialResult = isTutorialMode && tutorialAccess.step >= 151 && !!tutorialAccess.mareId

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const tutorialGameId = isTutorialMode ? gameId : null
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: listing, isLoading: listingLoading } = trpc.breeding.listing.getById.useQuery(
    { listingId },
    { enabled: !!listingId },
  )
  const { data: dams = [] as EligibleDam[], isLoading: damsLoading } = trpc.breeding.cover.listEligibleDams.useQuery(
    { playerAccountId: playerAccountId!, gameId: gameId! },
    { enabled: !!playerAccountId && !!gameId },
  )
  const { data: preview, isLoading: previewLoading } = trpc.breeding.cover.previewPair.useQuery(
    { sireId: listing?.animal.id ?? "", damId: selectedDamId!, playerAccountId: playerAccountId!, gameId: gameId! },
    { enabled: !!listing && !!selectedDamId && !!playerAccountId && !!gameId },
  )
  const { data: tutorialDam } = trpc.animalProfile.get.useQuery(
    { animalId: tutorialAccess.mareId! },
    { enabled: recoveringTutorialResult },
  )

  const { mutate: acceptCover, isPending: acceptPending, error: acceptError } = trpc.breeding.cover.accept.useMutation({
    onSuccess: (data) => {
      utils.animalProfile.get.invalidate()
      const dam = dams.find((d) => d.id === selectedDamId)
      setResult({ conceived: data.conceived, damId: selectedDamId!, damName: dam?.name ?? "" })
      if (data.conceived) window.dispatchEvent(new Event("tutorial:breedingComplete"))
    },
  })

  const { mutate: sendCover, isPending: sendPending, error: sendError } = trpc.breeding.cover.send.useMutation({
    onSuccess: (offer) => acceptCover({ offerId: offer.id }),
  })

  if (listingLoading) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  if (!listing) {
    return <div className="p-8 text-sm text-muted-foreground">Listing not found.</div>
  }

  const recoveredResult = !result && tutorialDam?.pregnancies.some(pregnancy => !pregnancy.isCompleted)
    ? { conceived: true, damId: tutorialDam.id, damName: tutorialDam.name }
    : null
  const displayedResult = result ?? recoveredResult

  if (displayedResult) {
    return (
      <div className="mx-auto max-w-2xl p-8 space-y-6">
        <div data-tutorial="breeding-result" className={cn(
          "rounded-lg border p-6 text-center space-y-2",
          displayedResult.conceived
            ? "border-chart-2/40 bg-chart-2/10"
            : "border-muted-foreground/20 bg-secondary/30"
        )}>
          {displayedResult.conceived ? (
            <>
              <Sparkles className="mx-auto size-8 text-chart-2" />
              <p className="font-serif text-xl font-semibold text-foreground">Conception Successful</p>
              <p className="text-sm text-muted-foreground">{displayedResult.damName} is pregnant.</p>
            </>
          ) : (
            <>
              <p className="font-serif text-xl font-semibold text-foreground">No Conception</p>
              <p className="text-sm text-muted-foreground">
                The breeding did not result in a pregnancy this cycle.
              </p>
            </>
          )}
        </div>
        <Link to="/animal/$animalId" params={{ animalId: displayedResult.damId }} data-tutorial="breeding-go-to-mare-btn">
          <ActionButton variant="soft">
            <ArrowLeft className="size-3.5" /> Go to {displayedResult.damName}
          </ActionButton>
        </Link>
      </div>
    )
  }

  const offspringCOIColor = preview ? getCOIColor(preview.offspringCOI) : ""
  const sireName = preview?.sire.breed?.name ?? preview?.sire.breedName
  const damName  = preview?.dam.breed?.name  ?? preview?.dam.breedName
  const isCrossBreed = preview ? sireName !== damName : false
  const isPending = sendPending || acceptPending

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/stud-market" })}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to Stud Market
        </button>
      </div>

      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Book Breeding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a female to pair with {listing.animal.name}.
        </p>
      </div>

      {/* Female selector */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">Select your female</p>
        {damsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </div>
        ) : dams.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No eligible females available.</p>
        ) : (
          <select
            data-tutorial="breeding-female-select"
            value={selectedDamId ?? ""}
            onChange={(e) => {
              const damId = e.target.value || null
              setSelectedDamId(damId)
              void navigate({
                to: "/breeding/book",
                search: { listingId, ...(damId ? { damId } : {}) },
                replace: true,
              })
            }}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Choose a female…</option>
            {dams.map((dam) => (
              <option key={dam.id} value={dam.id}>
                {dam.name} — {dam.breed?.name ?? dam.breedName ?? ""} · {dam.lifeStage.name} · {dam.energy?.currentEnergy ?? 0} energy
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Pair info — loads once dam is selected */}
      {selectedDamId && (
        previewLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="size-3.5 animate-spin" /> Loading pair info…
          </div>
        ) : preview ? (
          <>
            <div data-tutorial="breeding-parent-cards" className="flex gap-3">
              <ParentCard label="Sire" grade={preview.sireGrade} animal={preview.sire} />
              <ParentCard label="Dam" grade={preview.damGrade} animal={preview.dam} />
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pair Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                <div data-tutorial="breeding-conception-chance" className="space-y-0.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conception chance</p>
                  <p className="text-sm font-semibold text-foreground">{preview.conceptionChance}%</p>
                </div>
                <div data-tutorial="breeding-offspring-coi" className="space-y-0.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Offspring COI</p>
                  <p className={cn("text-sm font-semibold", offspringCOIColor)}>
                    {(preview.offspringCOI * 100).toFixed(2)}%
                  </p>
                </div>
                {isCrossBreed && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pairing</p>
                    <p className="text-sm font-semibold text-foreground">Cross-breed</p>
                  </div>
                )}
              </div>

              {listing.pricePerSlot > 0 && (
                <div data-tutorial="breeding-stud-fee" className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <Dna className="size-3.5 shrink-0" />
                  Stud fee: {listing.pricePerSlot}g will be charged on confirmation
                </div>
              )}
            </div>

            <PredictorSection
              runInput={{ sireId: listing.animal.id, damId: selectedDamId, playerAccountId: playerAccountId!, gameId: gameId! }}
              predictorQuota={preview.predictorQuota}
              tutorialGameId={tutorialGameId}
            />
          </>
        ) : null
      )}

      {(sendError || acceptError) && (
        <p className="text-[11px] text-destructive">{sendError?.message ?? acceptError?.message}</p>
      )}

      <ActionButton
        variant="primary"
        className="w-full justify-center"
        data-tutorial="breeding-confirm-btn"
        disabled={!selectedDamId || isPending || listing._count.slots === 0}
        onClick={() => {
          if (selectedDamId) sendCover({
            sireId: listing.animal.id,
            damId: selectedDamId,
            price: listing.pricePerSlot,
            fromListing: true,
          })
        }}
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {listing._count.slots === 0 ? "No slots available" : "Confirm Breeding"}
      </ActionButton>

    </div>
  )
}
