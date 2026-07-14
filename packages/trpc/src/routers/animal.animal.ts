import { db, Prisma } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"
import { advanceAnimalAging } from "@sim-engine/engine"

export const animalAnimalRouter = router({
  list: publicProcedure.query(() =>
    db.animal.findMany({
      where: { status: { not: "EMBRYO_STORED" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        sex: true,
        breed: { select: { name: true } },
        lifeStage: { select: { name: true } },
      },
    })
  ),

  archive: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { status: "ARCHIVED" },
        select: { id: true, status: true },
      })
    ),

  bury: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { status: "BURIED" },
        select: { id: true, status: true },
      })
    ),

  moveToSubContainer: publicProcedure
    .input(z.object({ animalId: z.string(), subContainerId: z.string().nullable() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { subContainerId: input.subContainerId },
        select: { id: true, subContainerId: true },
      })
    ),

  updateName: publicProcedure
    .input(z.object({ animalId: z.string(), name: z.string().min(1).max(100).trim() }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { name: input.name },
        select: { id: true, name: true },
      })
    ),

  updateNotes: publicProcedure
    .input(z.object({ animalId: z.string(), notes: z.string().max(5000) }))
    .mutation(({ input }) =>
      db.animal.update({
        where: { id: input.animalId },
        data: { notes: input.notes.trim() || Prisma.DbNull },
        select: { id: true, notes: true },
      })
    ),

    togglePin: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        const animal = await db.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { isPinned: true },
        })
        return db.animal.update({
          where: { id: input.animalId },
          data: { isPinned: !animal.isPinned },
          select: { id: true, isPinned: true },
        })
      }),

    advanceAge: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(({ input }) => advanceAnimalAging(db, input.animalId)),

    castrate: publicProcedure
      .input(z.object({ animalId: z.string() }))
      .mutation(async ({ input }) => {
        return db.$transaction(async (tx) => {
          const animal = await tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { gameId: true, playerAccountId: true, ageInCycles: true, isCastrated: true },
          })

          if (animal.isCastrated) throw new Error("Animal is already castrated")

          const vetService = await tx.vetServiceDef.findFirstOrThrow({
            where: { gameId: animal.gameId, serviceType: "CASTRATION" },
            select: { id: true, baseCost: true, currencyDefId: true },
          })

          if (vetService.baseCost > 0) {
            await tx.playerBalance.update({
              where: {
                playerAccountId_currencyDefId: {
                  playerAccountId: animal.playerAccountId,
                  currencyDefId: vetService.currencyDefId,
                },
              },
              data: { balance: { decrement: vetService.baseCost } },
            })
            await tx.transaction.create({
              data: {
                gameId: animal.gameId,
                fromPlayerAccountId: animal.playerAccountId,
                currencyDefId: vetService.currencyDefId,
                amount: vetService.baseCost,
                txnType: "VET_SERVICE_FEE",
              },
            })
          }

          await tx.vetVisitLog.create({
            data: {
              animalId: input.animalId,
              playerAccountId: animal.playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: animal.ageInCycles,
            },
          })

          return tx.animal.update({
            where: { id: input.animalId },
            data: { isCastrated: true },
            select: { id: true, isCastrated: true },
          })
        })
      }),
})
