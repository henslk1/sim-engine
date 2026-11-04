/**
 * What a competition scores on, and when each part of it stops moving.
 *
 * A score used to be assembled entirely at resolution, out of whatever the
 * world looked like at that moment: the animal's personality and conformation
 * as they stood, its genotype crossed against the venue's expression rules,
 * the discipline's weights as the admin had them, and a divisor read from the
 * game's records. Every one of those changes after a player enters - by their
 * own actions, by another player's, or by an administrator's - and none of
 * them were the state the player entered on.
 *
 * So there are two freezes, at two different moments, and the split is the
 * whole design:
 *
 *   - **Per competition, at the first entry.** The things every entrant has to
 *     share: the stat weights, the divisors, the personality bands, the
 *     environmental reaction of every genotype at this venue, whether this is
 *     conformation, and the venue itself. A field in which two horses were
 *     measured differently is not a field.
 *
 *   - **Per entry, as it is accepted.** The animal's own contribution, worked
 *     out against those shared rules. This is the "state upon entering" the
 *     rule was always meant to be.
 *
 * Resolution then multiplies four saved numbers together and adds its
 * variance. It reads nothing about the animal, which is why burying one no
 * longer empties the field it competed in.
 */

import type { Prisma, VenueClimate, VenueTerrain } from "@sim-engine/db"
import { globalStatRecordWhere } from "./records.js"

type Tx = Prisma.TransactionClient

/**
 * Bumped when the frozen shape changes in a way an older set cannot be read
 * as. Nothing upgrades an old set in place - a competition keeps the rules it
 * froze - so a reader meeting a version it does not know refuses outright
 * rather than guessing at it.
 *
 * 2: `envModifiers`. Version 1 saved the per-entry result but left the rule
 * table itself live, so an admin editing a modifier mid-competition handed a
 * later entrant a different environment from an earlier one.
 */
export const SCORING_RULES_VERSION = 2

export type FrozenStatWeight = {
  statDefId: string
  weight: number
  /** The normalisation divisor, frozen. Never below 1. */
  worldMax: number
}

export type FrozenPersonalityWeight = {
  traitDefId: string
  idealMin: number
  idealMax: number
  bonusPercent: number
}

/** `locusId:alleleOneId:alleleTwoId` -> climate modifier + terrain modifier. */
export type FrozenEnvModifiers = Record<string, number>

export type CompetitionScoringRules = {
  version: number
  isConformation: boolean
  climate: VenueClimate
  terrain: VenueTerrain
  statWeights: FrozenStatWeight[]
  personalityWeights: FrozenPersonalityWeight[]
  envModifiers: FrozenEnvModifiers
}

/**
 * The four numbers an entry carries.
 *
 * `statScore` and `conformationScore` are null when they do not apply - a
 * conformation show scores on neither stats nor their weights, and nothing
 * else scores on conformation - which is a different statement from either of
 * them being zero.
 */
export type EntryScoreSnapshot = {
  statScore: number | null
  personalityMultiplier: number
  conformationScore: number | null
  environmentModifier: number
}

/** The key an expression rule is frozen under, and looked back up by. */
export function expressionRuleKey(rule: {
  locusId: string
  alleleOneId: string
  alleleTwoId: string
}): string {
  return `${rule.locusId}:${rule.alleleOneId}:${rule.alleleTwoId}`
}

/**
 * One trait's contribution, on a scale where 1.0 is "inside the ideal band".
 *
 * Lifted out of `run.ts` unchanged. It lives here because entry now computes
 * the multiplier and resolution only reads it, and a formula with two homes is
 * a formula with two behaviours the first time somebody edits one of them.
 */
export function traitMultiplier(value: number, idealMin: number, idealMax: number): number {
  if (value >= idealMin && value <= idealMax) return 1.0
  if (value < idealMin) {
    if (idealMin === 0) return 1.0
    return (value / idealMin) * 2 - 1
  }
  if (idealMax === 100) return 1.0
  return 1 - 2 * (value - idealMax) / (100 - idealMax)
}

/**
 * A trait the animal has no row for counts as 50 - dead centre, which lands
 * inside most ideal bands and so contributes its full bonus. That is the
 * behaviour resolution always had, kept deliberately: an animal missing a
 * personality row should not be punished for the gap.
 */
export function personalityMultiplierFrom(
  weights: readonly FrozenPersonalityWeight[],
  traits: readonly { traitDefId: string; value: number; personalityModifier: number }[]
): number {
  let multiplier = 1.0
  for (const weight of weights) {
    const trait = traits.find((t) => t.traitDefId === weight.traitDefId)
    const effectiveValue = trait
      ? Math.min(100, Math.max(0, trait.value + trait.personalityModifier))
      : 50
    multiplier += (weight.bonusPercent / 100) * traitMultiplier(effectiveValue, weight.idealMin, weight.idealMax)
  }
  return multiplier
}

/** Weighted, normalised stats. A stat the animal has no row for scores zero. */
export function statScoreFrom(
  weights: readonly FrozenStatWeight[],
  stats: readonly { statDefId: string; trainedValue: number }[]
): number {
  let score = 0
  for (const weight of weights) {
    const stat = stats.find((s) => s.statDefId === weight.statDefId)
    score += weight.weight * ((stat?.trainedValue ?? 0) / Math.max(weight.worldMax, 1))
  }
  return score
}

/** This genotype's reaction to the venue, read off the frozen rule map. */
export function environmentModifierFrom(
  envModifiers: FrozenEnvModifiers,
  genotypes: readonly { locusId: string; alleleOneId: string; alleleTwoId: string }[]
): number {
  let total = 0
  for (const genotype of genotypes) {
    total += envModifiers[expressionRuleKey(genotype)] ?? 0
  }
  return total
}

/**
 * The finished score, before resolution adds its variance.
 *
 * Conformation scores on the conformation number; everything else on stats,
 * scaled by 100 so the two land on comparable ranges. Both take the
 * personality multiplier and the environment modifier.
 */
export function finalScore(snapshot: EntryScoreSnapshot, isConformation: boolean): number {
  const base = isConformation ? (snapshot.conformationScore ?? 0) : (snapshot.statScore ?? 0) * 100
  return Math.max(0, base * snapshot.personalityMultiplier * (1 + snapshot.environmentModifier / 100))
}

/**
 * The divisor for one stat, as of now.
 *
 * The game's global record for that stat if one is configured, and otherwise
 * the best trained value in the game. Both are scoped to the game: the fallback
 * was not, and aggregated `trainedValue` across every animal on the instance,
 * so one game's training moved another game's scores.
 *
 * Never below 1, because it is a divisor and a new game has no maximum.
 */
export async function worldMaxFor(tx: Tx, gameId: string, statDefId: string): Promise<number> {
  const recordDef = await tx.recordDef.findFirst({
    where: globalStatRecordWhere(gameId, statDefId),
    select: { id: true },
  })

  if (recordDef) {
    const best = await tx.recordEntry.findFirst({
      where: { recordDefId: recordDef.id },
      orderBy: { value: "desc" },
      select: { value: true },
    })
    if (best?.value) return Math.max(best.value, 1)
  }

  const aggregate = await tx.animalStat.aggregate({
    _max: { trainedValue: true },
    where: { statDefId, animal: { gameId } },
  })
  return Math.max(aggregate._max.trainedValue ?? 1, 1)
}

/**
 * Every genotype's reaction to one venue, as the rules stand now.
 *
 * Only rules that react to *this* climate or terrain, and only those whose two
 * modifiers do not cancel to nothing: a rule worth zero here scores the same
 * as a rule that is absent, so storing it would be storing the genetics
 * configuration rather than the part of it this competition uses.
 */
export async function buildEnvModifiers(
  tx: Tx,
  climate: VenueClimate,
  terrain: VenueTerrain
): Promise<FrozenEnvModifiers> {
  const rules = await tx.expressionRule.findMany({
    where: {
      OR: [
        { climateModifiers: { some: { climate } } },
        { terrainModifiers: { some: { terrain } } },
      ],
    },
    select: {
      locusId: true,
      alleleOneId: true,
      alleleTwoId: true,
      climateModifiers: { where: { climate }, select: { modifier: true } },
      terrainModifiers: { where: { terrain }, select: { modifier: true } },
    },
  })

  const envModifiers: FrozenEnvModifiers = {}
  for (const rule of rules) {
    const total = (rule.climateModifiers[0]?.modifier ?? 0) + (rule.terrainModifiers[0]?.modifier ?? 0)
    if (total !== 0) envModifiers[expressionRuleKey(rule)] = total
  }
  return envModifiers
}

/**
 * Read the shared rules every entrant in a competition will be measured
 * against.
 *
 * Called once, when the first entry is accepted, and stored. Calling it twice
 * for one competition is the bug it exists to prevent.
 */
export async function buildScoringRules(
  tx: Tx,
  input: {
    gameId: string
    disciplineDefId: string
    isConformation: boolean
    climate: VenueClimate
    terrain: VenueTerrain
    /**
     * A divisor to use instead of the game's records, per stat.
     *
     * The tutorial's scripted competition normalises the mare against herself,
     * so her score is the same every time it is played rather than a function
     * of whatever the rest of the game has trained to. That is a different
     * divisor, not different scoring - which is the point of passing it in
     * here rather than scoring the tutorial somewhere else entirely.
     */
    worldMaxOverride?: ((statDefId: string) => number) | undefined
  }
): Promise<CompetitionScoringRules> {
  const [statWeights, personalityWeights, envModifiers] = await Promise.all([
    input.isConformation
      ? Promise.resolve([] as { statDefId: string; weight: number }[])
      : tx.disciplineStatWeight.findMany({
          where: { disciplineDefId: input.disciplineDefId },
          select: { statDefId: true, weight: true },
        }),
    tx.disciplinePersonalityWeight.findMany({
      where: { disciplineDefId: input.disciplineDefId },
      select: { traitDefId: true, idealMin: true, idealMax: true, bonusPercent: true },
    }),
    buildEnvModifiers(tx, input.climate, input.terrain),
  ])

  const frozenStatWeights: FrozenStatWeight[] = []
  for (const weight of statWeights) {
    const worldMax = input.worldMaxOverride
      ? Math.max(input.worldMaxOverride(weight.statDefId), 1)
      : await worldMaxFor(tx, input.gameId, weight.statDefId)
    frozenStatWeights.push({ statDefId: weight.statDefId, weight: weight.weight, worldMax })
  }

  return {
    version: SCORING_RULES_VERSION,
    isConformation: input.isConformation,
    climate: input.climate,
    terrain: input.terrain,
    statWeights: frozenStatWeights,
    personalityWeights,
    envModifiers,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Read a stored rule set back, and check it all the way down.
 *
 * Null in, null out - that is a competition from before any of this, and the
 * caller decides what to do about it. Anything else that cannot be read is an
 * error rather than a null, because the one thing that must not happen is a
 * malformed rule set quietly falling back to scoring the world as it stands
 * now. That is the behaviour being removed, and it would come back silently on
 * the competitions least able to afford it.
 *
 * The elements are checked and not just the arrays. A stat weight missing its
 * `worldMax` divides by undefined, and `NaN` sorts as neither greater nor less
 * than anything else - so a whole field places in whatever order it happened to
 * be read in, and nothing anywhere says so.
 */
export function readScoringRules(value: unknown): CompetitionScoringRules | null {
  if (value === null || value === undefined) return null

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Competition scoring rules are not an object")
  }

  const rules = value as Partial<CompetitionScoringRules>
  if (rules.version !== SCORING_RULES_VERSION) {
    throw new Error(
      `Competition scoring rules are version ${String(rules.version)}, and this build reads version ${SCORING_RULES_VERSION}`
    )
  }
  if (
    typeof rules.isConformation !== "boolean" ||
    typeof rules.climate !== "string" ||
    typeof rules.terrain !== "string" ||
    !Array.isArray(rules.statWeights) ||
    !Array.isArray(rules.personalityWeights)
  ) {
    throw new Error("Competition scoring rules are missing required fields")
  }

  for (const [index, weight] of rules.statWeights.entries()) {
    if (
      typeof weight?.statDefId !== "string" ||
      !isFiniteNumber(weight.weight) ||
      !isFiniteNumber(weight.worldMax) ||
      weight.worldMax <= 0
    ) {
      throw new Error(`Competition scoring rules have an unusable stat weight at index ${index}`)
    }
  }

  for (const [index, weight] of rules.personalityWeights.entries()) {
    if (
      typeof weight?.traitDefId !== "string" ||
      !isFiniteNumber(weight.idealMin) ||
      !isFiniteNumber(weight.idealMax) ||
      !isFiniteNumber(weight.bonusPercent)
    ) {
      throw new Error(`Competition scoring rules have an unusable personality weight at index ${index}`)
    }
  }

  const envModifiers = rules.envModifiers
  if (envModifiers === null || typeof envModifiers !== "object" || Array.isArray(envModifiers)) {
    throw new Error("Competition scoring rules have no environment modifier map")
  }
  for (const [key, modifier] of Object.entries(envModifiers)) {
    if (!isFiniteNumber(modifier)) {
      throw new Error(`Competition scoring rules have an unusable environment modifier for ${key}`)
    }
  }

  return rules as CompetitionScoringRules
}

/**
 * Read an entry's saved factors back, refusing anything incomplete.
 *
 * Null out means the entry was never scored. `scoredAt` is the only thing that
 * can say so, because every factor below has a legitimate zero and so none of
 * them can be read as missing. Nothing creates such an entry any more and
 * resolution refuses one, but the two states are still worth telling apart:
 * never scored and scored-then-broken are different faults.
 *
 * Once `scoredAt` is set, every applicable factor must be there. The tempting
 * `?? 1` and `?? 0` are exactly wrong: a snapshot half-written by some future
 * bug would score as though the animal had an average personality and an
 * indifferent genotype, place against horses that were scored properly, and
 * leave nothing behind to say it happened.
 */
export function readEntrySnapshot(
  entry: {
    id: string
    scoredAt: Date | null
    statScore: number | null
    personalityMultiplier: number | null
    conformationScore: number | null
    environmentModifier: number | null
  },
  isConformation: boolean
): EntryScoreSnapshot | null {
  if (entry.scoredAt === null) return null

  const missing: string[] = []
  if (!isFiniteNumber(entry.personalityMultiplier)) missing.push("personalityMultiplier")
  if (!isFiniteNumber(entry.environmentModifier)) missing.push("environmentModifier")
  if (isConformation) {
    if (!isFiniteNumber(entry.conformationScore)) missing.push("conformationScore")
  } else if (!isFiniteNumber(entry.statScore)) {
    missing.push("statScore")
  }

  if (missing.length > 0) {
    throw new Error(
      `Competition entry ${entry.id} was scored at ${entry.scoredAt.toISOString()} but is missing ${missing.join(", ")}`
    )
  }

  return {
    statScore: entry.statScore,
    personalityMultiplier: entry.personalityMultiplier as number,
    conformationScore: entry.conformationScore,
    environmentModifier: entry.environmentModifier as number,
  }
}

/** Store a rule set in a Json column. */
export function scoringRulesToJson(rules: CompetitionScoringRules): Prisma.InputJsonValue {
  return rules as unknown as Prisma.InputJsonValue
}

/**
 * This animal's climate and terrain reaction at this venue.
 *
 * Read off the competition's frozen map rather than out of the rule table, so
 * two entrants in one competition cannot be given different environments by an
 * admin editing a modifier between them. It also removes a query: only the
 * animal's own genotype rows are read.
 */
export async function environmentModifierFor(
  tx: Tx,
  animalId: string,
  envModifiers: FrozenEnvModifiers
): Promise<number> {
  if (Object.keys(envModifiers).length === 0) return 0

  const genotypes = await tx.animalGenotype.findMany({
    where: { animalId },
    select: { locusId: true, alleleOneId: true, alleleTwoId: true },
  })

  return environmentModifierFrom(envModifiers, genotypes)
}

/**
 * Work out everything this entry will be scored on.
 *
 * `stats` is passed in rather than read here because the caller has already
 * read them to write `CompetitionEntryStat`, and reading them twice in one
 * transaction invites the two copies to disagree about what the entry is.
 */
export async function snapshotEntryScore(
  tx: Tx,
  input: {
    animalId: string
    /** The animal's own breed. Conformation is judged against that breed's standard. */
    breedId: string | null
    rules: CompetitionScoringRules
    stats: readonly { statDefId: string; trainedValue: number }[]
  }
): Promise<EntryScoreSnapshot> {
  const { animalId, breedId, rules, stats } = input

  const [personality, environmentModifier] = await Promise.all([
    rules.personalityWeights.length > 0
      ? tx.animalPersonality.findMany({
          where: { animalId, traitDefId: { in: rules.personalityWeights.map((w) => w.traitDefId) } },
          select: { traitDefId: true, value: true, personalityModifier: true },
        })
      : Promise.resolve([] as { traitDefId: string; value: number; personalityModifier: number }[]),
    environmentModifierFor(tx, animalId, rules.envModifiers),
  ])

  const personalityMultiplier = personalityMultiplierFrom(rules.personalityWeights, personality)

  if (rules.isConformation) {
    // A disqualification is saved as the zero it scores, not as a flag to be
    // re-interpreted later. The flags live on a row burial deletes, so a DQ
    // that was not collapsed here would reach resolution as an ordinary
    // missing score - indistinguishable from a horse that was never inspected,
    // and scoring the same as one only by accident.
    const conformation = breedId
      ? await tx.animalConformationScore.findUnique({
          where: { animalId_breedId: { animalId, breedId } },
          select: { score: true, isCoatDq: true, isTraitDq: true },
        })
      : null

    const conformationScore =
      conformation && !conformation.isCoatDq && !conformation.isTraitDq ? conformation.score : 0

    return { statScore: null, personalityMultiplier, conformationScore, environmentModifier }
  }

  return {
    statScore: statScoreFrom(rules.statWeights, stats),
    personalityMultiplier,
    conformationScore: null,
    environmentModifier,
  }
}
