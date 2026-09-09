import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
})

const GENDERS: { value: string; label: string; emoji: string }[] = [
  { value: "MALE", label: "Stallion", emoji: "♂" },
  { value: "FEMALE", label: "Mare", emoji: "♀" },
]

function SetupPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: starterBreeds = [], isLoading: breedsLoading } = trpc.player.getStarterBreeds.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId },
  )

  const [step, setStep] = useState<"breed" | "username">("breed")
  const [breedIndex, setBreedIndex] = useState(0)
  const [selectedColorOptionId, setSelectedColorOptionId] = useState<string | null>(null)
  const [selectedGender, setSelectedGender] = useState<string | null>(null)
  const [username, setUsername] = useState("")

  const selectedBreed = starterBreeds[breedIndex] ?? null

  function handleBreedChange(dir: -1 | 1) {
    const next = breedIndex + dir
    if (next < 0 || next >= starterBreeds.length) return
    setBreedIndex(next)
    setSelectedColorOptionId(null)
  }

  const create = trpc.player.create.useMutation({
    onSuccess: async () => {
      await utils.player.me.invalidate()
      navigate({ to: "/dashboard", search: { welcome: true } })
    },
  })

  function handleContinue() {
    if (!selectedBreed || !selectedColorOptionId || !selectedGender) return
    setStep("username")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gameId || !selectedBreed || !selectedColorOptionId || !selectedGender) return
    create.mutate({
      gameId,
      username,
      starterBreedOptionId: selectedBreed.id,
      starterColorOptionId: selectedColorOptionId,
      starterGender: selectedGender,
    })
  }

  if (breedsLoading || !gameId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-2xl space-y-8">

        <div className="text-center">
          <h1 className="font-serif text-3xl font-semibold text-foreground">
            {step === "breed" ? "Choose your starting horse" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === "breed" ? "Pick a breed, color, and gender." : "Choose a username to get started."}
          </p>
        </div>

        {step === "breed" ? (
          <div className="space-y-6">

            {/* Breed carousel */}
            <div className="relative flex items-center justify-center gap-3">
              <button
                onClick={() => handleBreedChange(-1)}
                disabled={breedIndex === 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>

              {/* Breed name strip */}
              <div className="flex flex-1 items-end justify-center gap-4 overflow-hidden">
                {starterBreeds.map((b, i) => {
                  const dist = Math.abs(i - breedIndex)
                  if (dist > 2) return null
                  const isSelected = i === breedIndex
                  return (
                    <button
                      key={b.id}
                      onClick={() => { setBreedIndex(i); setSelectedColorOptionId(null) }}
                      className={cn(
                        "shrink-0 font-serif font-semibold transition-all duration-200",
                        isSelected
                          ? "text-xl text-foreground"
                          : dist === 1
                          ? "text-base text-muted-foreground opacity-70"
                          : "text-sm text-muted-foreground opacity-40"
                      )}
                    >
                      {b.breed.name}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => handleBreedChange(1)}
                disabled={breedIndex === starterBreeds.length - 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* Breed image */}
            {selectedBreed && (
              <div className="flex justify-center">
                {selectedBreed.breed.image ? (
                  <img
                    src={selectedBreed.breed.image}
                    alt={selectedBreed.breed.name}
                    className="h-56 w-full max-w-sm rounded-2xl border border-border object-cover shadow-md"
                  />
                ) : (
                  <div className="flex h-56 w-full max-w-sm items-center justify-center rounded-2xl border border-border bg-muted text-7xl shadow-md">
                    🐴
                  </div>
                )}
              </div>
            )}

            {/* Color swatches */}
            {selectedBreed && selectedBreed.colorOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {selectedBreed.colorOptions.map(c => {
                    const isSelected = selectedColorOptionId === c.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedColorOptionId(c.id)}
                        className={cn(
                          "flex w-24 flex-col items-center gap-2 rounded-xl border p-3 transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                            : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        {c.image ? (
                          <img src={c.image} alt={c.name} className="h-14 w-14 rounded-full object-cover" />
                        ) : (
                          <div className="h-14 w-14 rounded-full bg-muted" />
                        )}
                        <span className="text-center text-[11px] font-medium leading-tight text-foreground">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gender */}
            <div className="space-y-2">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gender</p>
              <div className="flex justify-center gap-4">
                {GENDERS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setSelectedGender(g.value)}
                    className={cn(
                      "flex w-32 flex-col items-center gap-2 rounded-xl border px-4 py-4 transition-all",
                      selectedGender === g.value
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    <span className="text-3xl">{g.emoji}</span>
                    <span className="text-sm font-medium text-foreground">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!selectedBreed || !selectedColorOptionId || !selectedGender}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </div>

        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Username</label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. silverstar_stables"
                value={username}
                onChange={e => setUsername(e.target.value)}
                minLength={3}
                maxLength={30}
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">3–30 characters</p>
            </div>
            {create.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {create.error.message}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setStep("breed")}>
                Back
              </Button>
              <Button type="submit" disabled={create.isPending || !gameId} className="flex-1">
                {create.isPending ? "Creating…" : "Get Started"}
              </Button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}
