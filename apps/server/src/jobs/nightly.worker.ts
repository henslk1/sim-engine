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