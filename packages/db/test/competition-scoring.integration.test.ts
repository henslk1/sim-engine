import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "../prisma/generated/prisma/client.ts"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * The parts of competition scoring that only a real database can answer.
 *
 * Everything about the formula is tested structurally in
 * `packages/engine/test/competition-scoring.test.ts`: what gets frozen, what a
 * snapshot holds, that resolution reads it and nothing else. Three claims are
 * not reachable that way, because all three are about locks and visibility.
 *
 *   1. **One rule set per competition.** The rules are frozen when the first
 *      entry is accepted, and "first" is decided by a Postgres row lock - the
 *      entry path reads `scoringRules` out of the locking UPDATE rather than
 *      out of the read before it. Two entries arriving at the same instant both
 *      see no rules in their own snapshot; only one is inside the lock at a
 *      time, and the second has to come out of the wait seeing what the first
 *      wrote. A double cannot be wrong about that, because a double has no
 *      lock.
 *
 *   2. **No entry is left without a result.** The resolver claims the
 *      competition's row before reading its field. It used to read first, which
 *      meant it could take an empty list, queue behind an entry that was still
 *      uncommitted, and then mark the competition COMPLETED around an entry it
 *      had never seen.
 *
 *   3. **Which records a horse may set.** `RecordDef` narrows on breed and on
 *      discipline, and the discipline half is participation: a horse holds a
 *      discipline's record once it has entered a competition in it, not when
 *      somebody assigns it one.
 *
 * ## Running it
 *
 *     pnpm test:scoring:db
 *
 * It needs its own database, because it writes. By default that is the one
 * named in `DATABASE_URL` with the name replaced by `sim_engine_conc` - the
 * same scratch copy `pnpm test:concurrency:db` uses - and
 * `SCORING_DATABASE_URL` points it somewhere else.
 *
 * Everything it creates it deletes afterwards, and every field it borrows on an
 * animal that was already there is read first and written back.
 */

const ENABLED = process.env["RUN_DATABASE_TESTS"] === "1"
const EXPECTED_DB = "sim_engine_conc"

/** The scratch URL: explicit if given, otherwise `DATABASE_URL` with the name swapped. */
function targetUrl(): string {
  const explicit = process.env["SCORING_DATABASE_URL"]
  if (explicit) return explicit

  const base = process.env["DATABASE_URL"]
  if (!base) throw new Error("neither SCORING_DATABASE_URL nor DATABASE_URL is set")

  const url = new URL(base)
  url.pathname = `/${EXPECTED_DB}`
  return url.toString()
}

/**
 * The database a URL actually names.
 *
 * Parsed rather than searched: the name could sit in a username, a password or
 * a query parameter while the connection went somewhere else entirely, and this
 * suite writes.
 */
function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "")
}

let db: PrismaClient
let URL_: string

const skip = ENABLED ? false : "set RUN_DATABASE_TESTS=1 to run the scoring suite"

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_ }) })
}

/** The divisor the rules are frozen against, and what it is moved to afterwards. */
const WORLD_MAX_AT_FREEZE = 100
const WORLD_MAX_AFTER = 1000

/** Names are unique per game, so this doubles as the marker for what to remove. */
const MARK = "scoring-integration-test"

/** Everything borrowed from an animal that already existed, to be handed back. */
type Borrowed = {
  animalId: string
  lifeStageId: string
  disciplineDefId: string | null
  secondaryDisciplineDefId: string | null
  currentEnergy: number
  condition: number
  lastWorkGainCycle: number | null
  mood: number | null
  trainedValue: number
  /** The weighted stats, which this suite sets so that a score is not zero. */
  weighedTrained: { statDefId: string; trainedValue: number }[]
}

let fixture: {
  gameId: string
  playerAccountId: string
  /** The discipline the race and the resolver test use. */
  disciplineDefId: string
  /** A second one, entered partway through the record test and not before. */
  otherDisciplineDefId: string
  raceCompetitionId: string
  resolverCompetitionId: string
  otherCompetitionId: string
  disciplineDefIds: string[]
  tierDefIds: string[]
  competitionIds: string[]
  /** The two weighted stats, with the global record definition backing each. */
  weighted: { statDefId: string; weight: number; recordDefId: string; recordEntryId: string }[]
  trainingActionDefId: string
  intensityTierDefId: string
  /** The stat the record test trains, kept distinct from the weighted two. */
  trainStatDefId: string
  /** The six definitions that stat could conceivably be recorded against. */
  recordDefs: {
    overall: string
    ownBreed: string
    otherBreed: string
    ownDiscipline: string
    otherDiscipline: string
    both: string
  }
  entrants: [Borrowed, Borrowed]
  /** Certificates this suite granted, to delete rather than restore. */
  grantedCertificates: { animalId: string; certDefId: string }[]
  /** Rows that existed before any of this ran, so only the new ones go. */
  existing: {
    healthRecords: string[]
    cycleActivity: string[]
    trainingLogs: string[]
    statHistory: string[]
  }
}

before(async () => {
  if (!ENABLED) return

  URL_ = targetUrl()

  // Enabled but pointed somewhere else is an error, not a reason to skip. A
  // suite that quietly passes by doing nothing is the worst of both.
  const named = databaseName(URL_)
  assert.equal(
    named,
    EXPECTED_DB,
    `refusing to run against "${named}" - this suite writes and expects ${EXPECTED_DB}`
  )

  process.env["DATABASE_URL"] = URL_
  db = client()

  // And confirm it against the server, not the string we were handed.
  const [current] = await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
  assert.equal(current!.db, EXPECTED_DB, "connected to the wrong database")

  const game = await db.game.findFirstOrThrow({ select: { id: true } })
  const venue = await db.venue.findFirstOrThrow({ where: { gameId: game.id }, select: { id: true } })

  // The stat the record test trains is chosen first, so the two the competition
  // weighs can be chosen to be other ones. Neither half can then write the
  // other's records.
  const trainingAction = await db.trainingActionDef.findFirstOrThrow({
    where: { gameId: game.id },
    select: { id: true, statDefId: true },
  })
  const intensity = await db.intensityTierDef.findFirstOrThrow({
    where: { gameId: game.id },
    orderBy: { tierIndex: "asc" },
    select: { id: true },
  })
  const weighedStats = await db.statDef.findMany({
    where: { gameId: game.id, NOT: { id: trainingAction.statDefId } },
    take: 2,
    select: { id: true },
  })
  assert.equal(weighedStats.length, 2, "the game needs three stats for this suite")

  // Two entrants: alive, owned, allowed to compete, unrestricted, and carrying
  // a row for every stat this suite touches.
  //
  // Owned-ness, a breed and the health rows are filtered after the query, not
  // in it: this client refuses `not: null` on a nullable scalar outright, and
  // `isNot: null` on an optional to-one is more than it reliably accepts.
  const candidates = (
    await db.animal.findMany({
      where: {
        gameId: game.id,
        status: "ALIVE",
        lifeStage: { canCompete: true },
        activityRestrictions: { none: { isActive: true } },
      },
      take: 50,
      select: {
        id: true,
        breedId: true,
        playerAccountId: true,
        lifeStageId: true,
        disciplineDefId: true,
        secondaryDisciplineDefId: true,
        energy: { select: { currentEnergy: true } },
        condition: { select: { value: true, lastWorkGainCycle: true } },
        mood: { select: { value: true } },
        stats: { select: { statDefId: true, trainedValue: true, innateValue: true } },
      },
    })
  )
    .filter((a) => a.playerAccountId !== null && a.breedId !== null)
    .filter((a) => a.energy !== null && a.condition !== null)
    .filter((a) => a.stats.some((s) => s.statDefId === trainingAction.statDefId))
    .filter((a) => weighedStats.every((w) => a.stats.some((s) => s.statDefId === w.id)))
    .slice(0, 2)

  assert.equal(candidates.length, 2, "two living, owned, competition-eligible animals are needed")

  const breedId = candidates[0]!.breedId!
  const otherBreed = await db.breed.findFirstOrThrow({
    where: { gameId: game.id, NOT: { id: breedId } },
    select: { id: true },
  })

  // --- the configuration this suite owns, created from nothing -------------
  //
  // Disciplines of its own rather than borrowed ones: every real discipline in
  // this game carries equipment requirements, and none of this is about
  // equipment. The second exists so that a horse can be shown entering a
  // discipline for the first time, under this suite's own control.
  const makeDiscipline = async (label: string) =>
    (
      await db.disciplineDef.create({
        data: { gameId: game.id, name: `${MARK} ${label}`, isConformation: false },
        select: { id: true },
      })
    ).id

  const disciplineDefId = await makeDiscipline("discipline")
  const otherDisciplineDefId = await makeDiscipline("other discipline")

  const weights = [
    { statDefId: weighedStats[0]!.id, weight: 0.6 },
    { statDefId: weighedStats[1]!.id, weight: 0.4 },
  ]
  await db.disciplineStatWeight.createMany({
    data: weights.map((w) => ({ disciplineDefId, ...w })),
  })
  await db.disciplineStatWeight.create({
    data: { disciplineDefId: otherDisciplineDefId, statDefId: trainingAction.statDefId, weight: 1 },
  })

  const makeTier = async (forDiscipline: string, label: string) =>
    (
      await db.competitionTierDef.create({
        data: {
          gameId: game.id,
          disciplineDefId: forDiscipline,
          name: `${MARK} ${label}`,
          tierIndex: 1,
          entryFee: 0,
          energyCost: 0,
        },
        select: { id: true },
      })
    ).id

  const tierDefIds = [
    await makeTier(disciplineDefId, "tier"),
    await makeTier(otherDisciplineDefId, "other tier"),
  ]

  // A known divisor for each weighted stat, so what the rules freeze is a
  // number this suite chose rather than whatever the game happens to hold.
  // `recordType` and `subjectType` are free text with no vocabulary anywhere in
  // the codebase; what makes a definition the global one is both narrowing
  // columns being null.
  const weighted: (typeof fixture)["weighted"] = []
  for (const w of weights) {
    const def = await db.recordDef.create({
      data: {
        gameId: game.id,
        name: `${MARK} global ${w.statDefId}`,
        recordType: "STAT_TRAINED",
        subjectType: "ANIMAL",
        statDefId: w.statDefId,
        breedId: null,
        disciplineDefId: null,
      },
      select: { id: true },
    })
    const entry = await db.recordEntry.create({
      data: { recordDefId: def.id, value: WORLD_MAX_AT_FREEZE },
      select: { id: true },
    })
    weighted.push({ ...w, recordDefId: def.id, recordEntryId: entry.id })
  }

  const makeDef = async (label: string, forBreed: string | null, forDiscipline: string | null) =>
    (
      await db.recordDef.create({
        data: {
          gameId: game.id,
          name: `${MARK} ${label}`,
          recordType: "STAT_TRAINED",
          subjectType: "ANIMAL",
          statDefId: trainingAction.statDefId,
          breedId: forBreed,
          disciplineDefId: forDiscipline,
        },
        select: { id: true },
      })
    ).id

  const recordDefs = {
    overall: await makeDef("overall", null, null),
    ownBreed: await makeDef("own breed", breedId, null),
    otherBreed: await makeDef("other breed", otherBreed.id, null),
    ownDiscipline: await makeDef("own discipline", null, disciplineDefId),
    otherDiscipline: await makeDef("other discipline", null, otherDisciplineDefId),
    both: await makeDef("breed and discipline", breedId, disciplineDefId),
  }

  const makeCompetition = async (forDiscipline: string, label: string) =>
    (
      await db.competition.create({
        data: {
          gameId: game.id,
          venueId: venue.id,
          disciplineDefId: forDiscipline,
          name: `${MARK} ${label}`,
          // Comfortably above what this suite enters, so filling one does not
          // enqueue a resolution partway through a test.
          maxEntries: 8,
          maxWaitHours: 24,
          status: "OPEN",
          isInvitational: false,
        },
        select: { id: true },
      })
    ).id

  const raceCompetitionId = await makeCompetition(disciplineDefId, "race competition")
  const resolverCompetitionId = await makeCompetition(disciplineDefId, "resolver competition")
  const otherCompetitionId = await makeCompetition(otherDisciplineDefId, "other competition")

  // --- the entrants, as the entry path needs to find them ------------------
  const entrants = candidates.map((animal) => ({
    animalId: animal.id,
    lifeStageId: animal.lifeStageId,
    disciplineDefId: animal.disciplineDefId,
    secondaryDisciplineDefId: animal.secondaryDisciplineDefId,
    currentEnergy: animal.energy!.currentEnergy,
    condition: animal.condition!.value,
    lastWorkGainCycle: animal.condition!.lastWorkGainCycle,
    mood: animal.mood?.value ?? null,
    trainedValue:
      animal.stats.find((s) => s.statDefId === trainingAction.statDefId)?.trainedValue ?? 0,
    weighedTrained: weights.map((w) => ({
      statDefId: w.statDefId,
      trainedValue: animal.stats.find((s) => s.statDefId === w.statDefId)?.trainedValue ?? 0,
    })),
  })) as [Borrowed, Borrowed]

  // Trained values the two entrants do not share, and that neither divisor
  // divides evenly: a field of untrained horses scores zero under any divisor,
  // and would let the race pass without the freeze having done anything.
  const trainedForRace = [
    [40, 70],
    [55, 20],
  ]
  for (const [index, entrant] of entrants.entries()) {
    await db.animal.update({
      where: { id: entrant.animalId },
      // Assigned the first discipline and nothing else. Whether the second one
      // is ever *entered* is the question the record test turns on.
      data: { disciplineDefId, secondaryDisciplineDefId: null },
    })
    await db.animalEnergy.update({
      where: { animalId: entrant.animalId },
      data: { currentEnergy: 100 },
    })
    await db.animalCondition.update({ where: { animalId: entrant.animalId }, data: { value: 100 } })
    for (const [slot, weight] of weights.entries()) {
      await db.animalStat.update({
        where: {
          animalId_statDefId: { animalId: entrant.animalId, statDefId: weight.statDefId },
        },
        data: { trainedValue: trainedForRace[index]![slot]! },
      })
    }
  }

  // The certificates the game requires of every entrant. Granted here and
  // deleted afterwards; one that was already there is left exactly as it was.
  const requiredCerts = await db.healthCertificateDef.findMany({
    where: { gameId: game.id, requiredForCompetition: true },
    select: { id: true },
  })
  const grantedCertificates: { animalId: string; certDefId: string }[] = []
  for (const entrant of entrants) {
    const age = await db.animal.findUniqueOrThrow({
      where: { id: entrant.animalId },
      select: { ageInCycles: true },
    })
    for (const cert of requiredCerts) {
      const existing = await db.healthCertificate.findUnique({
        where: { animalId_certDefId: { animalId: entrant.animalId, certDefId: cert.id } },
        select: { id: true },
      })
      if (existing) continue
      await db.healthCertificate.create({
        data: {
          animalId: entrant.animalId,
          certDefId: cert.id,
          issuedCycle: age.ageInCycles,
          expiresAtCycle: age.ageInCycles + 1000,
          isValid: true,
        },
      })
      grantedCertificates.push({ animalId: entrant.animalId, certDefId: cert.id })
    }
  }

  // What was already on these animals, so that cleanup removes only what this
  // suite caused. Training writes a log, a stat history row and an activity
  // marker, and can roll a health condition off a genotype trigger.
  const animalIds = entrants.map((e) => e.animalId)
  const ids = async <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id)
  const existing = {
    healthRecords: await ids(
      await db.animalHealthRecord.findMany({ where: { animalId: { in: animalIds } }, select: { id: true } })
    ),
    cycleActivity: await ids(
      await db.animalCycleActivity.findMany({ where: { animalId: { in: animalIds } }, select: { id: true } })
    ),
    trainingLogs: await ids(
      await db.trainingLog.findMany({ where: { animalId: { in: animalIds } }, select: { id: true } })
    ),
    statHistory: await ids(
      await db.animalStatHistory.findMany({ where: { animalId: { in: animalIds } }, select: { id: true } })
    ),
  }

  fixture = {
    gameId: game.id,
    playerAccountId: candidates[0]!.playerAccountId!,
    disciplineDefId,
    otherDisciplineDefId,
    raceCompetitionId,
    resolverCompetitionId,
    otherCompetitionId,
    disciplineDefIds: [disciplineDefId, otherDisciplineDefId],
    tierDefIds,
    competitionIds: [raceCompetitionId, resolverCompetitionId, otherCompetitionId],
    weighted,
    trainingActionDefId: trainingAction.id,
    intensityTierDefId: intensity.id,
    trainStatDefId: trainingAction.statDefId,
    recordDefs,
    entrants,
    grantedCertificates,
    existing,
  }
})

after(async () => {
  if (!ENABLED || !fixture) {
    if (db) await db.$disconnect()
    return
  }

  const animalIds = fixture.entrants.map((e) => e.animalId)
  const recordDefIds = [
    ...Object.values(fixture.recordDefs),
    ...fixture.weighted.map((w) => w.recordDefId),
  ]
  const competitionIds = { in: fixture.competitionIds }
  const disciplineDefIds = { in: fixture.disciplineDefIds }

  await db.competitionEntryStat.deleteMany({
    where: { entry: { competitionId: competitionIds } },
  })
  await db.competitionResult.deleteMany({ where: { entry: { competitionId: competitionIds } } })
  await db.competitionEntry.deleteMany({ where: { competitionId: competitionIds } })
  await db.competitionResolutionWork.deleteMany({ where: { competitionId: competitionIds } })
  await db.competition.deleteMany({ where: { id: competitionIds } })

  await db.animalWeeklyPoints.deleteMany({ where: { disciplineDefId: disciplineDefIds } })
  await db.animalCompetitionTier.deleteMany({ where: { disciplineDefId: disciplineDefIds } })
  await db.recordEntry.deleteMany({ where: { recordDefId: { in: recordDefIds } } })
  await db.recordDef.deleteMany({ where: { id: { in: recordDefIds } } })
  await db.competitionTierDef.deleteMany({ where: { id: { in: fixture.tierDefIds } } })
  await db.disciplineStatWeight.deleteMany({ where: { disciplineDefId: disciplineDefIds } })
  await db.disciplineDef.deleteMany({ where: { id: disciplineDefIds } })

  for (const cert of fixture.grantedCertificates) {
    await db.healthCertificate.delete({
      where: { animalId_certDefId: { animalId: cert.animalId, certDefId: cert.certDefId } },
    })
  }

  const onlyNew = (before_: string[]) => ({
    animalId: { in: animalIds },
    ...(before_.length > 0 ? { id: { notIn: before_ } } : {}),
  })
  await db.trainingLog.deleteMany({ where: onlyNew(fixture.existing.trainingLogs) })
  await db.animalStatHistory.deleteMany({ where: onlyNew(fixture.existing.statHistory) })
  await db.animalCycleActivity.deleteMany({ where: onlyNew(fixture.existing.cycleActivity) })
  await db.animalHealthRecord.deleteMany({ where: onlyNew(fixture.existing.healthRecords) })

  for (const entrant of fixture.entrants) {
    await db.animal.update({
      where: { id: entrant.animalId },
      data: {
        lifeStageId: entrant.lifeStageId,
        disciplineDefId: entrant.disciplineDefId,
        secondaryDisciplineDefId: entrant.secondaryDisciplineDefId,
      },
    })
    await db.animalEnergy.update({
      where: { animalId: entrant.animalId },
      data: { currentEnergy: entrant.currentEnergy },
    })
    await db.animalCondition.update({
      where: { animalId: entrant.animalId },
      data: { value: entrant.condition, lastWorkGainCycle: entrant.lastWorkGainCycle },
    })
    if (entrant.mood !== null) {
      await db.animalMood.update({
        where: { animalId: entrant.animalId },
        data: { value: entrant.mood },
      })
    }
    await db.animalStat.update({
      where: {
        animalId_statDefId: { animalId: entrant.animalId, statDefId: fixture.trainStatDefId },
      },
      data: { trainedValue: entrant.trainedValue },
    })
    for (const stat of entrant.weighedTrained) {
      await db.animalStat.update({
        where: { animalId_statDefId: { animalId: entrant.animalId, statDefId: stat.statDefId } },
        data: { trainedValue: stat.trainedValue },
      })
    }
  }

  await db.$disconnect()
})

test("two simultaneous first entries share one frozen rule set", { skip }, async () => {
  const { enterCompetitionTx, buildScoringRules, statScoreFrom } = await import(
    "../../engine/src/index.ts"
  )

  const first = client()
  const second = client()

  try {
    // Explicit signals rather than sleeps. The one unavoidable wait is below,
    // and it can only make this test weaker, never falsely strict.
    let entered: () => void
    const firstHasEntered = new Promise<void>((resolve) => { entered = resolve })
    let release: () => void
    const released = new Promise<void>((resolve) => { release = resolve })

    const raceFirst = first.$transaction(
      async (tx) => {
        const result = await enterCompetitionTx(tx, {
          animalId: fixture.entrants[0].animalId,
          competitionId: fixture.raceCompetitionId,
          playerAccountId: fixture.playerAccountId,
        })
        // The rules are written and the competition's row is held, uncommitted.
        entered!()
        await released
        return result
      },
      { timeout: 40_000 }
    )

    await firstHasEntered

    const raceSecond = second.$transaction(
      (tx) =>
        enterCompetitionTx(tx, {
          animalId: fixture.entrants[1].animalId,
          competitionId: fixture.raceCompetitionId,
          playerAccountId: fixture.playerAccountId,
        }),
      { timeout: 40_000 }
    )

    // Long enough for the second entry to reach the competition's row and queue
    // behind it. Nothing it does before that lock touches a record.
    await new Promise((resolve) => setTimeout(resolve, 400))

    // Now move the world, on a third connection, committed before the first
    // entry is. A second entry that froze rules of its own would freeze these.
    for (const w of fixture.weighted) {
      await db.recordEntry.update({
        where: { id: w.recordEntryId },
        data: { value: WORLD_MAX_AFTER },
      })
    }

    release!()
    await raceFirst
    await raceSecond

    // --- one rule set, and it is the first entry's --------------------------
    const competition = await db.competition.findUniqueOrThrow({
      where: { id: fixture.raceCompetitionId },
      select: { scoringRules: true },
    })
    assert.ok(competition.scoringRules, "the first entry must have frozen a rule set")
    const frozen = competition.scoringRules as unknown as {
      statWeights: { statDefId: string; weight: number; worldMax: number }[]
    }

    for (const w of fixture.weighted) {
      const weight = frozen.statWeights.find((s) => s.statDefId === w.statDefId)
      assert.ok(weight, `the frozen rules hold no weight for ${w.statDefId}`)
      assert.equal(
        weight.worldMax,
        WORLD_MAX_AT_FREEZE,
        "the second entry re-froze the rules, against the record that moved"
      )
    }

    // And the world really did move, or the assertion above proves nothing.
    const fresh = await db.$transaction((tx) =>
      buildScoringRules(tx, {
        gameId: fixture.gameId,
        disciplineDefId: fixture.disciplineDefId,
        isConformation: false,
        climate: "TEMPERATE",
        terrain: "FLAT",
      })
    )
    for (const w of fresh.statWeights) {
      assert.equal(w.worldMax, WORLD_MAX_AFTER, "freezing now would have used a different divisor")
    }

    // --- and both entries were measured by it -------------------------------
    const entries = await db.competitionEntry.findMany({
      where: { competitionId: fixture.raceCompetitionId },
      orderBy: { enteredAt: "asc" },
      select: {
        id: true,
        animalId: true,
        scoredAt: true,
        statScore: true,
        personalityMultiplier: true,
        conformationScore: true,
        environmentModifier: true,
      },
    })
    assert.equal(entries.length, 2, "both entries must have committed")

    for (const entry of entries) {
      assert.ok(entry.scoredAt, `entry ${entry.id} was accepted without a snapshot`)
      assert.ok(entry.statScore !== null, `entry ${entry.id} has no stat score`)
      assert.ok(entry.personalityMultiplier !== null, `entry ${entry.id} has no multiplier`)
      assert.ok(entry.environmentModifier !== null, `entry ${entry.id} has no environment modifier`)
      assert.equal(entry.conformationScore, null, "this is not a conformation competition")

      const stats = await db.animalStat.findMany({
        where: {
          animalId: entry.animalId,
          statDefId: { in: fixture.weighted.map((w) => w.statDefId) },
        },
        select: { statDefId: true, trainedValue: true },
      })

      const byFrozen = statScoreFrom(frozen.statWeights, stats)
      const byFresh = statScoreFrom(fresh.statWeights, stats)

      assert.ok(
        Math.abs(entry.statScore! - byFrozen) < 1e-9,
        `entry ${entry.id} scored ${entry.statScore} rather than the frozen ${byFrozen}`
      )
      assert.ok(
        Math.abs(byFresh - byFrozen) > 1e-9,
        "the two divisors have to give different answers, or this entry proves nothing"
      )
    }
  } finally {
    await first.$disconnect()
    await second.$disconnect()
  }
})

test("an entry committed while the resolver waits is still judged", { skip }, async () => {
  // The resolver used to read the competition and its entries *before* claiming
  // the row. An entry holding that row with its own insert uncommitted would
  // then let the resolver take an empty field, queue behind the lock, and carry
  // on with the list it took before the wait - closing the competition around
  // an accepted entry that had no result and never would.
  const { enterCompetitionTx, runCompetitionTx, RESOLUTION_TX } = await import(
    "../../engine/src/index.ts"
  )

  const entering = client()
  const resolving = client()

  try {
    let entered: () => void
    const hasEntered = new Promise<void>((resolve) => { entered = resolve })
    let release: () => void
    const released = new Promise<void>((resolve) => { release = resolve })

    const entry = entering.$transaction(
      async (tx) => {
        const result = await enterCompetitionTx(tx, {
          animalId: fixture.entrants[1].animalId,
          competitionId: fixture.resolverCompetitionId,
          playerAccountId: fixture.playerAccountId,
        })
        entered!()
        await released
        return result
      },
      { timeout: 40_000 }
    )

    await hasEntered

    // The entry exists, uncommitted, and holds the competition's row. From
    // anywhere else the field still looks empty.
    assert.equal(
      await db.competitionEntry.count({ where: { competitionId: fixture.resolverCompetitionId } }),
      0,
      "the entry must still be uncommitted for this test to mean anything"
    )

    const resolution = resolving.$transaction(
      (tx) => runCompetitionTx(tx, { competitionId: fixture.resolverCompetitionId }),
      RESOLUTION_TX
    )

    // Long enough for the resolver to queue behind the entry's row lock.
    await new Promise((resolve) => setTimeout(resolve, 400))

    release!()
    const { entry: accepted } = await entry
    await resolution

    const competition = await db.competition.findUniqueOrThrow({
      where: { id: fixture.resolverCompetitionId },
      select: { status: true },
    })
    assert.equal(competition.status, "COMPLETED", "the resolver must have finished the competition")

    const result = await db.competitionResult.findUnique({
      where: { entryId: accepted.id },
      select: { placement: true, score: true },
    })
    assert.ok(
      result,
      "the competition was closed around an accepted entry that was never judged"
    )
    assert.equal(result.placement, 1, "a field of one places first")
  } finally {
    await entering.$disconnect()
    await resolving.$disconnect()
  }
})

test("a discipline record is earned by competing in it, not by being assigned it", { skip }, async () => {
  const { applyTrainingActionTx, enterCompetitionTx } = await import("../../engine/src/index.ts")

  const animalId = fixture.entrants[0].animalId
  const { overall, ownBreed, ownDiscipline, both, otherBreed, otherDiscipline } = fixture.recordDefs

  // Start from nothing. The entries above seeded this discipline's records as
  // the horse entered, which is its own test; what is being watched here is
  // which definitions get written and when.
  await db.recordEntry.deleteMany({
    where: { recordDefId: { in: Object.values(fixture.recordDefs) } },
  })

  // These animals were chosen for being allowed to compete; training needs a
  // stage that allows both. Borrowed, and handed back in `after`.
  const trainable = await db.lifeStageDef.findFirstOrThrow({
    where: { gameId: fixture.gameId, canTrain: true, canCompete: true },
    orderBy: { stageIndex: "asc" },
    select: { id: true },
  })
  await db.animal.update({ where: { id: animalId }, data: { lifeStageId: trainable.id } })
  await db.animalMood.update({ where: { animalId }, data: { value: 100 } })
  await db.animalCondition.update({ where: { animalId }, data: { value: 100 } })
  await db.animalStat.update({
    where: { animalId_statDefId: { animalId, statDefId: fixture.trainStatDefId } },
    data: { trainedValue: 0 },
  })

  const innate = await db.animalStat.findUniqueOrThrow({
    where: { animalId_statDefId: { animalId, statDefId: fixture.trainStatDefId } },
    select: { innateValue: true },
  })
  assert.ok(innate.innateValue > 0, "an innate value of zero leaves nothing to train into")

  const train = async () => {
    const animal = await db.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { ageInCycles: true },
    })
    await db.animalEnergy.update({ where: { animalId }, data: { currentEnergy: 100 } })
    await db.$transaction(
      (tx) =>
        applyTrainingActionTx(tx, {
          animalId,
          trainingActionDefId: fixture.trainingActionDefId,
          intensityTierDefId: fixture.intensityTierDefId,
          performedByPlayerId: fixture.playerAccountId,
          cycleNumber: animal.ageInCycles,
        }),
      { timeout: 30_000 }
    )
  }

  const heldBy = async (): Promise<string[]> =>
    (
      await db.recordEntry.findMany({
        where: { animalId, recordDefId: { in: Object.values(fixture.recordDefs) } },
        select: { recordDefId: true },
      })
    )
      .map((r) => r.recordDefId)
      .sort()

  const valueOf = async (recordDefId: string): Promise<number | null> =>
    (
      await db.recordEntry.findFirst({
        where: { animalId, recordDefId },
        select: { value: true },
      })
    )?.value ?? null

  const trainedNow = async (): Promise<number> =>
    (
      await db.animalStat.findUniqueOrThrow({
        where: { animalId_statDefId: { animalId, statDefId: fixture.trainStatDefId } },
        select: { trainedValue: true },
      })
    ).trainedValue

  // --- it has competed in the first discipline, and in nothing else --------
  await train()

  assert.deepEqual(
    await heldBy(),
    [overall, ownBreed, ownDiscipline, both].sort(),
    "the game's record, its breed's, and those of the one discipline it has entered"
  )
  for (const def of [overall, ownBreed, ownDiscipline, both]) {
    assert.equal(await valueOf(def), await trainedNow(), "every record holds the value just trained to")
  }
  assert.equal((await heldBy()).includes(otherBreed), false, "a horse took another breed's record")

  // --- being given a discipline is not competing in it ---------------------
  await db.animal.update({
    where: { id: animalId },
    data: { secondaryDisciplineDefId: fixture.otherDisciplineDefId },
  })
  await train()

  assert.deepEqual(
    await heldBy(),
    [overall, ownBreed, ownDiscipline, both].sort(),
    "an assigned discipline is set with one click and unset with another; its record is for competitors"
  )

  // --- entering it is ------------------------------------------------------
  //
  // And the record opens at the value the horse already has, not at zero and
  // not at nothing: training is the only thing that writes a record, so a horse
  // that reached its cap before its first competition would otherwise never
  // have one. It has nothing left to train.
  const atFirstEntry = await trainedNow()
  await db.$transaction(
    (tx) =>
      enterCompetitionTx(tx, {
        animalId,
        competitionId: fixture.otherCompetitionId,
        playerAccountId: fixture.playerAccountId,
      }),
    { timeout: 30_000 }
  )

  assert.deepEqual(
    await heldBy(),
    [overall, ownBreed, ownDiscipline, both, otherDiscipline].sort(),
    "entering a discipline brings its record within reach"
  )
  assert.equal(
    await valueOf(otherDiscipline),
    atFirstEntry,
    "the record opens at where the horse already stood, not at zero"
  )

  // --- and training maintains it from there --------------------------------
  await train()
  const afterTraining = await trainedNow()
  assert.ok(afterTraining > atFirstEntry, "the session has to have gained something to record")
  assert.equal(await valueOf(otherDiscipline), afterTraining, "training keeps the record up")
  assert.equal(
    (await heldBy()).includes(otherBreed),
    false,
    "and the other breed's is still out of reach, because a breed is not a choice"
  )
})
