import { test, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  buildScoringRules,
  finalScore,
  personalityMultiplierFrom,
  readEntrySnapshot,
  readScoringRules,
  snapshotEntryScore,
  statScoreFrom,
  traitMultiplier,
  SCORING_RULES_VERSION,
  type CompetitionScoringRules,
  type EntryScoreSnapshot,
} from "../src/competition/scoring.ts"
import { statRecordAppliesTo } from "../src/competition/records.ts"
import { runCompetitionTx } from "../src/competition/run.ts"

/**
 * A competition score has to be the state the animal entered on.
 *
 * It was not. Four things went into a score and three of them were read at
 * resolution, out of a world that had moved on: the animal's personality and
 * conformation, its genotype against the venue's rules, and - less obviously -
 * the discipline's weights and the divisor those stats were normalised by.
 * That last one is reached by *another player's* training, so a horse's score
 * moved because somebody else trained a different horse.
 *
 * Every test below follows the same shape, and the second half of it is the
 * part that matters: save the factors, move the world, assert the saved values
 * did not follow it, and then assert that recomputing now *would* have given a
 * different answer. Without that second assertion a frozen value and a world
 * that never actually moved look identical.
 */

const GAME = "game-1"
const OTHER_GAME = "game-2"
const DISCIPLINE = "discipline-1"
const HORSE = "horse-1"
const RIVAL = "horse-2"
const BREED = "breed-1"
const SPEED = "stat-speed"
const CALM = "trait-calm"

type RecordDefRow = {
  id: string
  statDefId: string
  gameId: string
  breedId: string | null
  disciplineDefId: string | null
}

type World = {
  statWeights: { statDefId: string; weight: number }[]
  personalityWeights: { traitDefId: string; idealMin: number; idealMax: number; bonusPercent: number }[]
  recordDefs: RecordDefRow[]
  recordEntries: { recordDefId: string; value: number }[]
  stats: { animalId: string; statDefId: string; trainedValue: number; gameId: string }[]
  personality: { animalId: string; traitDefId: string; value: number; personalityModifier: number }[]
  genotypes: { animalId: string; locusId: string; alleleOneId: string; alleleTwoId: string }[]
  expressionRules: {
    locusId: string
    alleleOneId: string
    alleleTwoId: string
    climate: Record<string, number>
    terrain: Record<string, number>
  }[]
  conformation: { animalId: string; breedId: string; score: number; isCoatDq: boolean; isTraitDq: boolean }[]
}

let world: World

beforeEach(() => {
  world = {
    statWeights: [{ statDefId: SPEED, weight: 1 }],
    personalityWeights: [],
    recordDefs: [],
    recordEntries: [],
    stats: [{ animalId: HORSE, statDefId: SPEED, trainedValue: 50, gameId: GAME }],
    personality: [],
    genotypes: [],
    expressionRules: [],
    conformation: [],
  }
})

const ruleKey = (r: { locusId: string; alleleOneId: string; alleleTwoId: string }) =>
  `${r.locusId}:${r.alleleOneId}:${r.alleleTwoId}`

/**
 * Only the queries the code under test actually makes. A double that answers
 * more than that is a second implementation to keep honest.
 */
const tx = {
  disciplineStatWeight: {
    findMany: async () => world.statWeights.map((w) => ({ ...w })),
  },
  disciplinePersonalityWeight: {
    findMany: async () => world.personalityWeights.map((w) => ({ ...w })),
  },
  recordDef: {
    // Deliberately Prisma-shaped: a key that is absent from `where` is not a
    // constraint. A double that silently narrowed on `breedId` regardless would
    // pass whether or not the lookup under test asks for the global record.
    findFirst: async ({ where }: any) =>
      world.recordDefs.find(
        (r) =>
          r.statDefId === where.statDefId &&
          r.gameId === where.gameId &&
          (!("breedId" in where) || r.breedId === where.breedId) &&
          (!("disciplineDefId" in where) || r.disciplineDefId === where.disciplineDefId)
      ) ?? null,
  },
  recordEntry: {
    findFirst: async ({ where }: any) => {
      const found = world.recordEntries
        .filter((e) => e.recordDefId === where.recordDefId)
        .sort((a, b) => b.value - a.value)
      return found[0] ?? null
    },
  },
  animalStat: {
    aggregate: async ({ where }: any) => {
      // The game scope is the point of this one: `animal: { gameId }`.
      const scoped = world.stats.filter(
        (s) => s.statDefId === where.statDefId && s.gameId === where.animal.gameId
      )
      const max = scoped.reduce((best, s) => Math.max(best, s.trainedValue), 0)
      return { _max: { trainedValue: scoped.length > 0 ? max : null } }
    },
  },
  animalPersonality: {
    findMany: async ({ where }: any) =>
      world.personality
        .filter((p) => p.animalId === where.animalId && where.traitDefId.in.includes(p.traitDefId))
        .map((p) => ({ traitDefId: p.traitDefId, value: p.value, personalityModifier: p.personalityModifier })),
  },
  animalGenotype: {
    findMany: async ({ where }: any) =>
      world.genotypes
        .filter((g) => g.animalId === where.animalId)
        .map((g) => ({ locusId: g.locusId, alleleOneId: g.alleleOneId, alleleTwoId: g.alleleTwoId })),
  },
  expressionRule: {
    // Matches `buildEnvModifiers`: every rule reacting to this climate or this
    // terrain, with only those two modifiers selected.
    findMany: async ({ select }: any) => {
      const climate = select.climateModifiers.where.climate as string
      const terrain = select.terrainModifiers.where.terrain as string
      return world.expressionRules
        .filter((r) => r.climate[climate] !== undefined || r.terrain[terrain] !== undefined)
        .map((r) => ({
          locusId: r.locusId,
          alleleOneId: r.alleleOneId,
          alleleTwoId: r.alleleTwoId,
          climateModifiers: r.climate[climate] === undefined ? [] : [{ modifier: r.climate[climate]! }],
          terrainModifiers: r.terrain[terrain] === undefined ? [] : [{ modifier: r.terrain[terrain]! }],
        }))
    },
  },
  animalConformationScore: {
    findUnique: async ({ where }: any) => {
      const { animalId, breedId } = where.animalId_breedId
      const row = world.conformation.find((c) => c.animalId === animalId && c.breedId === breedId)
      return row ? { score: row.score, isCoatDq: row.isCoatDq, isTraitDq: row.isTraitDq } : null
    },
  },
}

type Tx = Parameters<typeof buildScoringRules>[0]

async function freeze(over: Partial<Parameters<typeof buildScoringRules>[1]> = {}) {
  return buildScoringRules(tx as unknown as Tx, {
    gameId: GAME,
    disciplineDefId: DISCIPLINE,
    isConformation: false,
    climate: "TEMPERATE" as never,
    terrain: "FLAT" as never,
    ...over,
  })
}

async function snapshot(rules: CompetitionScoringRules, animalId = HORSE) {
  return snapshotEntryScore(tx as unknown as Tx, {
    animalId,
    breedId: BREED,
    rules,
    stats: world.stats
      .filter((s) => s.animalId === animalId)
      .map((s) => ({ statDefId: s.statDefId, trainedValue: s.trainedValue })),
  })
}

function recordDef(id: string, over: Partial<RecordDefRow> = {}): RecordDefRow {
  return { id, statDefId: SPEED, gameId: GAME, breedId: null, disciplineDefId: null, ...over }
}

// --------------------------------------------------------------------------
// The formula itself, with no database anywhere near it.
// --------------------------------------------------------------------------

test("a trait inside its ideal band contributes its whole bonus, and outside it tapers", () => {
  assert.equal(traitMultiplier(50, 40, 60), 1)
  assert.equal(traitMultiplier(40, 40, 60), 1, "the band is inclusive at the bottom")
  assert.equal(traitMultiplier(60, 40, 60), 1, "and at the top")
  // Half way to an ideal minimum of 40 scores (20/40)*2-1 = 0.
  assert.equal(traitMultiplier(20, 40, 60), 0)
  // All the way down is a full penalty.
  assert.equal(traitMultiplier(0, 40, 60), -1)
  // An ideal band that reaches an endpoint cannot be missed on that side.
  assert.equal(traitMultiplier(0, 0, 60), 1)
  assert.equal(traitMultiplier(100, 40, 100), 1)
})

test("a trait the animal has no row for counts as 50 rather than as zero", () => {
  const weights = [{ traitDefId: CALM, idealMin: 40, idealMax: 60, bonusPercent: 50 }]
  assert.equal(personalityMultiplierFrom(weights, []), 1.5, "50 sits inside 40-60, so the full bonus applies")
  assert.equal(
    personalityMultiplierFrom(weights, [{ traitDefId: CALM, value: 0, personalityModifier: 0 }]),
    0.5,
    "an animal that really is at 0 is penalised, which is what makes the default a choice"
  )
})

test("a personality modifier moves the trait but cannot push it out of 0-100", () => {
  const weights = [{ traitDefId: CALM, idealMin: 95, idealMax: 100, bonusPercent: 100 }]
  const multiplier = personalityMultiplierFrom(weights, [
    { traitDefId: CALM, value: 80, personalityModifier: 999 },
  ])
  assert.equal(multiplier, 2, "clamped to 100, which is inside the band")
})

test("conformation and stat competitions take different bases from the same snapshot", () => {
  const snap: EntryScoreSnapshot = {
    statScore: 2,
    personalityMultiplier: 1.5,
    conformationScore: 80,
    environmentModifier: 10,
  }
  assert.equal(finalScore(snap, false), 2 * 100 * 1.5 * 1.1)
  assert.equal(finalScore(snap, true), 80 * 1.5 * 1.1)
})

test("a score cannot go negative, however punishing the factors are", () => {
  const snap: EntryScoreSnapshot = {
    statScore: 1,
    personalityMultiplier: -3,
    conformationScore: null,
    environmentModifier: 0,
  }
  assert.equal(finalScore(snap, false), 0)
})

// --------------------------------------------------------------------------
// Reading a stored rule set back, all the way down.
// --------------------------------------------------------------------------

test("a competition with no frozen rules reads as null, and a broken one refuses", () => {
  assert.equal(readScoringRules(null), null, "a competition that predates the snapshot")
  assert.equal(readScoringRules(undefined), null)

  assert.throws(
    () => readScoringRules({ version: SCORING_RULES_VERSION + 1 }),
    /version/,
    "a set this build cannot read must not be silently ignored - ignoring it means scoring live again"
  )
  assert.throws(() => readScoringRules([1, 2, 3]), /not an object/)
  assert.throws(() => readScoringRules({ version: SCORING_RULES_VERSION }), /missing required fields/)
})

test("a stat weight missing its divisor is refused rather than scoring NaN", async () => {
  const good = await freeze()

  assert.ok(
    Number.isNaN(
      statScoreFrom(
        [{ statDefId: SPEED, weight: 1, worldMax: undefined as unknown as number }],
        [{ statDefId: SPEED, trainedValue: 50 }]
      )
    ),
    "this is what reaches the scorer if nobody checks - and NaN sorts as neither above nor below anything, so a whole field places in whatever order it was read in"
  )

  assert.throws(
    () => readScoringRules({ ...good, statWeights: [{ statDefId: SPEED, weight: 1 }] }),
    /unusable stat weight at index 0/
  )
  assert.throws(
    () => readScoringRules({ ...good, statWeights: [{ statDefId: SPEED, weight: 1, worldMax: 0 }] }),
    /unusable stat weight at index 0/,
    "a zero divisor is Infinity, which is no better than NaN"
  )
  assert.throws(
    () => readScoringRules({ ...good, statWeights: [{ statDefId: 7, weight: 1, worldMax: 10 }] }),
    /unusable stat weight at index 0/
  )
})

test("an unusable personality band or environment modifier is refused too", async () => {
  const good = await freeze()

  assert.throws(
    () =>
      readScoringRules({
        ...good,
        personalityWeights: [{ traitDefId: CALM, idealMin: 0, idealMax: 100 }],
      }),
    /unusable personality weight at index 0/
  )
  assert.throws(
    () => readScoringRules({ ...good, envModifiers: { "a:b:c": "twelve" } }),
    /unusable environment modifier for a:b:c/
  )
  assert.throws(
    () => readScoringRules({ ...good, envModifiers: null }),
    /no environment modifier map/,
    "a version 1 rule set, which had no map at all"
  )
})

test("a well-formed rule set survives the round trip", async () => {
  world.genotypes.push({ animalId: HORSE, locusId: "coat", alleleOneId: "a", alleleTwoId: "a" })
  world.expressionRules.push({
    locusId: "coat",
    alleleOneId: "a",
    alleleTwoId: "a",
    climate: { TEMPERATE: 12 },
    terrain: {},
  })
  world.personalityWeights.push({ traitDefId: CALM, idealMin: 40, idealMax: 60, bonusPercent: 50 })

  const rules = await freeze()
  assert.deepEqual(readScoringRules(JSON.parse(JSON.stringify(rules))), rules)
})

// --------------------------------------------------------------------------
// Which record normalisation uses.
// --------------------------------------------------------------------------

test("normalisation uses the game's global record, not a breed or discipline one", async () => {
  // Ordered so a lookup without the narrowing constraints finds the breed
  // record first, which is exactly what used to happen.
  world.recordDefs.push(
    recordDef("record-breed", { breedId: BREED }),
    recordDef("record-discipline", { disciplineDefId: DISCIPLINE }),
    recordDef("record-global")
  )
  world.recordEntries.push(
    { recordDefId: "record-breed", value: 10 },
    { recordDefId: "record-discipline", value: 1000 },
    { recordDefId: "record-global", value: 100 }
  )

  const rules = await freeze()
  assert.equal(rules.statWeights[0]?.worldMax, 100, "not the breed's 10, and not the discipline's 1000")
  assert.equal((await snapshot(rules)).statScore, 0.5)
})

test("a game with only breed and discipline records falls back to its own best trained value", async () => {
  world.recordDefs.push(recordDef("record-breed", { breedId: BREED }))
  world.recordEntries.push({ recordDefId: "record-breed", value: 10 })

  const rules = await freeze()
  assert.equal(rules.statWeights[0]?.worldMax, 50, "the live maximum in this game, not a record that is not ours")
})

test("the fallback divisor does not reach into another game", async () => {
  world.stats.push({ animalId: "outsider", statDefId: SPEED, trainedValue: 500, gameId: OTHER_GAME })

  const rules = await freeze()
  assert.equal(rules.statWeights[0]?.worldMax, 50, "another game's training is not this game's yardstick")
  assert.equal((await snapshot(rules)).statScore, 1)

  // The same animal, moved into this game, is what the divisor is for.
  world.stats.find((s) => s.animalId === "outsider")!.gameId = GAME
  assert.equal((await freeze()).statWeights[0]?.worldMax, 500)
})

test("an empty game still produces a usable divisor", async () => {
  world.stats = []
  const rules = await freeze()
  assert.equal(rules.statWeights[0]?.worldMax, 1, "never zero, because it is a divisor")
})

// `disciplineDefIds` is what the animal has *competed in*. Which disciplines
// those are is a database question, answered in the integration suite; what is
// settled here is what the predicate does with the answer.

test("a global record applies to every animal in the game", () => {
  const anyone = { breedId: BREED, disciplineDefIds: [DISCIPLINE] }
  assert.equal(statRecordAppliesTo({ breedId: null, disciplineDefId: null }, anyone), true)
  assert.equal(
    statRecordAppliesTo({ breedId: null, disciplineDefId: null }, { breedId: null, disciplineDefIds: [] }),
    true,
    "an animal with no breed and that has never competed still has a game-wide best"
  )
})

test("a breed record belongs to that breed, a discipline record to one it has competed in", () => {
  const arab = { breedId: BREED, disciplineDefIds: [DISCIPLINE] }
  assert.equal(statRecordAppliesTo({ breedId: BREED, disciplineDefId: null }, arab), true)
  assert.equal(statRecordAppliesTo({ breedId: "breed-2", disciplineDefId: null }, arab), false)
  assert.equal(statRecordAppliesTo({ breedId: null, disciplineDefId: DISCIPLINE }, arab), true)
  assert.equal(statRecordAppliesTo({ breedId: null, disciplineDefId: "discipline-2" }, arab), false)
})

test("a record narrowed on both needs both", () => {
  const both = { breedId: BREED, disciplineDefId: DISCIPLINE }
  assert.equal(statRecordAppliesTo(both, { breedId: BREED, disciplineDefIds: [DISCIPLINE] }), true)
  assert.equal(statRecordAppliesTo(both, { breedId: BREED, disciplineDefIds: ["discipline-2"] }), false)
  assert.equal(statRecordAppliesTo(both, { breedId: "breed-2", disciplineDefIds: [DISCIPLINE] }), false)

  // Several disciplines is the ordinary case - a horse competes in more than
  // one over a career - and any one of them is enough for its own record.
  assert.equal(
    statRecordAppliesTo({ breedId: null, disciplineDefId: "discipline-2" }, {
      breedId: BREED,
      disciplineDefIds: [DISCIPLINE, "discipline-2"],
    }),
    true
  )
})

test("a horse that has never competed holds no discipline record", () => {
  // Including one it has been assigned and never entered. A discipline is set
  // with a click and unset with another; the record is for competitors.
  const untried = { breedId: BREED, disciplineDefIds: [] }
  assert.equal(statRecordAppliesTo({ breedId: null, disciplineDefId: DISCIPLINE }, untried), false)
  assert.equal(statRecordAppliesTo({ breedId: BREED, disciplineDefId: DISCIPLINE }, untried), false)
  assert.equal(
    statRecordAppliesTo({ breedId: BREED, disciplineDefId: null }, untried),
    true,
    "its breed's record is not a thing it has to earn"
  )
})

// --------------------------------------------------------------------------
// What freezing protects against. Each of these moves the world after the
// snapshot and checks both that the saved value held and that it would not
// have.
// --------------------------------------------------------------------------

test("another player training a different horse cannot move an entered score", async () => {
  world.stats.push({ animalId: RIVAL, statDefId: SPEED, trainedValue: 50, gameId: GAME })

  const rules = await freeze()
  const saved = await snapshot(rules)
  assert.equal(saved.statScore, 1, "50 against a world maximum of 50")

  // The rival trains to four times the field. Nothing about the entered horse
  // changed; the number it is divided by did.
  world.stats.find((s) => s.animalId === RIVAL)!.trainedValue = 200

  assert.equal((await snapshot(rules)).statScore, 1, "the frozen divisor is still 50")

  const rebuilt = await freeze()
  assert.equal(rebuilt.statWeights[0]?.worldMax, 200)
  assert.equal(
    (await snapshot(rebuilt)).statScore,
    0.25,
    "proving the divisor really did move - without this the test passes on a world that never changed"
  )
})

test("an admin reweighting the discipline cannot move an entered score", async () => {
  const rules = await freeze()
  assert.equal((await snapshot(rules)).statScore, 1)

  world.statWeights[0]!.weight = 10

  assert.equal((await snapshot(rules)).statScore, 1, "the frozen weight is still 1")
  assert.equal((await snapshot(await freeze())).statScore, 10, "the live weight really did change")
})

test("an admin moving a personality band cannot move an entered multiplier", async () => {
  world.personalityWeights.push({ traitDefId: CALM, idealMin: 40, idealMax: 60, bonusPercent: 50 })
  world.personality.push({ animalId: HORSE, traitDefId: CALM, value: 50, personalityModifier: 0 })

  const rules = await freeze()
  assert.equal((await snapshot(rules)).personalityMultiplier, 1.5)

  world.personalityWeights[0]!.idealMin = 90
  world.personalityWeights[0]!.idealMax = 100

  assert.equal((await snapshot(rules)).personalityMultiplier, 1.5)
  const live = (await snapshot(await freeze())).personalityMultiplier
  assert.ok(live < 1.2, `the live band really did move (multiplier is now ${live})`)
})

test("bonding a horse after it has entered cannot move its entered multiplier", async () => {
  world.personalityWeights.push({ traitDefId: CALM, idealMin: 40, idealMax: 60, bonusPercent: 50 })
  world.personality.push({ animalId: HORSE, traitDefId: CALM, value: 50, personalityModifier: 0 })

  const rules = await freeze()
  const saved = await snapshot(rules)

  // Bonding and stage activities both move `personalityModifier`.
  world.personality[0]!.personalityModifier = 50

  assert.equal(
    (await snapshot(rules)).personalityMultiplier,
    0.5,
    "clamped to 100, which is as far outside 40-60 as it gets"
  )
  assert.equal(saved.personalityMultiplier, 1.5, "but the saved one is what the entry is scored on")
})

test("the environment modifier adds climate and terrain across every locus", async () => {
  world.genotypes.push(
    { animalId: HORSE, locusId: "coat", alleleOneId: "a", alleleTwoId: "a" },
    { animalId: HORSE, locusId: "build", alleleOneId: "b", alleleTwoId: "b" }
  )
  world.expressionRules.push(
    { locusId: "coat", alleleOneId: "a", alleleTwoId: "a", climate: { TEMPERATE: 12, HOT: -4 }, terrain: {} },
    { locusId: "build", alleleOneId: "b", alleleTwoId: "b", climate: {}, terrain: { FLAT: 5, MOUNTAIN: -9 } }
  )

  const rules = await freeze()
  assert.equal((await snapshot(rules)).environmentModifier, 17, "12 for the climate and 5 for the terrain")

  const elsewhere = await freeze({ climate: "HOT" as never, terrain: "MOUNTAIN" as never })
  assert.equal((await snapshot(elsewhere)).environmentModifier, -13, "the same horse, somewhere it dislikes")
})

test("the frozen environment map holds only what this venue reacts to", async () => {
  world.expressionRules.push(
    { locusId: "coat", alleleOneId: "a", alleleTwoId: "a", climate: { TEMPERATE: 12 }, terrain: {} },
    // Reacts, but to somewhere else entirely.
    { locusId: "mane", alleleOneId: "m", alleleTwoId: "m", climate: { HOT: 9 }, terrain: { MOUNTAIN: 3 } },
    // Reacts here, but the two halves cancel, which is the same as not reacting.
    { locusId: "build", alleleOneId: "b", alleleTwoId: "b", climate: { TEMPERATE: 6 }, terrain: { FLAT: -6 } }
  )

  const rules = await freeze()
  assert.deepEqual(rules.envModifiers, { "coat:a:a": 12 })
})

test("an admin editing an expression rule cannot change the environment mid-competition", async () => {
  // Two horses with the same genotype, entering the same competition either
  // side of an admin edit.
  world.genotypes.push(
    { animalId: HORSE, locusId: "coat", alleleOneId: "a", alleleTwoId: "a" },
    { animalId: RIVAL, locusId: "coat", alleleOneId: "a", alleleTwoId: "a" }
  )
  world.expressionRules.push({
    locusId: "coat",
    alleleOneId: "a",
    alleleTwoId: "a",
    climate: { TEMPERATE: 12 },
    terrain: {},
  })

  const rules = await freeze()
  assert.equal((await snapshot(rules, HORSE)).environmentModifier, 12)

  world.expressionRules[0]!.climate["TEMPERATE"] = -30

  assert.equal(
    (await snapshot(rules, RIVAL)).environmentModifier,
    12,
    "the second horse enters the same competition, so it meets the same environment"
  )
  assert.equal(
    (await snapshot(await freeze(), RIVAL)).environmentModifier,
    -30,
    "a competition that freezes its rules after the edit does get the new number"
  )
})

test("a disqualification is saved as the zero it scores, not as an absence", async () => {
  world.conformation.push({ animalId: HORSE, breedId: BREED, score: 90, isCoatDq: true, isTraitDq: false })

  const rules = await freeze({ isConformation: true })
  const saved = await snapshot(rules)

  assert.equal(saved.conformationScore, 0, "collapsed here, where the flags still exist to collapse")
  assert.notEqual(saved.conformationScore, null, "and saved as a number, so resolution knows it is real")
  assert.equal(saved.statScore, null, "a conformation show does not score on stats")
})

test("an uninspected animal and a disqualified one both score zero, but neither reads as missing", async () => {
  const rules = await freeze({ isConformation: true })
  const saved = await snapshot(rules)
  assert.equal(saved.conformationScore, 0)
  assert.notEqual(saved.conformationScore, null)
})

test("burial cannot empty an entry that was already accepted", async () => {
  world.personalityWeights.push({ traitDefId: CALM, idealMin: 40, idealMax: 60, bonusPercent: 50 })
  world.personality.push({ animalId: HORSE, traitDefId: CALM, value: 50, personalityModifier: 0 })
  world.conformation.push({ animalId: HORSE, breedId: BREED, score: 80, isCoatDq: false, isTraitDq: false })
  world.genotypes.push({ animalId: HORSE, locusId: "coat", alleleOneId: "a", alleleTwoId: "a" })
  world.expressionRules.push({
    locusId: "coat",
    alleleOneId: "a",
    alleleTwoId: "a",
    climate: { TEMPERATE: 10 },
    terrain: {},
  })

  const rules = await freeze({ isConformation: true })
  const saved = await snapshot(rules)
  assert.equal(finalScore(saved, true), 80 * 1.5 * 1.1)

  // `pruneAnimalData` deletes all three of these and keeps the entry.
  world.personality = []
  world.conformation = []
  world.genotypes = []

  assert.equal(finalScore(saved, true), 80 * 1.5 * 1.1, "the saved factors do not know the animal is gone")

  const afterBurial = await snapshot(rules)
  assert.equal(afterBurial.conformationScore, 0, "recomputing after burial is how a placing horse scored nothing")
  assert.equal(afterBurial.environmentModifier, 0)
})

// --------------------------------------------------------------------------
// Reading an entry's saved factors back.
// --------------------------------------------------------------------------

const scoredEntry = {
  id: "entry-1",
  scoredAt: new Date("2026-11-03T03:00:00Z"),
  statScore: 1,
  personalityMultiplier: 1,
  conformationScore: null,
  environmentModifier: 0,
}

test("an entry with no scoredAt reads as absent rather than as zeroes", () => {
  assert.equal(readEntrySnapshot({ ...scoredEntry, scoredAt: null }, false), null)
})

test("a scored entry missing an applicable factor refuses, naming what is missing", () => {
  assert.throws(
    () => readEntrySnapshot({ ...scoredEntry, personalityMultiplier: null }, false),
    /entry-1 .* missing personalityMultiplier/
  )
  assert.throws(
    () => readEntrySnapshot({ ...scoredEntry, environmentModifier: null }, false),
    /missing environmentModifier/
  )
  assert.throws(() => readEntrySnapshot({ ...scoredEntry, statScore: null }, false), /missing statScore/)
  assert.throws(
    () => readEntrySnapshot({ ...scoredEntry, statScore: null, conformationScore: null }, true),
    /missing conformationScore/
  )
})

test("every legitimate zero reads back as a zero", () => {
  assert.deepEqual(
    readEntrySnapshot(
      { ...scoredEntry, statScore: 0, personalityMultiplier: 0, environmentModifier: 0 },
      false
    ),
    { statScore: 0, personalityMultiplier: 0, conformationScore: null, environmentModifier: 0 }
  )
  assert.deepEqual(
    readEntrySnapshot(
      { ...scoredEntry, statScore: null, conformationScore: 0, personalityMultiplier: 0, environmentModifier: 0 },
      true
    ),
    { statScore: null, personalityMultiplier: 0, conformationScore: 0, environmentModifier: 0 }
  )
})

// --------------------------------------------------------------------------
// Resolution. Does it actually read what was saved?
// --------------------------------------------------------------------------

type ResolutionEntry = {
  id: string
  animalId: string
  scoredAt: Date | null
  statScore: number | null
  personalityMultiplier: number | null
  conformationScore: number | null
  environmentModifier: number | null
  entryStats: { statDefId: string; trainedValue: number }[]
  animal: {
    breedId: string
    personality: { traitDefId: string; value: number; personalityModifier: number }[]
    conformationScores: { score: number; breedId: string; isCoatDq: boolean; isTraitDq: boolean }[]
  }
}

function resolutionEntry(over: Partial<ResolutionEntry> = {}): ResolutionEntry {
  return {
    id: "entry-1",
    animalId: HORSE,
    scoredAt: new Date("2026-11-03T03:00:00Z"),
    statScore: null,
    personalityMultiplier: 1,
    conformationScore: null,
    environmentModifier: 0,
    entryStats: [],
    animal: { breedId: BREED, personality: [], conformationScores: [] },
    ...over,
  }
}

/**
 * Resolve one competition and hand back the scores it wrote.
 *
 * The entries carry live personality, conformation and stats that disagree
 * with everything saved on them. Resolution no longer fetches any of it, and
 * the disagreement is what would show if it started again.
 */
async function resolve(input: {
  entries: ResolutionEntry[]
  rules: CompetitionScoringRules | null
}): Promise<number[]> {
  const written: number[] = []
  const tierDef = { id: "tier-1", advancementThreshold: 0, entryFee: 0, tierPrizes: [] }

  const competition = {
    id: "competition-1",
    gameId: GAME,
    disciplineDefId: DISCIPLINE,
    status: "OPEN",
    isInvitational: false,
    scoringRules: input.rules,
    venue: { climate: "TEMPERATE", terrain: "FLAT", group: null },
    // Only the name, which is all resolution selects. Whether this is a
    // conformation competition is the frozen rules' answer now, not the
    // discipline's current one.
    disciplineDef: { name: "Racing" },
    entries: input.entries.map((e) => ({ ...e, tierDefId: tierDef.id, tierDef, playerAccountId: "player-1" })),
  }

  const resolutionTx = {
    ...tx,
    competition: {
      findUniqueOrThrow: async () => competition,
      updateMany: async () => ({ count: 1 }),
      update: async () => competition,
    },
    competitionResult: {
      create: async ({ data }: any) => {
        written.push(data.score as number)
        return data
      },
      aggregate: async () => ({ _sum: { score: 0 } }),
      count: async () => 0,
    },
    animalWeeklyPoints: { upsert: async () => ({}) },
    animalCompetitionTier: { findUnique: async () => null },
  }

  await runCompetitionTx(resolutionTx as unknown as Parameters<typeof runCompetitionTx>[0], {
    competitionId: competition.id,
  })
  return written
}

const realRandom = Math.random
afterEach(() => {
  Math.random = realRandom
})

test("resolution scores from the entry and never looks at the animal", async () => {
  Math.random = () => 0.5 // variance of exactly zero

  const rules = await freeze()
  const scores = await resolve({
    rules,
    entries: [
      resolutionEntry({
        statScore: 1,
        personalityMultiplier: 1.5,
        environmentModifier: 10,
        // Everything live says something else entirely. None of it may be read.
        entryStats: [{ statDefId: SPEED, trainedValue: 999 }],
        animal: {
          breedId: BREED,
          personality: [{ traitDefId: CALM, value: 0, personalityModifier: 0 }],
          conformationScores: [{ score: 999, breedId: BREED, isCoatDq: false, isTraitDq: false }],
        },
      }),
    ],
  })

  assert.deepEqual(scores, [1 * 100 * 1.5 * 1.1])
})

test("a saved zero is scored as a zero, not as a missing snapshot", async () => {
  Math.random = () => 0.5

  const rules = await freeze({ isConformation: true })
  const scores = await resolve({
    rules,
    entries: [
      resolutionEntry({
        conformationScore: 0, // disqualified when it entered
        personalityMultiplier: 2,
        // The row it was disqualified on now says otherwise.
        animal: {
          breedId: BREED,
          personality: [],
          conformationScores: [{ score: 90, breedId: BREED, isCoatDq: false, isTraitDq: false }],
        },
      }),
    ],
  })

  assert.deepEqual(scores, [0], "reading the live row instead would have scored this 180")
})

test("every kind of legitimate zero resolves, and only one of them scores above zero", async () => {
  Math.random = () => 0.5
  const rules = await freeze()

  const scores = await resolve({
    rules,
    entries: [
      resolutionEntry({ id: "zero-env", statScore: 1, personalityMultiplier: 1, environmentModifier: 0 }),
      resolutionEntry({ id: "zero-mult", statScore: 1, personalityMultiplier: 0, environmentModifier: 0 }),
      resolutionEntry({ id: "zero-stat", statScore: 0, personalityMultiplier: 1, environmentModifier: 0 }),
    ],
  })

  assert.deepEqual(scores, [100, 0, 0], "a zero factor is a result, not a reason to fall back to the animal")
})

test("a scored entry missing a factor stops the whole competition rather than guessing", async () => {
  Math.random = () => 0.5
  const rules = await freeze()

  await assert.rejects(
    () => resolve({ rules, entries: [resolutionEntry({ statScore: 1, personalityMultiplier: null })] }),
    /missing personalityMultiplier/,
    "the old `?? 1` would have scored this as an average horse and placed it against real ones"
  )
  await assert.rejects(
    () => resolve({ rules, entries: [resolutionEntry({ statScore: 1, environmentModifier: null })] }),
    /missing environmentModifier/
  )
})

test("an entry in a competition that kept no rules refuses to resolve", async () => {
  Math.random = () => 0.5
  await assert.rejects(
    () => resolve({ rules: null, entries: [resolutionEntry({ statScore: 1 })] }),
    /no frozen scoring rules/,
    "the two writes came apart, and there is no honest way to rank the field"
  )
})

test("an entry that was never scored stops the competition rather than being scored live", async () => {
  Math.random = () => 0.5
  const rules = await freeze()

  // Everything a live fallback would have needed is here and plausible: a
  // weighted stat on the entry, a divisor in the world, a personality to read.
  // Resolution used to score exactly this against the world as it then stood.
  await assert.rejects(
    () =>
      resolve({
        rules,
        entries: [
          resolutionEntry({
            id: "entry-unscored",
            scoredAt: null,
            statScore: null,
            personalityMultiplier: null,
            environmentModifier: null,
            entryStats: [{ statDefId: SPEED, trainedValue: 50 }],
          }),
        ],
      }),
    /entry-unscored was never scored/,
    "scoring it from the live world is the one outcome that must not happen"
  )
})

test("one unscored entry stops the whole field, not just itself", async () => {
  Math.random = () => 0.5
  const rules = await freeze()

  // Dropping the broken one and ranking the rest would be worse than failing:
  // the placements would look complete and a horse that paid its fee would be
  // missing from them.
  await assert.rejects(
    () =>
      resolve({
        rules,
        entries: [
          resolutionEntry({ id: "entry-fine", statScore: 1, personalityMultiplier: 1, environmentModifier: 0 }),
          resolutionEntry({ id: "entry-unscored", animalId: RIVAL, scoredAt: null }),
        ],
      }),
    /entry-unscored was never scored/
  )
})

test("a competition nobody entered resolves, although it froze no rules", async () => {
  Math.random = () => 0.5

  // Rules are frozen by the first entry, so an empty field legitimately has
  // none. It still has to be closed - 1,078 of them sat open at the last count.
  assert.deepEqual(await resolve({ rules: null, entries: [] }), [])
})

test("the random variation at resolution is still applied", async () => {
  const rules = await freeze()
  const entry = resolutionEntry({ statScore: 1, personalityMultiplier: 1, environmentModifier: 0 })

  Math.random = () => 1
  assert.deepEqual(await resolve({ rules, entries: [entry] }), [110], "the top of the +/-10% band")

  Math.random = () => 0
  assert.deepEqual(await resolve({ rules, entries: [entry] }), [90], "and the bottom")
})

test("a competition whose frozen rules cannot be read refuses to resolve", async () => {
  Math.random = () => 0.5
  await assert.rejects(
    () =>
      resolve({
        rules: { version: 99 } as unknown as CompetitionScoringRules,
        entries: [resolutionEntry({ statScore: 1 })],
      }),
    /version/,
    "silently scoring it live is the one outcome that must not happen"
  )
})
