import { useState, useEffect } from "react"
import type { AnimalProfile } from "../types"
import { formatCycleAge, formatBreedLabel, displaySex } from "../utils"
import { Badge, ActionButton } from "@/components/game/ui"
import { Skull, Archive, AlertTriangle } from "lucide-react"
import { trpc } from "@/lib/trpc"

// First midnight that falls at least 24h after diedAt, so a death right before
// a nightly reset still gets a full day of grace.
function getAutoBurialDeadline(diedAt: Date): Date {
  const earliest = new Date(diedAt.getTime() + 24 * 60 * 60 * 1000)
  const midnight = new Date(earliest)
  midnight.setHours(0, 0, 0, 0)
  if (midnight.getTime() < earliest.getTime()) midnight.setDate(midnight.getDate() + 1)
  return midnight
}

function useCountdown(target: Date) {
  const [timeLeft, setTimeLeft] = useState("")
  useEffect(() => {
    function update() {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) { setTimeLeft("imminent"); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(`${h}h ${m}m`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [target])
  return timeLeft
}

export function DeceasedPendingView({ animal }: { animal: AnimalProfile; animalId: string }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)
  const deadline = animal.diedAt
    ? getAutoBurialDeadline(new Date(animal.diedAt))
    : getAutoBurialDeadline(new Date())
  const countdown = useCountdown(deadline)
  const breedLabel = formatBreedLabel(animal)

  const utils = trpc.useUtils()
  const { mutate: bury, isPending: isBurying } = trpc.animal.bury.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })
  const { mutate: archive, isPending: isArchiving } = trpc.animal.archive.useMutation({
    onSuccess: () => utils.animalProfile.get.invalidate({ animalId: animal.id }),
  })

  return (
    <div className="flex min-h-full flex-col bg-muted/20">

      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          {animal.image ? (
            <img
              src={animal.image}
              alt={animal.name}
              className="size-16 shrink-0 rounded-full object-cover grayscale opacity-50"
            />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted">
              <Skull className="size-6 text-muted-foreground/40" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-semibold text-foreground/80">{animal.name}</h1>
              <Badge tone="danger">Deceased</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {breedLabel} · {displaySex(animal.sex, animal.isCastrated)}
              {animal.breedGeneration !== null && ` · Gen ${animal.breedGeneration}`}
              {" · "}{cycleToAge(animal.ageInCycles)} old
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">

        {/* Death notification */}
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive/60" />
          <div className="text-sm">
            <p className="font-semibold text-foreground/80">{animal.name} has passed away</p>
            <p className="mt-0.5 text-muted-foreground">
              Cause of death: {animal.causeOfDeath ?? "Unknown"} · Died at {cycleToAge(animal.ageInCycles)}
            </p>
          </div>
        </div>

        {/* Decision card */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Choose what to do</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              If no action is taken, {animal.name} will be automatically buried in{" "}
              <span className="font-medium text-foreground">{countdown || "…"}</span>.
              You have at least 24 hours from the time of death to decide.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-border/30">
            <div className="bg-card/80 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Skull className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Bury</h3>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Preserve a minimal memorial. Basic stats, pedigree reference, and cause of death
                remain visible. The animal no longer appears in active rosters.
              </p>
              <ActionButton
                variant="soft"
                disabled={isBurying || isArchiving}
                className="w-full justify-center"
                onClick={() => bury({ animalId: animal.id })}
              >
                {isBurying ? "Burying…" : `Bury ${animal.name}`}
              </ActionButton>
            </div>

            <div className="bg-card/80 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Archive className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Archive</h3>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Keep the full profile as a historical record. Stats, training history,
                competition results, and pedigree remain browsable.
              </p>
              <ActionButton
                variant="soft"
                disabled={isBurying || isArchiving}
                className="w-full justify-center"
                onClick={() => archive({ animalId: animal.id })}
              >
                {isArchiving ? "Archiving…" : `Archive ${animal.name}`}
              </ActionButton>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/30">
          <StatCell label="Born" value={new Date(animal.bornAt).toLocaleDateString()} />
          <StatCell label="Died" value={animal.diedAt ? new Date(animal.diedAt).toLocaleDateString() : "—"} />
          <StatCell label="COI" value={`${(animal.inbreedingCoefficient * 100).toFixed(2)}%`} />
        </div>

      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground/80">{value}</p>
    </div>
  )
}
