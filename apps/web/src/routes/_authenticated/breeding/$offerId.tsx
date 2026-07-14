import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { Heart, ArrowLeft, Loader2, Dna, Sparkles } from "lucide-react"
import { ActionButton } from "@/components/game/ui"
import { getCOIColor, BREEDING_GRADE_COLOR, BREEDING_GRADE_BG } from "../animal/-animal-profile/utils"
import { cn } from "@/lib/utils"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/breeding/$offerId")({
  component: BreedingPage,
})

function FertilityHearts({ fertility }: { fertility: number }) {
  const hearts = fertility >= 0.8 ? 5 : fertility >= 0.6 ? 4 : fertility >= 0.4 ? 3 : fertility >= 0.2 ? 2 : fertility > 0 ? 1 : 0
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Heart
          key={i}
          className={cn("size-3", i < hearts ? "text-rose-400" : "text-muted-foreground/25")}
          fill="currentColor"
        />
      ))}
    </span>
  )
}

function ParentCard({ label, grade, animal }: {
  label: "Sire" | "Dam"
  grade: string
  animal: {
    id: string
    name: string
    sex: string
    fertility: number
    inbreedingCoefficient: number
    breed: { name: string }
    playerAccount: { username: string }
    lifeStage: { name: string }
    mood: { value: number } | null
  }
}) {
  const coiColor = getCOIColor(animal.inbreedingCoefficient)
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          <Link
            to="/animal/$animalId"
            params={{ animalId: animal.id }}
            className="mt-0.5 block font-serif text-lg font-semibold text-foreground hover:underline"
          >
            {animal.name}
          </Link>
          <p className="text-[11px] text-muted-foreground">{animal.breed.name}</p>
        </div>
        <span className={cn("shrink-0 rounded px-2 py-0.5 text-xs font-bold", BREEDING_GRADE_BG[grade], BREEDING_GRADE_COLOR[grade])}>
          {grade}
        </span>
      </div>
      <div className="space-y-1.5 border-t border-border/50 pt-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Owner</span>
          <span className="font-medium text-foreground">{animal.playerAccount.username}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Life stage</span>
          <span className="font-medium text-foreground">{animal.lifeStage.name}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Fertility</span>
          <FertilityHearts fertility={animal.fertility} />
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Mood</span>
          <span className="font-medium text-foreground">{animal.mood?.value ?? 50}/100</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">COI</span>
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  )
}

function BreedingPage() {
  const { offerId } = Route.useParams()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [result, setResult] = useState<{ conceived: boolean } | null>(null)

  const { data: offer, isLoading } = trpc.breeding.cover.getForBreeding.useQuery({ offerId })

  const { mutate: acceptCover, isPending: acceptPending } = trpc.breeding.cover.accept.useMutation({
    onSuccess: (data) => {
      utils.animalProfile.get.invalidate({ animalId: offer?.dam.id })
      if (data.conceived && data.requiredCycles === 0) {
        navigate({ to: "/animal/$animalId", params: { animalId: offer!.dam.id } })
        return
      }
      setResult({ conceived: data.conceived })
    },
  })

  const { mutate: declineCover, isPending: declinePending } = trpc.breeding.cover.decline.useMutation({
    onSuccess: () => {
      navigate({ to: "/animal/$animalId", params: { animalId: offer!.dam.id } })
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!offer) {
    return <div className="p-8 text-sm text-muted-foreground">Offer not found</div>
  }

  if (offer.status !== "PENDING" && !result) {
    return (
      <div className="mx-auto max-w-2xl p-8 space-y-4">
        <p className="text-sm text-muted-foreground">
          This cover offer is no longer pending (status: {offer.status.toLowerCase()}).
        </p>
        <Link to="/animal/$animalId" params={{ animalId: offer.dam.id }}>
          <ActionButton variant="soft">
            <ArrowLeft className="size-3.5" /> Back to {offer.dam.name}
          </ActionButton>
        </Link>
      </div>
    )
  }

  const offspringCOIColor = getCOIColor(offer.offspringCOI)
  const isCrossBreed = offer.sire.breed.id !== offer.dam.breed.id

  if (result) {
    return (
      <div className="mx-auto max-w-2xl p-8 space-y-6">
        <div className={cn(
          "rounded-lg border p-6 text-center space-y-2",
          result.conceived
            ? "border-chart-2/40 bg-chart-2/10"
            : "border-muted-foreground/20 bg-secondary/30"
        )}>
          {result.conceived ? (
            <>
              <Sparkles className="mx-auto size-8 text-chart-2" />
              <p className="font-serif text-xl font-semibold text-foreground">Conception Successful</p>
              <p className="text-sm text-muted-foreground">{offer.dam.name} is pregnant.</p>
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
        <Link to="/animal/$animalId" params={{ animalId: offer.dam.id }}>
          <ActionButton variant="soft">
            <ArrowLeft className="size-3.5" /> Back to {offer.dam.name}
          </ActionButton>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/animal/$animalId", params: { animalId: offer.dam.id } })}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
      </div>

      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Confirm Breeding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the pair before confirming. This will run the conception roll.
        </p>
      </div>

      {/* Pair cards */}
      <div className="flex gap-3">
        <ParentCard label="Sire" grade={offer.sireGrade} animal={offer.sire} />
        <ParentCard label="Dam" grade={offer.damGrade} animal={offer.dam} />
      </div>

      {/* Pair stats */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pair Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conception chance</p>
            <p className="text-sm font-semibold text-foreground">{offer.conceptionChance}%</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Offspring COI</p>
            <p className={cn("text-sm font-semibold", offspringCOIColor)}>
              {(offer.offspringCOI * 100).toFixed(2)}%
            </p>
          </div>
          {isCrossBreed && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pairing</p>
              <p className="text-sm font-semibold text-foreground">Cross-breed</p>
            </div>
          )}
        </div>

        {offer.price > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <Dna className="size-3.5 shrink-0" />
            Stud fee: {offer.price}g will be charged on confirmation
          </div>
        )}
      </div>

      {/* Predictor placeholder */}
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-center text-[11px] text-muted-foreground">
        Breeding predictor — coming soon
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <ActionButton
          variant="soft"
          className="flex-1 justify-center text-destructive hover:bg-destructive/10"
          disabled={declinePending || acceptPending}
          onClick={() => declineCover({ offerId })}
        >
          {declinePending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Decline
        </ActionButton>
        <ActionButton
          variant="primary"
          className="flex-1 justify-center"
          disabled={acceptPending || declinePending}
          onClick={() => acceptCover({ offerId })}
        >
          {acceptPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-3.5" />}
          Confirm Breeding
        </ActionButton>
      </div>
    </div>
  )
}
