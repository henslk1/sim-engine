import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"

export const Route = createFileRoute("/_authenticated/animal/$animalId")({
  component: AnimalProfilePage,
})

function AnimalProfilePage() {
  const { animalId } = Route.useParams()
  const { data: animal, isLoading } = trpc.animalProfile.get.useQuery({ animalId })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (!animal) return <div className="p-8">Animal not found</div>

  const config = animal.game.gameConfig
  function cycleToAge(cycle: number) {
    if (!config) return `cycle ${cycle}`
    const y = Math.floor(cycle / config.cyclesPerYear)
    const m = cycle % config.cyclesPerYear
    return `${y}y ${m}m`
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-3xl font-bold">{animal.name}</h1>
        <span className="text-sm text-muted-foreground">{animal.status}</span>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{animal.breed.name}</span>
        <span>·</span>
        <span>{animal.lifeStage.name}</span>
        <span>·</span>
        <span>{animal.sex}</span>
        <span>·</span>
        <span>{cycleToAge(animal.ageInCycles)}</span>
        {animal.disciplineDef && (
          <>
            <span>·</span>
            <span>{animal.disciplineDef.name}</span>
          </>
        )}
      </div>
      </div>

      {/* Vitals */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Vitals</h2>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Energy", value: animal.energy?.currentEnergy, max: animal.energy?.maxEnergy },
            { label: "Mood", value: animal.mood?.value, max: 100 },
            { label: "Condition", value: animal.condition?.value, max: 100 },
            { label: "Care Score", value: animal.careScore?.score, max: 100 },
            { label: "Immunity", value: animal.immunity?.value, max: animal.immunity?.innateMax },
          ].map(({ label, value, max }) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-xl font-semibold">
                {value !== undefined && value !== null ? Math.round(value) : "-"}
              </div>
              {max !== undefined && max !== null &&(
                <div className="text-xs text-muted-foreground">/ {Math.round(max)}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Stats</h2>
        <div className="rounded-md border divide-y">
          {animal.stats.map((stat) => {
            const cap = config ? stat.innateValue * config.trainingCeilingMultiplier : null
            return (
              <div key={stat.statDef.name} className="p-3 flex items-center gap-6">
                <span className="font-medium w-32">{stat.statDef.name}</span>
                <span className="text-sm text-muted-foreground">
                  Innate <span className="text-foreground font-medium">{Math.round(stat.innateValue)}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  Trained <span className="text-foreground font-medium">{Math.round(stat.trainedValue)}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  Total <span className="text-foreground font-medium">{Math.round(stat.innateValue + stat.trainedValue)}</span>
                </span>
                {cap !== null && (
                  <span className="text-sm text-muted-foreground">
                    Cap <span className="text-foreground font-medium">{Math.round(cap)}</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Personality */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Personality</h2>
        <div className="rounded-md border divide-y">
          {animal.personality.map((trait) => (
            <div key={trait.traitDef.name} className="p-3 flex items-center gap-6">
              <span className="font-medium w-32">{trait.traitDef.name}</span>
              <span className="text-sm text-muted-foreground">
                {Math.round(trait.value)}
              </span>
              {trait.traitLabel && (
                <span className="text-sm">{trait.traitLabel}</span>
              )}
            </div>
            )
          )}
        </div>
      </section>

      {/* Genetics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Genetics</h2>
        {Object.entries(
          animal.genotypes.reduce<Record<string, typeof animal.genotypes>>((acc, g) => {
            const group = g.locus.displayGroup ?? "Other"
            if (!acc[group]) acc[group] = []
            acc[group].push(g)
            return acc
          }, {})
        ).map(([group, genotypes]) => (
          <div key={group} className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group}</h3>
            <div className="rounded-md border divide-y">
              {genotypes.map((g) => (
                <div key={g.locusId} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-32">{g.locus.name}</span>
                  {g.isTestedByOwner ? (
                    <>
                      <span className="text-sm font-mono">{g.alleleOne.symbol}/{g.alleleTwo.symbol}</span>
                      <span className="text-xs text-muted-foreground">Tested</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Untested</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {animal.conformationScores.length > 0 && (
          <div className="rounded-md border divide-y">
            {animal.conformationScores.map((score) => (
              <div key={score.breedId} className="p-3 flex items-center gap-6">
                <span className="font-medium w-32">Conformation</span>
                <span className="text-sm">{score.breed.name}</span>
                <span className="text-sm font-medium">{score.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Health */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Health</h2>

        {animal.healthRecords.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Conditions</h3>
            <div className="rounded-md border divide-y">
              {animal.healthRecords.map((record) => (
                <div key={record.id} className="p-3">
                  <div className="flex items-center gap-4">
                    <span className="font-medium w-40">{record.conditionDef.name}</span>
                    <span className={`text-xs font-medium ${record.isActive ? "text-primary" : "text-muted-foreground"}`}>
                      {record.isActive ? "Active" : "Resolved"}
                    </span>
                    <span className="text-sm text-muted-foreground">Diagnosed {cycleToAge(record.diagnosedCycle)}</span>
                  </div>
                  {record.treatmentRecords.length > 0 && (
                    <div className="mt-2 ml-4 space-y-1">
                      {record.treatmentRecords.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{t.treatmentDef.name}</span>
                          {t.activityRestriction && <span className="text-xs">· Activity restricted</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.healthCertificates.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Certificates</h3>
            <div className="rounded-md border divide-y">
              {animal.healthCertificates.map((cert) => (
                <div key={cert.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{cert.certDef.name}</span>
                  <span className="text-sm text-muted-foreground">Issued at age {cycleToAge(cert.issuedCycle)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.vetVisitLogs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent Vet Visits</h3>
            <div className="rounded-md border divide-y">
              {animal.vetVisitLogs.map((visit) => (
                <div key={visit.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{visit.vetServiceDef?.name ?? "Vet visit"}</span>
                  <span className="text-sm text-muted-foreground">Visited at age {cycleToAge(visit.visitCycle)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Care */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Care</h2>

        {animal.longTermCareRecords.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Long-Term Care</h3>
            <div className="rounded-md border divide-y">
              {animal.longTermCareRecords.map((record) => (
                <div key={record.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{record.longTermCareActionDef.name}</span>
                  {record.lastPerformedCycle !== null
                    ? <span className="text-sm text-muted-foreground">Last done {cycleToAge(record.lastPerformedCycle)}</span>
                    : <span className="text-sm text-muted-foreground">Never performed</span>
                  }
                  <span className="text-sm text-muted-foreground">Next due {cycleToAge(record.nextDueCycle)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.careLogs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent Care</h3>
            <div className="rounded-md border divide-y">
              {animal.careLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{log.careActionDef.name}</span>
                  <span className="text-sm text-muted-foreground">{cycleToAge(log.cycleNumber)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Training */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Training</h2>

        {animal.trainingLogs.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent Training</h3>
            <div className="rounded-md border divide-y">
              {animal.trainingLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{log.trainingActionDef.name}</span>
                  <span className="text-sm text-muted-foreground">{log.trainingActionDef.statDef.name}</span>
                  <span className="text-sm text-muted-foreground">{log.intensityTierDef.name}</span>
                  <span className="text-sm text-muted-foreground">{cycleToAge(log.cycleNumber)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.stageActivityLogs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Stage Activities</h3>
            <div className="rounded-md border divide-y">
              {animal.stageActivityLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{log.stageActivityDef.name}</span>
                  <span className="text-sm text-muted-foreground">{cycleToAge(log.cycleNumber)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Competition */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Competition</h2>

        {animal.compTiers.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Competition Tiers</h3>
            <div className="rounded-md border divide-y">
              {animal.compTiers.map((ct) => (
                <div key={ct.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{ct.disciplineDef.name}</span>
                  <span className="text-sm text-muted-foreground">{ct.tierDef.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.titles.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Titles</h3>
            <div className="rounded-md border divide-y">
              {animal.titles.map((t) => (
                <div key={t.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{t.titleDef.name}</span>
                  {t.titleDef.disciplineDef && <span className="text-sm text-muted-foreground">{t.titleDef.disciplineDef.name}</span>}
                  <span className="text-sm text-muted-foreground">Earned {cycleToAge(t.cycleNumber)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {animal.competitionEntries.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent Entries</h3>
            <div className="rounded-md border divide-y">
              {animal.competitionEntries.map((entry) => (
                <div key={entry.id} className="p-3 flex items-center gap-6">
                  <span className="font-medium w-40">{entry.competition.venue.name}</span>
                  <span className="text-sm text-muted-foreground">{entry.tierDef.name}</span>
                  {entry.result && (
                    <>
                      {entry.result.placement !== null && <span className="text-sm font-medium">#{entry.result.placement}</span>}
                      <span className="text-sm text-muted-foreground">Score {entry.result.score.toFixed(1)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
