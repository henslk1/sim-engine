import type { Prisma } from "@sim-engine/db"

export function requireLifeStageAction(animal: { status: string; lifeStage: { canTrain?: boolean; canReceiveCare?: boolean; canCompete?: boolean } }, action: "canTrain" | "canReceiveCare" | "canCompete") {
  if (animal.status !== "ALIVE") throw new Error("Animal must be alive")
  if (!animal.lifeStage[action]) throw new Error("This action is not available at the animal's life stage")
}

export async function requireBreedingAllowed(tx: Pick<Prisma.TransactionClient, "activityRestriction">, animalIds: string[]) {
  const restriction = await tx.activityRestriction.findFirst({
    where: { animalId: { in: animalIds }, isActive: true, restrictionType: { in: ["BREEDING", "ALL"] } },
    select: { id: true },
  })
  if (restriction) throw new Error("Breeding is currently restricted for this animal")
}
