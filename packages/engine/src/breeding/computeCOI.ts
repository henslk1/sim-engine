import type { ParentData } from "./generateOffspring.js"

export function computeCOI(
  sireId: string,
  sireF: number,
  sireAncestors: ParentData["ancestors"],
  damId: string,
  damF: number,
  damAncestors: ParentData["ancestors"],
): number {
  type Entry = { depth: number; ancestor: { inbreedingCoefficient: number } }
  const sireMap = new Map<string, Entry>([
    [sireId, { depth: 0, ancestor: { inbreedingCoefficient: sireF } }],
    ...sireAncestors.map((a): [string, Entry] => [a.ancestorId, a]),
  ])
  const damMap = new Map<string, Entry>([
    [damId, { depth: 0, ancestor: { inbreedingCoefficient: damF } }],
    ...damAncestors.map((a): [string, Entry] => [a.ancestorId, a]),
  ])

  let coi = 0
  for (const [id, sireEntry] of sireMap) {
    const damEntry = damMap.get(id)
    if (damEntry !== undefined) {
      const fa = sireEntry.ancestor.inbreedingCoefficient
      coi += Math.pow(0.5, sireEntry.depth + damEntry.depth + 1) * (1 + fa)
    }
  }
  return Math.min(1, coi)
}