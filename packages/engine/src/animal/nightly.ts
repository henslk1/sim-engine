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
