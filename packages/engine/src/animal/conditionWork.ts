import type { Prisma } from "@sim-engine/db"

/** One atomic claim and capped gain, shared by training and competition entry.
 * The caller's transaction rolls this back if the action later fails.
 */
export async function grantConditionWorkGain(tx: Pick<Prisma.TransactionClient, "$executeRaw">, animalId: string, cycle: number, gain: number) {
  if (gain <= 0) return
  await tx.$executeRaw`
    UPDATE "AnimalCondition"
    SET "value" = LEAST(100, "value" + ${gain}),
        "lastWorkGainCycle" = ${cycle}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "animalId" = ${animalId}
      AND ("lastWorkGainCycle" IS NULL OR "lastWorkGainCycle" < ${cycle})
  `
}
