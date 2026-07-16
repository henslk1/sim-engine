import { applyCareAction } from "@sim-engine/engine"
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

        if (def.currencyAmount && def.currencyAmount > 0) {
          const baseCurrency = await tx.currencyDef.findFirstOrThrow({
            where: { gameId: animal.gameId, currencyType: "BASE" },
            select: { id: true },
          })
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: effectivePlayer, currencyDefId: baseCurrency.id } },
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

        await tx.animalDailyLog.create({
          data: {
            animalId: input.animalId,
            cycleNumber: animal.ageInCycles,
            eventType: "LTC_PERFORMED",
            context: { name: def.name, nextDueCycle },
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
})