export type AgingCandidate = {
  id: string
  ageInCycles: number
}

export type InteractionRow = {
  animalId: string
  cycleNumber: number
}

/**
 * Which animals the nightly should age.
 *
 * An animal is due when it was interacted with during the cycle it is currently
 * on — interaction is what makes a cycle count, so an animal nobody touched
 * simply stays where it is.
 *
 * There is no shared world cycle: `cycleNumber` on a log is the age that
 * particular animal was at the time, so the match is per animal and not a
 * global "today".
 *
 * This replaces a query that asked for `distinct: ["animalId"]` and then
 * compared the one row it got back against the animal's current age. Two things
 * were wrong with that. The cycle filter listed every age in play across the
 * whole game, so a six-cycle-old animal could match its own stale five-cycle
 * log; and `distinct` without an `orderBy` keeps an arbitrary row per animal.
 * When it kept the stale one, the comparison failed and **the animal was
 * silently skipped for the night** despite having been cared for. Considering
 * every row removes the arbitrary choice, and the scan is linear in the rows
 * rather than quadratic.
 */
export function selectAnimalsForAging<T extends AgingCandidate>(
  candidates: readonly T[],
  interactions: readonly InteractionRow[]
): T[] {
  const currentCycle = new Map(candidates.map(candidate => [candidate.id, candidate.ageInCycles]))

  const due = new Set<string>()
  for (const row of interactions) {
    if (currentCycle.get(row.animalId) === row.cycleNumber) due.add(row.animalId)
  }

  return candidates.filter(candidate => due.has(candidate.id))
}

/**
 * Highest and mean total innate across a game's living population.
 *
 * Takes per-animal sums that Postgres has already grouped. Plain loops because
 * `Math.max(...totals)` spreads the array into argument positions, which throws
 * `RangeError: too many arguments` somewhere past 100,000 animals — a crash
 * that arrives on one particular night and takes the whole nightly with it.
 */
export function summariseInnateTotals(totals: readonly number[]): { max: number; average: number } | null {
  if (totals.length === 0) return null

  let max = -Infinity
  let sum = 0
  for (const total of totals) {
    if (total > max) max = total
    sum += total
  }

  return { max, average: sum / totals.length }
}
