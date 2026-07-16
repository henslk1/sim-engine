import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Trophy, ChevronLeft, MapPin, Users, Clock, Ban, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/venues")({
  validateSearch: (search: Record<string, unknown>) => ({
    animalId: (search.animalId as string) || undefined,
    disciplineDefId: (search.disciplineDefId as string) || undefined,
    isConformation: search.isConformation === true || search.isConformation === "true" || undefined,
    from: (search.from as string) || undefined,
  }),
  component: VenuesPage,
})

type Competition = {
  id: string
  disciplineDef: {
    id: string
    name: string
    isConformation: boolean
    equipmentRequirements: { id: string; quantity: number; itemDef: { id: string; name: string } }[]
  }
  venue: { id: string; name: string }
  expiresAt: Date | string | null
  _count: { entries: number }
}

type EligibilityData = {
  animal: {
    ageInCycles: number
    equipment: { itemDef: { id: string } }[]
    healthCertificates: { isValid: boolean; expiresAtCycle: number; certDef: { id: string; name: string } }[]
    healthRecords: {
      treatmentRecords: {
        treatmentDef: { restrictionDefs: { restrictionType: string }[] }
        activityRestriction: { restrictionType: string }[]
      }[]
    }[]
  }
  requiredCertDefs: { id: string; name: string }[]
}

function getBlockReasons(
  eligibility: EligibilityData,
  comp: Competition,
  hasConformationScore: boolean,
): string[] {
  const reasons: string[] = []
  const { animal, requiredCertDefs } = eligibility

  const restrictionTypes = new Set<string>()
  for (const record of animal.healthRecords) {
    for (const t of record.treatmentRecords) {
      for (const rd of t.treatmentDef.restrictionDefs) restrictionTypes.add(rd.restrictionType)
      for (const r of t.activityRestriction) restrictionTypes.add(r.restrictionType)
    }
  }
  if (restrictionTypes.has("COMPETITION") || restrictionTypes.has("ALL")) {
    reasons.push("Activity restricted due to active treatment")
  }

  if (comp.disciplineDef.isConformation && !hasConformationScore) {
    reasons.push("No conformation score — inspection required before entering")
  }

  for (const certDef of requiredCertDefs) {
    const cert = animal.healthCertificates.find((c) => c.certDef.id === certDef.id)
    if (!cert || !cert.isValid || cert.expiresAtCycle <= animal.ageInCycles) {
      reasons.push(`Missing certificate: ${certDef.name}`)
    }
  }

  for (const req of comp.disciplineDef.equipmentRequirements) {
    const equipped = animal.equipment.filter((e) => e.itemDef.id === req.itemDef.id).length
    if (equipped < req.quantity) {
      reasons.push(`Missing equipment: ${req.itemDef.name}${req.quantity > 1 ? ` (${equipped}/${req.quantity})` : ""}`)
    }
  }

  return reasons
}

function VenuesPage() {
  const { animalId: initialAnimalId, disciplineDefId: initialDisciplineDefId, isConformation, from } = Route.useSearch()
  const navigate = useNavigate()

  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data: animals } = trpc.animal.list.useQuery()
  const aliveAnimals = animals?.filter((a) => a.status === "ALIVE") ?? []

  const [selectedAnimalId, setSelectedAnimalId] = useState(initialAnimalId ?? "")
  const [enteredId, setEnteredId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: competitions, isLoading: compsLoading } = trpc.competition.listOpen.useQuery(
    {
      gameId: gameId!,
      disciplineDefId: isConformation ? undefined : initialDisciplineDefId,
      isConformation: isConformation ?? undefined,
    },
    { enabled: !!gameId },
  )

  const { data: eligibility } = trpc.competition.eligibility.useQuery(
    { animalId: selectedAnimalId, gameId: gameId! },
    { enabled: !!selectedAnimalId && !!gameId },
  )

  const { data: selectedAnimalProfile } = trpc.animalProfile.get.useQuery(
    { animalId: selectedAnimalId },
    { enabled: !!selectedAnimalId && !!isConformation },
  )
  const hasConformationScore = (selectedAnimalProfile?.conformationScores.length ?? 0) > 0

  const utils = trpc.useUtils()

  const enter = trpc.competition.enter.useMutation({
    onSuccess: (_, variables) => {
      setEnteredId(variables.competitionId)
      setErrorMsg(null)
      utils.competition.listOpen.invalidate({ gameId: gameId! })
      if (from === "animal" && initialAnimalId) {
        navigate({ to: "/animal/$animalId", params: { animalId: initialAnimalId } })
      }
    },
    onError: (err) => {
      setErrorMsg(err.message)
    },
  })

  function handleEnter(competitionId: string) {
    if (!selectedAnimalId || !playerAccountId) return
    setEnteredId(null)
    setErrorMsg(null)
    enter.mutate({ animalId: selectedAnimalId, competitionId, playerAccountId })
  }

  const grouped = competitions?.reduce<Record<string, Competition[]>>((acc, comp) => {
    const key = comp.venue.id
    if (!acc[key]) acc[key] = []
    acc[key].push(comp as Competition)
    return acc
  }, {}) ?? {}

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        {from === "animal" && initialAnimalId && (
          <Link to="/animal/$animalId" params={{ animalId: initialAnimalId }} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-5" />
          </Link>
        )}
        <h1 className="font-serif text-2xl font-semibold text-foreground flex items-center gap-2">
          <Trophy className="size-5" /> {isConformation ? "Conformation Shows" : "Competition Venues"}
        </h1>
      </div>

      {/* Animal selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Competing Animal</label>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={selectedAnimalId}
          onChange={(e) => { setSelectedAnimalId(e.target.value); setEnteredId(null); setErrorMsg(null) }}
        >
          <option value="">Select an animal…</option>
          {aliveAnimals.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.breed.name} · {a.lifeStage.name} · {a.sex === "MALE" ? "M" : "F"}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      {/* Open competitions grouped by venue */}
      {compsLoading ? (
        <p className="text-sm text-muted-foreground">Loading competitions…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">No open competitions right now.</p>
      ) : (
        Object.values(grouped).map((comps) => {
          const venue = comps[0].venue
          return (
            <section key={venue.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <MapPin className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{venue.name}</h2>
              </div>
              <div className="divide-y divide-border/50">
                {comps.map((comp) => {
                  const blockReasons = eligibility ? getBlockReasons(eligibility as EligibilityData, comp, hasConformationScore) : []
                  const isBlocked = blockReasons.length > 0
                  const isEntering = enter.isPending && enter.variables?.competitionId === comp.id
                  const justEntered = enteredId === comp.id

                  return (
                    <div key={comp.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{comp.disciplineDef.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="size-3" />
                              {comp._count.entries} entered
                            </span>
                            {comp.expiresAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                Closes {new Date(comp.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {isBlocked && selectedAnimalId && (
                            <div className="mt-1.5 space-y-0.5">
                              {blockReasons.map((reason) => (
                                <div key={reason} className="flex items-center gap-1 text-[11px] text-destructive">
                                  {reason.startsWith("Activity") ? (
                                    <Ban className="size-3 shrink-0" />
                                  ) : (
                                    <XCircle className="size-3 shrink-0" />
                                  )}
                                  {reason}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={justEntered ? "outline" : "default"}
                          disabled={!selectedAnimalId || isEntering || justEntered || isBlocked}
                          onClick={() => handleEnter(comp.id)}
                        >
                          {isEntering ? "Entering…" : justEntered ? "Entered" : "Enter"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
