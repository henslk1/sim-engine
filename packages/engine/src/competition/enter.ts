import { db } from "@sim-engine/db";

type Client = typeof db

export async function enterCompetition(
  client: Client,
  input: {
    animalId: string
    competitionId: string
    playerAccountId: string
  }
) {
  return client.$transaction(async (tx) => {

    const { animalId, competitionId, playerAccountId } = input

    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: competitionId },
      include: { disciplineDef: true }
    })

    if (competition.status !== "OPEN") {
      throw new Error("Competition is not open")
    }

    const tier = await tx.animalCompetitionTier.findUnique({
      where: { animalId_disciplineDefId: { animalId, disciplineDefId: competition.disciplineDefId } },
      include: { tierDef: true }
    })

    const energyUsed = tier?.tierDef.energyCost ?? 0

    const energy = await tx.animalEnergy.findUnique({ where: { animalId } })
    if (!energy) throw new Error(`No energy record for animal ${animalId}`)

    await tx.animalEnergy.update({
      where: { animalId },
      data: { currentEnergy: Math.max(energy.currentEnergy - energyUsed, 0) },
    })

    return tx.competitionEntry.create({
      data: {
        competitionId,
        animalId,
        playerAccountId,
      },
    })

  })
}