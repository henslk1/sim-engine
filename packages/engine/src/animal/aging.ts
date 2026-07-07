import { db } from "@sim-engine/db";

type Client = typeof db

export async function advanceAnimalAging(client: Client, animalId: string) {
  const animal = await client.animal.findUniqueOrThrow({
    where: { id: animalId },
    include: { lifeStage: true },
  })

  const [gameConfig, lifeStageDefs] = await Promise.all([
    client.gameConfig.findUniqueOrThrow({ where: { gameId: animal.gameId } }),
    client.lifeStageDef.findMany({
      where: { gameId: animal.gameId },
      orderBy: { stageIndex: "asc" },
    }),
  ])

  const newAge = animal.ageInCycles + 1

  const correctStage = lifeStageDefs.find(
    s => newAge >= s.minCycle && newAge <= s.maxCycle
  )

  if (!correctStage) {
    await client.animal.update({
      where: { id: animalId },
      data: { ageInCycles: newAge, status: "BURIED", diedAt: new Date(), causeOfDeath: "old_age" },
    })
    return
  }
}