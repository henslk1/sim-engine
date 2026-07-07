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
    s => newAge >= s.minCycle && newAge <= s.ageCap
  )

  if (!correctStage) {
    await client.animal.update({
      where: { id: animalId },
      data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "old_age" },
    })
    return
  }

  // Death roll
  const letThreshold = animal.lifeExpectancy ?? correctStage.deathChanceStartCycle
  const rollStart = letThreshold !== null
    ? Math.min(letThreshold, correctStage.ageCap)
    : correctStage.ageCap
    
  if (correctStage.deathChancePerCycle !== null && newAge >= rollStart) {
    const cyclesPast = newAge - rollStart + 1
    const chance = Math.min(1, cyclesPast * correctStage.deathChancePerCycle)
    if (Math.random() < chance) {
      await client.animal.update({
        where: { id: animalId },
        data: { ageInCycles: newAge, status: "DECEASED", diedAt: new Date(), causeOfDeath: "natural"},
      })
      return
    }
  }

  // Survived
  await client.animal.update({
    where: { id: animalId },
    data: {
      ageInCycles: newAge,
      ...(correctStage.id !== animal.lifeStageId && { lifeStageId: correctStage.id }),
    },
  })

  // Advance gestation if pregnant
  const pregnancy = await client.pregnancy.findFirst({
    where: { animalId, isCompleted: false},
  })

  if (pregnancy) {
    const newCycles = pregnancy.currentCycles + 1
    await client.pregnancy.update({
      where: { id: pregnancy.id },
      data: {
        currentCycles: newCycles,
        ...(newCycles >= pregnancy.requiredCycles && {
          isCompleted: true,
          completedAt: new Date(),
        }),
      },
    })
  }

  // Fetch stats and health conditions
  const [energy, mood, condition, careScore, immunity, activeHealthRecords]
}