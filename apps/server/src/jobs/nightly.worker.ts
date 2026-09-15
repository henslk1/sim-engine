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

    // Only age animals that were interacted with during their current cycle.
    // Shop animals (isAvailable: true) are always excluded.
    const candidates = await db.animal.findMany({
      where: { gameId, status: "ALIVE", NOT: { gameShopAnimal: { isAvailable: true } } },
      select: { id: true, lifeStageId: true, ageInCycles: true },
    })

    const candidateIds = candidates.map(a => a.id)
    const cyclesInPlay = [...new Set(candidates.map(a => a.ageInCycles))]

    // COVER_ACCEPTED is written to the sire when a female owner accepts a stud market
    // cover — the stud owner played no part, so it must not count as an interaction.
    const interactedLogs = await db.animalDailyLog.findMany({
      where: {
        animalId: { in: candidateIds },
        cycleNumber: { in: cyclesInPlay },
        NOT: { eventType: "COVER_ACCEPTED" },
      },
      select: { animalId: true, cycleNumber: true },
      distinct: ["animalId"],
    })

    const interactedIds = new Set(
      interactedLogs
        .filter(log => candidates.find(a => a.id === log.animalId)?.ageInCycles === log.cycleNumber)
        .map(log => log.animalId)
    )

    const animals = candidates.filter(a => interactedIds.has(a.id))

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
  { connection, lockDuration: 120000 }
)

nightlyWorker.on("failed", (job, err) => console.error(`[nightly] job ${job?.id} failed:`, err))
nightlyWorker.on("error", (err) => console.error("[nightly] worker error:", err))