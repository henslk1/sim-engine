import { applyCareAction, isDailyCareComplete, markAnimalActive } from "@sim-engine/engine"
import { db } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const animalCareRouter = router({
  performLtc: publicProcedure
    .input(z.object({
      animalId: z.string(),
      ltcRecordId: z.string(),
      playerAccountId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const [record, animal] = await Promise.all([
          tx.animalLongTermCareRecord.findUniqueOrThrow({
            where: { id: input.ltcRecordId },
            include: { longTermCareActionDef: true },
          }),
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true, gameId: true, playerAccountId: true },
          }),
        ])

        const def = record.longTermCareActionDef
        const effectivePlayer = input.playerAccountId ?? animal.playerAccountId

        // Looked up regardless so the log can name the currency it was priced in.
        const baseCurrency = await tx.currencyDef.findFirstOrThrow({
          where: { gameId: animal.gameId, currencyType: "BASE" },
          select: { id: true, symbol: true, name: true },
        })

        if (def.currencyAmount && def.currencyAmount > 0) {
          const balance = await tx.playerBalance.findUnique({
            where: { playerAccountId_currencyDefId: { playerAccountId: effectivePlayer!, currencyDefId: baseCurrency.id } },
            select: { balance: true },
          })
          if (!balance || balance.balance < def.currencyAmount) {
            throw new Error("Insufficient funds to perform this care action")
          }
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: effectivePlayer!, currencyDefId: baseCurrency.id } },
            data: { balance: { decrement: def.currencyAmount } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: effectivePlayer,
              currencyDefId: baseCurrency.id,
              amount: def.currencyAmount,
              txnType: "CARE_FEE",
            },
          })
        }

        const nextDueCycle = animal.ageInCycles + def.intervalCycles
        await tx.animalLongTermCareRecord.update({
          where: { id: input.ltcRecordId },
          data: { lastPerformedCycle: animal.ageInCycles, nextDueCycle },
        })

        // Qualifying interaction — this is what makes the nightly age the animal.
        await markAnimalActive(tx, { animalId: input.animalId, cycleNumber: animal.ageInCycles })

        await tx.animalDailyLog.create({
          data: {
            animalId: input.animalId,
            cycleNumber: animal.ageInCycles,
            eventType: "LTC_PERFORMED",
            context: {
              name: def.name,
              nextDueCycle,
              cost: def.currencyAmount ?? 0,
              currencySymbol: baseCurrency.symbol,
              currencyName: baseCurrency.name,
            },
          },
        })

        return { nextDueCycle }
      })
    }),

  perform: publicProcedure
    .input(z.object({
      animalId: z.string(),
      careActionDefId: z.string(),
      playerAccountId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const animal = await db.animal.findUniqueOrThrow({
        where: { id: input.animalId },
        select: { ageInCycles: true },
      })

      return applyCareAction(db, {
        animalId: input.animalId,
        careActionDefId: input.careActionDefId,
        performedByPlayerId: input.playerAccountId || null,
        cycleNumber: animal.ageInCycles,
      })
    }),

  /**
   * Which animals a player has started on today and not finished.
   *
   * The signal is deliberately narrow: *interacted with this cycle, care not
   * complete*. Not "has outstanding care", which is every animal in the stable
   * every morning and so tells a player nothing — it would have lit up all
   * 1,001 animals on the benchmark game before anyone had done a thing.
   *
   * Interacted means the nightly is going to age this animal tonight:
   * `AnimalCycleActivity` for its current cycle is exactly the marker
   * `selectEligibleAnimals` joins on. So an animal appears here only when it is
   * both in tonight's run and short of the care that would have stopped its
   * condition decaying — which is the moment a player can still do something
   * about it, and the thing the nightly only works out once it is too late.
   *
   * An animal nobody has touched is not pending anything. It is not being aged,
   * nothing is going to happen to it, and saying "0/4" against it is noise.
   *
   * Long-term care is reported separately and is *not* gated on interaction: a
   * vaccination going overdue is a standing fact about the animal rather than
   * something about today, and the profile's alert banner already treats it
   * that way.
   *
   * Five queries for any number of animals. Care logs and markers are fetched
   * for the cycles the animals are actually on rather than per animal, which is
   * a handful of distinct numbers for a stable of any size and keeps the
   * (animalId, cycleNumber) indexes doing the work.
   */
  pending: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ input }) => {
      const animals = await db.animal.findMany({
        where: { playerAccountId: input.playerAccountId, status: "ALIVE" },
        select: { id: true, gameId: true, ageInCycles: true },
      })

      if (animals.length === 0) {
        return { animals: [], totals: { carePending: 0, ltcDue: 0, ltcOverdue: 0 } }
      }

      const animalIds = animals.map((a) => a.id)
      const gameIds = [...new Set(animals.map((a) => a.gameId))]
      // An animal's current cycle is its age, and a stable's animals share very
      // few distinct ages — so this narrows the care log scan to a few numbers
      // rather than one query per animal.
      const cycles = [...new Set(animals.map((a) => a.ageInCycles))]

      const [careDefs, logs, markers, ltcRecords] = await Promise.all([
        db.careActionDef.groupBy({
          by: ["gameId"],
          where: { gameId: { in: gameIds } },
          _count: { _all: true },
        }),
        // Distinct per action, matching `isDailyCareComplete`: the same action
        // performed twice is one action done, not two.
        db.careLog.findMany({
          where: { animalId: { in: animalIds }, cycleNumber: { in: cycles } },
          select: { animalId: true, cycleNumber: true, careActionDefId: true },
          distinct: ["animalId", "cycleNumber", "careActionDefId"],
        }),
        // The nightly's own eligibility marker: one row per animal per cycle,
        // written by any qualifying action. Its presence for the animal's
        // *current* cycle is what "they have been played with today" means.
        db.animalCycleActivity.findMany({
          where: { animalId: { in: animalIds }, cycleNumber: { in: cycles } },
          select: { animalId: true, cycleNumber: true },
        }),
        db.animalLongTermCareRecord.findMany({
          where: { animalId: { in: animalIds } },
          select: {
            animalId: true,
            nextDueCycle: true,
            longTermCareActionDef: { select: { name: true, gracePeriodCycles: true } },
          },
        }),
      ])

      const requiredByGame = new Map(careDefs.map((row) => [row.gameId, row._count._all]))

      const doneByAnimal = new Map<string, number>()
      for (const log of logs) {
        const key = `${log.animalId}:${log.cycleNumber}`
        doneByAnimal.set(key, (doneByAnimal.get(key) ?? 0) + 1)
      }

      const interactedOn = new Set(markers.map((m) => `${m.animalId}:${m.cycleNumber}`))

      const ltcByAnimal = new Map<string, typeof ltcRecords>()
      for (const record of ltcRecords) {
        const existing = ltcByAnimal.get(record.animalId)
        if (existing) existing.push(record)
        else ltcByAnimal.set(record.animalId, [record])
      }

      const totals = { carePending: 0, ltcDue: 0, ltcOverdue: 0 }

      const rows = animals.map((animal) => {
        const cycleKey = `${animal.id}:${animal.ageInCycles}`
        const careRequired = requiredByGame.get(animal.gameId) ?? 0
        const careDone = doneByAnimal.get(cycleKey) ?? 0
        const careComplete = isDailyCareComplete(careDone, careRequired)
        const interacted = interactedOn.has(cycleKey)

        // The whole signal: started today, not finished.
        const carePending = interacted && !careComplete

        // Due and overdue are different things and the player needs both: due
        // is "this is owed now", overdue is "the grace period is gone and it is
        // already costing you". The thresholds are the ones the nightly and the
        // animal profile's alert banner already use.
        const records = ltcByAnimal.get(animal.id) ?? []
        const due = records.filter((r) => animal.ageInCycles >= r.nextDueCycle)
        const overdue = records.filter(
          (r) => animal.ageInCycles > r.nextDueCycle + r.longTermCareActionDef.gracePeriodCycles
        )

        if (carePending) totals.carePending++
        if (due.length > 0) totals.ltcDue++
        if (overdue.length > 0) totals.ltcOverdue++

        return {
          animalId: animal.id,
          careDone,
          careRequired,
          careComplete,
          interacted,
          carePending,
          ltcDue: due.length,
          ltcOverdue: overdue.length,
          // The first one, for a label that says what is owed rather than how
          // many things are.
          ltcName: (overdue[0] ?? due[0])?.longTermCareActionDef.name ?? null,
        }
      })

      return { animals: rows, totals }
    }),
})