import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { ActionButton } from "@/components/game/ui"
import { Dna, Heart, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCOIColor, BREEDING_GRADE_COLOR, BREEDING_GRADE_BG } from "../animal/-animal-profile/utils"

export type PredictorOffspring = {
  sex: "MALE" | "FEMALE"
  breedName: string
  fertility: number
  inbreedingCoefficient: number
  stats: Array<{ name: string; innateValue: number }>
  statTotal: number
  immunityMax: number
}

export type PredictorResult = {
  offspring: PredictorOffspring[]
  quotaUsed: number
  quotaLimit: number
  cost: number
}

export function FertilityHearts({ fertility }: { fertility: number }) {
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

export function ParentCard({ label, grade, animal }: {
  label: "Sire" | "Dam"
  grade: string
  animal: {
    id: string
    name: string
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

export function OffspringCard({ offspring }: { offspring: PredictorOffspring }) {
  const coiColor = getCOIColor(offspring.inbreedingCoefficient)
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-semibold", offspring.sex === "MALE" ? "text-blue-500" : "text-rose-500")}>
            {offspring.sex === "MALE" ? "♂" : "♀"}
          </span>
          <span className="text-sm font-medium text-foreground">{offspring.breedName}</span>
        </div>
        <span className={cn("text-[11px] font-semibold tabular-nums", coiColor)}>
          COI {(offspring.inbreedingCoefficient * 100).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Fertility</span>
          <FertilityHearts fertility={offspring.fertility} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Immunity</span>
          <span className="font-medium text-foreground">{Math.round(offspring.immunityMax)}</span>
        </div>
      </div>
      {offspring.stats.length > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {offspring.stats.map((stat) => (
            <div key={stat.name} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{stat.name}</span>
              <span className="font-medium tabular-nums text-foreground">{stat.innateValue.toFixed(1)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-[11px] font-semibold pt-1 border-t border-border/30">
            <span className="text-foreground/70">Total</span>
            <span className="tabular-nums text-foreground">{offspring.statTotal.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

type PredictorInput =
  | { offerId: string }
  | { sireId: string; damId: string; playerAccountId: string; gameId: string }

export function PredictorSection({
  runInput,
  predictorQuota,
}: {
  runInput: PredictorInput
  predictorQuota: { used: number; limit: number; cost: number }
}) {
  const [result, setResult] = useState<PredictorResult | null>(null)
  const [quotaUsed, setQuotaUsed] = useState(predictorQuota.used)

  const { mutate: runPredictor, isPending, error } = trpc.breeding.cover.runPredictor.useMutation({
    onSuccess: (data) => {
      setResult(data)
      setQuotaUsed(data.quotaUsed)
    },
  })

  const remaining = predictorQuota.limit > 0 ? predictorQuota.limit - quotaUsed : null
  const canRun = remaining === null || remaining > 0
  const costLabel = predictorQuota.cost > 0 ? ` · ${predictorQuota.cost}g` : ""

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Breeding Predictor</h2>
        {predictorQuota.limit > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {Math.max(0, remaining ?? 0)} of {predictorQuota.limit} uses today
          </span>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error.message}</p>}

      {result ? (
        <div className="space-y-2">
          {result.offspring.map((o, i) => (
            <OffspringCard key={i} offspring={o} />
          ))}
          {canRun && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runPredictor(runInput)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 pt-1"
            >
              {isPending ? <Loader2 className="size-3 animate-spin" /> : <Dna className="size-3" />}
              {isPending ? "Running…" : `Run again${costLabel}`}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-2">
          <ActionButton
            variant="soft"
            disabled={isPending || !canRun}
            onClick={() => runPredictor(runInput)}
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Dna className="size-3.5" />}
            {isPending ? "Running…" : canRun ? `Run Predictor${costLabel}` : "Daily limit reached"}
          </ActionButton>
          <p className="text-[11px] text-muted-foreground text-center max-w-xs">
            Preview a sample offspring without committing to the breeding.
          </p>
        </div>
      )}
    </div>
  )
}
