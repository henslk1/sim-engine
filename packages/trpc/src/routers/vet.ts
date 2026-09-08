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
                  cost: true,
                  currencyDef: { select: { id: true, symbol: true, name: true } },
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
        // diagnosedAt is included automatically (not in a nested select)
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
        const animalStatus = await tx.animal.findUnique({
          where: { id: input.animalId },
          select: { status: true },
        })
        if (!animalStatus || animalStatus.status !== "ALIVE") throw new Error("Animal is not alive")

        const [service, animal, undiagnosedRecords] = await Promise.all([
          tx.vetServiceDef.findUniqueOrThrow({
            where: { id: input.vetServiceDefId },
            include: {
              currencyDef: { select: { id: true, name: true } },
              conditions: { select: { conditionDefId: true } },
            },
          }),
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true, gameId: true },
          }),
          tx.animalHealthRecord.findMany({
            where: { animalId: input.animalId, isActive: true, diagnosedAt: null },
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

        // Scope to linked conditions if any are configured for this exam
        const linkedIds = service.conditions.map((c) => c.conditionDefId)
        const undiagnosed = linkedIds.length > 0
          ? undiagnosedRecords.filter((r) => linkedIds.includes(r.conditionDefId))
          : undiagnosedRecords
        let diagnosedCount = 0

        for (const record of undiagnosed) {
          await tx.animalHealthRecord.update({
            where: { id: record.id },
            data: { diagnosedAt: new Date(), diagnosedCycle: animal.ageInCycles },
          })
          diagnosedCount++
        }

        const visitLog = await tx.vetVisitLog.create({
          data: {
            animalId: input.animalId,
            playerAccountId: input.playerAccountId,
            vetServiceDefId: input.vetServiceDefId,
            visitCycle: animal.ageInCycles,
            notes: diagnosedCount > 0
              ? `Exam: ${diagnosedCount} condition${diagnosedCount !== 1 ? "s" : ""} diagnosed.`
              : "Exam: no undiagnosed conditions found.",
          },
        })

        return { visitLog, diagnosedCount, totalConditions: undiagnosedRecords.length }
      })
    ),

  administerTreatment: publicProcedure
    .input(z.object({ treatmentRecordId: z.string(), playerAccountId: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const treatmentAnimal = await tx.animalTreatmentRecord.findUnique({
          where: { id: input.treatmentRecordId },
          select: { animal: { select: { status: true } } },
        })
        if (!treatmentAnimal?.animal || treatmentAnimal.animal.status !== "ALIVE") {
          throw new Error("Animal is not alive")
        }

        const record = await tx.animalTreatmentRecord.findUniqueOrThrow({
          where: { id: input.treatmentRecordId },
          include: {
            treatmentDef: {
              include: {
                items: { include: { itemDef: { select: { id: true, name: true } } } },
                currencyDef: { select: { id: true, name: true } },
              },
            },
            animal: { select: { ageInCycles: true, gameId: true } },
            healthRecord: { select: { id: true } },
          },
        })

        if (!record.isActive) throw new Error("Treatment is not active")

        if (record.treatmentDef.treatmentType === "PRESCRIPTION" && record.treatmentDef.cost && record.treatmentDef.cost > 0 && record.treatmentDef.currencyDefId) {
          const balance = await tx.playerBalance.findUnique({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: record.treatmentDef.currencyDefId } },
            select: { balance: true },
          })
          if (!balance || balance.balance < record.treatmentDef.cost) {
            throw new Error(`Insufficient ${record.treatmentDef.currencyDef?.name ?? "currency"} balance`)
          }
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: record.treatmentDef.currencyDefId } },
            data: { balance: { decrement: record.treatmentDef.cost } },
          })
          await tx.transaction.create({
            data: {
              gameId: record.animal.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId: record.treatmentDef.currencyDefId,
              amount: record.treatmentDef.cost,
              txnType: "TREATMENT_FEE",
            },
          })
        }

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

        if (record.treatmentDef.treatmentType === "VET_PROCEDURE") {
          throw new Error("Procedures are booked via startTreatment")
        }

        await tx.animalTreatmentRecord.update({
          where: { id: input.treatmentRecordId },
          data: { lastAdministeredCycle: record.animal.ageInCycles },
        })

        return { success: true }
      })
    ),

  startTreatment: publicProcedure
    .input(z.object({
      animalId: z.string(),
      playerAccountId: z.string(),
      healthRecordId: z.string(),
      treatmentDefId: z.string(),
    }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const [animal, healthRecord, treatmentDef] = await Promise.all([
          tx.animal.findUniqueOrThrow({
            where: { id: input.animalId },
            select: { ageInCycles: true, status: true, gameId: true },
          }),
          tx.animalHealthRecord.findUniqueOrThrow({
            where: { id: input.healthRecordId },
            select: { isActive: true },
          }),
          tx.treatmentDef.findUniqueOrThrow({
            where: { id: input.treatmentDefId },
            include: {
              restrictionDefs: true,
              currencyDef: { select: { id: true, name: true } },
            },
          }),
        ])

        if (animal.status !== "ALIVE") throw new Error("Animal is not alive")
        if (!healthRecord.isActive) throw new Error("Condition is no longer active")

        // Close any existing non-procedure active treatment for this health record
        const activeTreatments = await tx.animalTreatmentRecord.findMany({
          where: {
            healthRecordId: input.healthRecordId,
            isActive: true,
            treatmentDef: { treatmentType: { not: "VET_PROCEDURE" } },
          },
          select: { id: true },
        })
        for (const t of activeTreatments) {
          await tx.animalTreatmentRecord.update({
            where: { id: t.id },
            data: { isActive: false, completedCycle: animal.ageInCycles, completedAt: new Date() },
          })
          await tx.activityRestriction.updateMany({
            where: { treatmentRecordId: t.id, isActive: true },
            data: { isActive: false, remainingCycles: 0 },
          })
        }

        if (treatmentDef.treatmentType !== "PRESCRIPTION" && treatmentDef.cost && treatmentDef.cost > 0 && treatmentDef.currencyDefId) {
          const balance = await tx.playerBalance.findUnique({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: treatmentDef.currencyDefId,
              },
            },
          })
          if (!balance || balance.balance < treatmentDef.cost) {
            throw new Error(`Insufficient ${treatmentDef.currencyDef?.name ?? "currency"} balance`)
          }
          await tx.playerBalance.update({
            where: {
              playerAccountId_currencyDefId: {
                playerAccountId: input.playerAccountId,
                currencyDefId: treatmentDef.currencyDefId,
              },
            },
            data: { balance: { decrement: treatmentDef.cost } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              fromPlayerAccountId: input.playerAccountId,
              currencyDefId: treatmentDef.currencyDefId,
              amount: treatmentDef.cost,
              txnType: "TREATMENT_FEE",
            },
          })
        }

        const treatmentRecord = await tx.animalTreatmentRecord.create({
          data: {
            animalId: input.animalId,
            treatmentDefId: input.treatmentDefId,
            healthRecordId: input.healthRecordId,
            startedCycle: animal.ageInCycles,
            isActive: true,
          },
        })

        for (const rd of treatmentDef.restrictionDefs) {
          const isLifelong = rd.durationCycles == null && treatmentDef.durationCycles == null
          await tx.activityRestriction.create({
            data: {
              animalId: input.animalId,
              treatmentRecordId: treatmentRecord.id,
              restrictionType: rd.restrictionType,
              maxIntensityTier: rd.maxIntensityTier ?? null,
              remainingCycles: rd.durationCycles ?? treatmentDef.durationCycles ?? 0,
              isLifelong,
              isActive: true,
            },
          })
        }

        let triggeredConditionName: string | null = null
        if (treatmentDef.treatmentType === "VET_PROCEDURE") {
          const genotypes = await tx.animalGenotype.findMany({ where: { animalId: input.animalId } })
          for (const genotype of genotypes) {
            const rule = await tx.expressionRule.findUnique({
              where: {
                locusId_alleleOneId_alleleTwoId: {
                  locusId: genotype.locusId,
                  alleleOneId: genotype.alleleOneId,
                  alleleTwoId: genotype.alleleTwoId,
                },
              },
              include: {
                ruleConditions: {
                  include: {
                    healthConditionDef: {
                      include: { conditionTriggers: { where: { triggerType: "VET_PROCEDURE" } } },
                    },
                  },
                },
              },
            })
            if (!rule?.ruleConditions.length) continue
            for (const rc of rule.ruleConditions) {
              const condDef = rc.healthConditionDef
              if (!condDef.conditionTriggers.length) continue

              const alreadyActive = await tx.animalHealthRecord.findFirst({
                where: { animalId: input.animalId, conditionDefId: condDef.id, isActive: true },
              })
              if (alreadyActive) continue

              if (condDef.flareupCooldownCycles) {
                const lastResolved = await tx.animalHealthRecord.findFirst({
                  where: { animalId: input.animalId, conditionDefId: condDef.id, isActive: false },
                  orderBy: { resolvedCycle: "desc" },
                  select: { resolvedCycle: true },
                })
                if (lastResolved?.resolvedCycle != null && animal.ageInCycles < lastResolved.resolvedCycle + condDef.flareupCooldownCycles) continue
              }

              if (condDef.suppressionItemDefId) {
                const suppItem = await tx.playerInventory.findUnique({
                  where: {
                    playerAccountId_itemDefId: {
                      playerAccountId: input.playerAccountId,
                      itemDefId: condDef.suppressionItemDefId,
                    },
                  },
                })
                if (suppItem && suppItem.quantity > 0) {
                  if (suppItem.quantity <= 1) {
                    await tx.playerInventory.delete({
                      where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: condDef.suppressionItemDefId } },
                    })
                  } else {
                    await tx.playerInventory.update({
                      where: { playerAccountId_itemDefId: { playerAccountId: input.playerAccountId, itemDefId: condDef.suppressionItemDefId } },
                      data: { quantity: { decrement: 1 } },
                    })
                  }
                  continue
                }
              }

              for (const trigger of condDef.conditionTriggers) {
                if (Math.random() < trigger.triggerChance) {
                  const fatalityRisk = condDef.procedureFatalityRisk ?? 0
                  if (fatalityRisk > 0 && Math.random() < fatalityRisk) {
                    await tx.animal.update({
                      where: { id: input.animalId },
                      data: { status: "DECEASED", diedAt: new Date(), causeOfDeath: condDef.name },
                    })
                    await tx.animalTreatmentRecord.update({
                      where: { id: treatmentRecord.id },
                      data: { isActive: false, completedCycle: animal.ageInCycles, completedAt: new Date() },
                    })
                    await tx.animalHealthRecord.update({
                      where: { id: input.healthRecordId },
                      data: { isActive: false, resolvedCycle: animal.ageInCycles, resolvedAt: new Date() },
                    })
                    return { treatmentRecordId: treatmentRecord.id, diedFromProcedure: true, conditionName: condDef.name }
                  }
                  await tx.animalHealthRecord.create({
                    data: {
                      animalId: input.animalId,
                      conditionDefId: condDef.id,
                      isActive: true,
                      diagnosedAt: new Date(),
                      diagnosedCycle: animal.ageInCycles,
                    },
                  })
                  triggeredConditionName = condDef.name
                  break
                }
              }
            }
          }

          await tx.animalTreatmentRecord.update({
            where: { id: treatmentRecord.id },
            data: { isActive: false, completedCycle: animal.ageInCycles, completedAt: new Date() },
          })
          const remaining = await tx.animalTreatmentRecord.count({
            where: { healthRecordId: input.healthRecordId, isActive: true },
          })
          if (remaining === 0) {
            await tx.animalHealthRecord.update({
              where: { id: input.healthRecordId },
              data: { isActive: false, resolvedCycle: animal.ageInCycles, resolvedAt: new Date() },
            })
          }
        }

        return { treatmentRecordId: treatmentRecord.id, triggeredCondition: triggeredConditionName ?? undefined }
      })
    ),

  euthanize: publicProcedure
    .input(z.object({ animalId: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const animal = await tx.animal.findUniqueOrThrow({
          where: { id: input.animalId },
          select: { status: true },
        })
        if (animal.status !== "ALIVE") throw new Error("Animal is not alive")
        return tx.animal.update({
          where: { id: input.animalId },
          data: { status: "DECEASED", diedAt: new Date(), causeOfDeath: "euthanasia" },
        })
      })
    ),

  listCertDefs: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.healthCertificateDef.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
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
            select: { ageInCycles: true, status: true, gameId: true },
          }),
          tx.healthCertificateDef.findUniqueOrThrow({
            where: { id: input.certDefId },
            select: { validForCycles: true, cost: true, currencyDefId: true },
          }),
        ])
        if (animal.status !== "ALIVE") throw new Error("Animal is not alive")
        if (certDef.cost > 0 && certDef.currencyDefId) {
          const balance = await tx.playerBalance.findUnique({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: certDef.currencyDefId } },
            select: { balance: true },
          })
          if (!balance || balance.balance < certDef.cost) throw new Error("Insufficient funds")
          await tx.playerBalance.update({
            where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: certDef.currencyDefId } },
            data: { balance: { decrement: certDef.cost } },
          })
          await tx.transaction.create({
            data: {
              gameId: animal.gameId,
              playerAccountId: input.playerAccountId,
              currencyDefId: certDef.currencyDefId,
              amount: -certDef.cost,
              type: "VET_SERVICE_FEE",
            },
          })
        }
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
