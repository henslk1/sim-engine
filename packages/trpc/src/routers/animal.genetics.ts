import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const animalGeneticsRouter = router({
  testLocus: publicProcedure
    .input(z.object({ animalId: z.string(), locusId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { ageInCycles: true, gameId: true },
        })

        const locus = await tx.locus.findUniqueOrThrow({
          where: { id: input.locusId },
          select: { minTestCycle: true },
        })

        if (locus.minTestCycle !== null && animal.ageInCycles < locus.minTestCycle) {
          throw new Error(`This locus cannot be tested until cycle ${locus.minTestCycle}`)
        }

        const config = await tx.gameConfig.findUniqueOrThrow({
          where: { gameId: animal.gameId },
          select: { maxLocusTestsPerCycle: true },
        })

        const testedThisCycle = await tx.animalGenotype.count({
          where: { animalId: input.animalId, testedCycle: animal.ageInCycles },
        })

        if (testedThisCycle >= config.maxLocusTestsPerCycle) {
          throw new Error(`Test quota reached for this cycle (max ${config.maxLocusTestsPerCycle})`)
        }

        return tx.animalGenotype.update({
          where: { animalId_locusId: { animalId: input.animalId, locusId: input.locusId } },
          data: { isTestedByOwner: true, testedAt: new Date(), testedCycle: animal.ageInCycles },
        })
      })
    }),

  testPanel: publicProcedure
    .input(z.object({ animalId: z.string(), panelDefId: z.string() }))
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { ageInCycles: true, gameId: true, playerAccountId: true },
        })

        const panelDef = await tx.geneticPanelDef.findUniqueOrThrow({
          where: { id: input.panelDefId },
          select: { testCost: true, loci: { select: { locusId: true } } },
        })

        const panelLocusIds = panelDef.loci.map((l) => l.locusId)

        const untestedGenotypes = await tx.animalGenotype.findMany({
          where: {
            animalId: input.animalId,
            locusId: { in: panelLocusIds },
            isTestedByOwner: false,
          },
          select: { locusId: true },
        })

        if (untestedGenotypes.length === 0) return { tested: 0, cost: 0 }

        const totalCost = untestedGenotypes.length * panelDef.testCost

        if (totalCost > 0) {
          const vetService = await tx.vetServiceDef.findFirstOrThrow({
            where: { gameId: animal.gameId, panelDefId: input.panelDefId, serviceType: "PANEL_TEST" },
            select: { id: true, currencyDefId: true },
          })

          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: animal.playerAccountId,
                currencyDefId: vetService.currencyDefId,
              },
            },
            data: { balance: { decrement: totalCost } },
          })

          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: animal.playerAccountId,
              currencyDefId: vetService.currencyDefId,
              amount: totalCost,
              txnType: "VET_SERVICE_FEE",
            },
          })

          await tx.vetVisitLog.create({
            data: {
              animalId: input.animalId,
              playerAccountId: animal.playerAccountId,
              vetServiceDefId: vetService.id,
              visitCycle: animal.ageInCycles,
            },
          })
        }

        await tx.animalGenotype.updateMany({
          where: {
            animalId: input.animalId,
            locusId: { in: untestedGenotypes.map((g) => g.locusId) },
          },
          data: { isTestedByOwner: true, testedAt: new Date(), testedCycle: animal.ageInCycles },
        })

        return { tested: untestedGenotypes.length, cost: totalCost }
      })
    }),
})
