import { Worker } from "bullmq";
import { connection } from "./queue.js";
import { db } from "@sim-engine/db";
import { advanceAnimalAging } from "@sim-engine/engine";

export const nightlyWorker = new Worker (
  "nightly",
  async (job) => {
    const { gameId } = job.data
    
    const log = await db.nightlyUpdateLog.create({
      data: { gameId, success: false },
    })

    // Auto-bury deceased animals
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    await db.animal.updateMany({
      where: { gameId, status: "DECEASED", diedAt: { lt: cutoff } },
      data: { status: "BURIED"}
    })

    const animals = await db.animal.findMany({
      where: { gameId, status: "ALIVE" },
      select: { id: true, lifeStageId: true },
    })

    for (const animal of animals) {
      try {
        await advanceAnimalAging(db, animal.id)
      } catch (err) {
        console.error(`[nightly] failed to age animal ${animal.id}:`, err)
      }
    }

    const updated = await db.animal.findMany({
      where: { id: { in: animals.map(a => a.id) } },
      select: { id: true, status: true, lifeStageId: true },
    })

    const deaths = updated.filter(a => a.status === "DECEASED").length
    const transitions = updated.filter(a => {
      const before = animals.find(b => b.id === a.id)!
      return before.lifeStageId !== a.lifeStageId
    }).length

    // Recalculate GameInnateMax from all alive animals
    const animalStats = await db.animalStat.findMany({
      where: { animal: { gameId, status: "ALIVE" } },
      select: { animalId: true, innateValue: true },
    })

    if (animalStats.length > 0) {
      const totalsByAnimal = new Map<string, number>()
      for (const s of animalStats) {
        totalsByAnimal.set(s.animalId, (totalsByAnimal.get(s.animalId) ?? 0) + s.innateValue)
      }
      const totals = Array.from(totalsByAnimal.values())
      const maxTotalInnate = Math.max(...totals)
      const averageTotalInnate = totals.reduce((a, b) => a + b, 0) / totals.length

      await db.gameInnateMax.upsert({
        where: { gameId },
        create: { gameId, maxTotalInnate, averageTotalInnate },
        update: { maxTotalInnate, averageTotalInnate },
      })
    }

    await db.nightlyUpdateLog.update({
      where: { id: log.id },
      data: {
        completedAt: new Date(),
        success: true,
        animalsAged: animals.length,
        animalDeaths: deaths,
        lifeStageTransitions: transitions,
      },
    })

    console.log(`[nightly] gameId=${gameId} aged=${animals.length} deaths=${deaths} transitions=${transitions}`)
    
  },
  { connection }
)