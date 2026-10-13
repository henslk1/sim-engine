/** Display only: ancestry storage and inbreeding calculations use their own depth. */
export function pedigreeLayout(configuredDepth: number | null | undefined) {
  const depth = Number.isInteger(configuredDepth) ? Math.max(1, Math.min(6, configuredDepth!)) : 3
  const rows = 2 ** depth
  const columns = Array.from({ length: depth }, (_, i) =>
    Array.from({ length: 2 ** (i + 1) }, (_, j) => 2 ** (i + 1) + j))
  return { depth, rows, columns }
}

export function pedigreeRow(position: number, rows: number) {
  const count = 2 ** Math.floor(Math.log2(position))
  const span = rows / count
  return { start: (position - count) * span + 1, span }
}
