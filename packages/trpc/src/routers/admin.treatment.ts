import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const treatmentAdminRouter = router({
  listByCondition: publicProcedure
    .input(z.object({ conditionDefId: z.string() }))
    .query(({ input }) =>
      db.treatmentDef.findMany({
        where: { conditionDefId: input.conditionDefId },
        orderBy: { name: "asc" },
        include: { _count: { select: { items: true, restrictionDefs: true } } },
      })
    ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      conditionDefId: z.string(),
      name: z.string().min(1),
      treatmentType: z.enum(["OTC", "PRESCRIPTION", "VET_PROCEDURE", "ACTIVITY_RESTRICTION", "PLAYER_ACTION"]),
      durationCycles: z.number().int().nullable(),
    }))
    .mutation(({ input }) => {
      const { id, conditionDefId, ...data } = input
      if (id) return db.treatmentDef.update({ where: { id }, data })
      return db.treatmentDef.create({ data: { conditionDefId, ...data } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        const treatmentRecords = await tx.animalTreatmentRecord.findMany({
          where: { treatmentDefId: input.id },
          select: { id: true },
        })
        const recordIds = treatmentRecords.map((r) => r.id)
        await tx.activityRestriction.deleteMany({ where: { treatmentRecordId: { in: recordIds } } })
        await tx.animalTreatmentRecord.deleteMany({ where: { treatmentDefId: input.id } })
        await tx.treatmentRestrictionDef.deleteMany({ where: { treatmentDefId: input.id } })
        await tx.treatmentItem.deleteMany({ where: { treatmentDefId: input.id } })
        return tx.treatmentDef.delete({ where: { id: input.id } })
      })
    ),

  listItems: publicProcedure
    .input(z.object({ treatmentDefId: z.string() }))
    .query(({ input }) =>
      db.treatmentItem.findMany({
        where: { treatmentDefId: input.treatmentDefId },
        include: { itemDef: { select: { id: true, name: true } } },
        orderBy: { itemDef: { name: "asc" } },
      })
    ),

  saveItem: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      treatmentDefId: z.string(),
      itemDefId: z.string(),
      quantity: z.number().int().min(1),
    }))
    .mutation(({ input }) => {
      const { id, treatmentDefId, ...data } = input
      if (id) return db.treatmentItem.update({ where: { id }, data })
      return db.treatmentItem.create({ data: { treatmentDefId, ...data } })
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.treatmentItem.delete({ where: { id: input.id } })),

  listRestrictions: publicProcedure
    .input(z.object({ treatmentDefId: z.string() }))
    .query(({ input }) =>
      db.treatmentRestrictionDef.findMany({
        where: { treatmentDefId: input.treatmentDefId },
        orderBy: { restrictionType: "asc" },
      })
    ),

  saveRestriction: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      treatmentDefId: z.string(),
      restrictionType: z.enum(["TRAINING", "COMPETITION", "BREEDING", "CARE_ACTION", "ALL"]),
      maxIntensityTier: z.number().int().nullable(),
      durationCycles: z.number().int().nullable(),
    }))
    .mutation(({ input }) => {
      const { id, treatmentDefId, ...data } = input
      if (id) return db.treatmentRestrictionDef.update({ where: { id }, data })
      return db.treatmentRestrictionDef.create({ data: { treatmentDefId, ...data } })
    }),

  removeRestriction: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.treatmentRestrictionDef.delete({ where: { id: input.id } })),
})
