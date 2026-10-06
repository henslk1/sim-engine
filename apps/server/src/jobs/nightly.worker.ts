import { Worker } from "bullmq";
import { connection } from "./queue.js";
import { db } from "@sim-engine/db";
import {
  advanceAnimalAging,
  loadGameAgingCache,
  selectAnimalsForAging,
  summariseInnateTotals,
} from "@sim-engine/engine";

export const nightlyWorker = new Worker (
  "nightly",
  async (job) => {
    const { gameId } = job.data
    const startedAt = Date.now()

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

    // COVER_ACCEPTED is written to the sire when a female owner accepts a stud market
    // cover — the stud owner played no part, so it must not count as an interaction.
    //
    // Deliberately not `distinct` — the match is per animal against its own
    // current cycle, and keeping one arbitrary row per animal is what made
    // `selectAnimalsForAging` necessary. See the note there.
    const interactions = await db.animalDailyLog.findMany({
      where: {
        animalId: { in: candidates.map(a => a.id) },
        cycleNumber: { in: [...new Set(candidates.map(a => a.ageInCycles))] },
        NOT: { eventType: "COVER_ACCEPTED" },
      },
      select: { animalId: true, cycleNumber: true },
    })

    const animals = selectAnimalsForAging(candidates, interactions)

    if (animals.length > 0) {
      // The game's definitions — config, life stages, expression rules, illness
      // and injury pools — read once for the whole run rather than once per
      // animal. Loaded only when there is work, so an idle game stays free.
      const cache = await loadGameAgingCache(db, gameId)

      for (const animal of animals) {
        try {
          await advanceAnimalAging(db, animal.id, cache)
        } catch (err) {
          console.error(`[nightly] failed to age animal ${animal.id}:`, err)
        }
      }
    }

    const updated = await db.animal.findMany({
      where: { id: { in: animals.map(a => a.id) } },
      select: { id: true, status: true, lifeStageId: true },
    })

    const stageBefore = new Map(animals.map(a => [a.id, a.lifeStageId]))
    const deaths = updated.filter(a => a.status === "DECEASED").length
    const transitions = updated.filter(a => {
      const before = stageBefore.get(a.id)
      return before !== undefined && before !== a.lifeStageId
    }).length

    // Recalculate GameInnateMax from the living population.
    //
    // Postgres does the per-animal sum, so this returns one row per animal
    // rather than every stat row of every animal. Tutorial animals are excluded
    // — they are handed generous fixed stats and would drag the game's ceiling
    // around for everyone.
    const innateTotals = await db.animalStat.groupBy({
      by: ["animalId"],
      where: { animal: { gameId, status: "ALIVE", isTutorialAnimal: false } },
      _sum: { innateValue: true },
    })

    const innate = summariseInnateTotals(innateTotals.map(row => row._sum.innateValue ?? 0))
    if (innate) {
      await db.gameInnateMax.upsert({
        where: { gameId },
        create: { gameId, maxTotalInnate: innate.max, averageTotalInnate: innate.average },
        update: { maxTotalInnate: innate.max, averageTotalInnate: innate.average },
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

    const elapsedMs = Date.now() - startedAt
    const rate = animals.length > 0 ? (animals.length / (elapsedMs / 1000)).toFixed(1) : "0"
    console.log(`[nightly] gameId=${gameId} aged=${animals.length} deaths=${deaths} transitions=${transitions} in ${elapsedMs}ms (${rate}/s)`)

  },
  { connection, lockDuration: 120000 }
)

nightlyWorker.on("failed", (job, err) => console.error(`[nightly] job ${job?.id} failed:`, err))
nightlyWorker.on("error", (err) => console.error("[nightly] worker error:", err))
