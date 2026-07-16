import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const vetRouter = router({
  listServices: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.vetServiceDef.findMany({
        where: { gameId: input.gameId },
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
        orderBy: { name: "asc" },
      })
    ),

  animalHealth: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .query(({ input }) =>
      db.animalHealthRecord.findMany({
        where: { animalId: input.animalId, isActive: true },
        include: {
          conditionDef: {
            select: {
              id: true,
              name: true,
              conditionType: true,
              treatments: {
                select: {
                  id: true,
                  name: true,
                  treatmentType: true,
                  durationCycles: true,
                  restrictionDefs: {
                    select: { restrictionType: true, durationCycles: true, maxIntensityTier: true },
                  },
                },
              },
            },
          },
          treatmentRecords: {
            where: { isActive: true },
            select: {
              id: true,
              treatmentDef: {
                select: {
                  id: true,
                  name: true,
                  treatmentType: true,
                  items: { select: { quantity: true, itemDef: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      })
    ),

  exam: publicProcedure
    .input(z.object({
      animalId: z.string(),
      playerAccountId: z.string(),
      vetServiceDefId: z.string(),
    }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const [service, animal, healthRecords] = await Promise.all([
          tx.vetServiceDef.findUniqueOrThrow({
            where: { id: input.vetServiceDefId },
            include: { currencyDef: { select: { id: true, name: true } } },
          }),
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true, gameId: true },
          }),
          tx.animalHealthRecord.findMany({
            where: { animalId: input.animalId, isActive: true },
            include: {
              conditionDef: {
                include: {
                  treatments: { include: { restrictionDefs: true } },
                },
              },
              treatmentRecords: { where: { isActive: true } },
            },
          }),
        ])

        if (service.serviceType !== "EXAM") throw new Error("Service must be of type EXAM")

        if (service.baseCost > 0) {
          const balance = await tx.playerBalance.findUnique({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: service.currencyDefId,
              },
            },
          })
          if (!balance || balance.balance < service.baseCost) {
            throw new Error(`Insufficient ${service.currencyDef.name} balance`)
          }
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: service.currencyDefId,
              },
            },
            data: { balance: { decrement: service.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId: service.currencyDefId,
              amount: service.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        const untreated = healthRecords.filter((r) => r.treatmentRecords.length === 0)
        let treatedCount = 0

        for (const record of untreated) {
          const treatment = record.conditionDef.treatments[0]
          if (!treatment) continue

          const treatmentRecord = await tx.animalTreatmentRecord.create({
            data: {
              animalId: input.animalId,
              treatmentDefId: treatment.id,
              healthRecordId: record.id,
              startedCycle: animal.ageInCycles,
              isActive: true,
            },
          })

          for (const rd of treatment.restrictionDefs) {
            await tx.activityRestriction.create({
              data: {
                animalId: input.animalId,
                treatmentRecordId: treatmentRecord.id,
                restrictionType: rd.restrictionType,
                maxIntensityTier: rd.maxIntensityTier ?? null,
                remainingCycles: rd.durationCycles ?? 1,
                isActive: true,
              },
            })
          }
          treatedCount++
        }

        const visitLog = await tx.vetVisitLog.create({
          data: {
            animalId: input.animalId,
            playerAccountId: input.playerAccountId,
            vetServiceDefId: input.vetServiceDefId,
            visitCycle: animal.ageInCycles,
            notes: treatedCount > 0
              ? `Exam: ${treatedCount} condition${treatedCount !== 1 ? "s" : ""} treated.`
              : "Exam: no untreated conditions found.",
          },
        })

        return { visitLog, treatedCount, totalConditions: healthRecords.length }
      })
    ),

  administerTreatment: publicProcedure
    .input(z.object({ treatmentRecordId: z.string(), playerAccountId: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const record = await tx.animalTreatmentRecord.findUniqueOrThrow({
          where: { id: input.treatmentRecordId },
          include: {
            treatmentDef: {
              include: {
                items: { include: { itemDef: { select: { id: true, name: true } } } },
              },
            },
            animal: { select: { ageInCycles: true } },
            healthRecord: { select: { id: true } },
          },
        })

        if (!record.isActive) throw new Error("Treatment is not active")

        if (record.treatmentDef.treatmentType === "OTC") {
          for (const item of record.treatmentDef.items) {
            const inv = await tx.playerInventory.findUnique({
              where: {
                playerAccountId_itemDefId: {
                  playerAccountId: input.playerAccountId,
                  itemDefId: item.itemDef.id,
                },
              },
            })
            if (!inv || inv.quantity < item.quantity) {
              throw new Error(`Missing ${item.itemDef.name} in inventory`)
            }
            if (inv.quantity <= item.quantity) {
              await tx.playerInventory.delete({
                where: {
                  playerAccountId_itemDefId: {
                    playerAccountId: input.playerAccountId,
                    itemDefId: item.itemDef.id,
                  },
                },
              })
            } else {
              await tx.playerInventory.update({
                where: {
                  playerAccountId_itemDefId: {
                    playerAccountId: input.playerAccountId,
                    itemDefId: item.itemDef.id,
                  },
                },
                data: { quantity: { decrement: item.quantity } },
              })
            }
          }
        }

        await tx.animalTreatmentRecord.update({
          where: { id: input.treatmentRecordId },
          data: {
            isActive: false,
            completedCycle: record.animal.ageInCycles,
            completedAt: new Date(),
          },
        })

        const remaining = await tx.animalTreatmentRecord.count({
          where: { healthRecordId: record.healthRecord.id, isActive: true },
        })
        if (remaining === 0) {
          await tx.animalHealthRecord.update({
            where: { id: record.healthRecord.id },
            data: { isActive: false },
          })
        }

        return { success: true }
      })
    ),

  listCertDefs: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.healthCertificateDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
      })
    ),

  animalCerts: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .query(async ({ input }) => {
      const [certs, animal] = await Promise.all([
        db.healthCertificate.findMany({
          where: { animalId: input.animalId },
          include: { certDef: { select: { id: true, name: true, validForCycles: true } } },
        }),
        db.animal.findUnique({ where: { id: input.animalId }, select: { ageInCycles: true } }),
      ])
      return { certs, ageInCycles: animal?.ageInCycles ?? 0 }
    }),

  issueCert: publicProcedure
    .input(z.object({ animalId: z.string(), playerAccountId: z.string(), certDefId: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const [animal, certDef] = await Promise.all([
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true },
          }),
          tx.healthCertificateDef.findUniqueOrThrow({
            where: { id: input.certDefId },
            select: { validForCycles: true },
          }),
        ])
        return tx.healthCertificate.upsert({
          where: { animalId_certDefId: { animalId: input.animalId, certDefId: input.certDefId } },
          create: {
            animalId: input.animalId,
            certDefId: input.certDefId,
            issuedCycle: animal.ageInCycles,
            expiresAtCycle: animal.ageInCycles + certDef.validForCycles,
            isValid: true,
          },
          update: {
            issuedCycle: animal.ageInCycles,
            expiresAtCycle: animal.ageInCycles + certDef.validForCycles,
            isValid: true,
          },
        })
      })
    ),

  visit: publicProcedure
    .input(z.object({
      animalId: z.string(),
      playerAccountId: z.string(),
      vetServiceDefId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const [service, animal] = await Promise.all([
          tx.vetServiceDef.findUniqueOrThrow({
            where: { id: input.vetServiceDefId },
            include: { currencyDef: { select: { id: true, name: true } } },
          }),
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true, gameId: true },
          }),
        ])

        if (service.baseCost > 0) {
          const balance = await tx.playerBalance.findUnique({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: service.currencyDefId,
              },
            },
          })
          if (!balance || balance.balance < service.baseCost) {
            throw new Error(`Insufficient ${service.currencyDef.name} balance`)
          }
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: service.currencyDefId,
              },
            },
            data: { balance: { decrement: service.baseCost } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId: service.currencyDefId,
              amount: service.baseCost,
              txnType: "VET_SERVICE_FEE",
            },
          })
        }

        return tx.vetVisitLog.create({
          data: {
            animalId: input.animalId,
            playerAccountId: input.playerAccountId,
            vetServiceDefId: input.vetServiceDefId,
            visitCycle: animal.ageInCycles,
            notes: input.notes ?? null,
          },
        })
      })
    ),
})
