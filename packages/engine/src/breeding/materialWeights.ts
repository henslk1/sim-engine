import type { Prisma } from "@sim-engine/db"

export async function loadMaterialInheritanceWeights(tx: Pick<Prisma.TransactionClient, "locus">, gameId: string, locusIds: string[]) {
  const ids = [...new Set(locusIds)]
  const loci = await tx.locus.findMany({ where: { gameId, id: { in: ids } }, select: { id: true, inheritanceWeight: true } })
  const weights = new Map(loci.map(locus => [locus.id, locus.inheritanceWeight]))
  if (ids.some(id => !weights.has(id))) throw new Error("A stored genotype's locus definition is missing from this game")
  return weights
}
