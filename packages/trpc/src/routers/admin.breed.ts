import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const breedAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.breed.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        include: { species: { select: { id: true, name: true } } },
      })
    ),
  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      name: z.string().min(1),
      speciesId: z.string(),
      categoryBadge: z.enum(["BASE", "SECONDARY", "CUSTOM"]),
      image: z.string().nullish(),
      lore: z.string().nullish(),
      isUnregistered: z.boolean(),
      convergenceGenerations: z.number().int().min(1).nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, image, lore, convergenceGenerations, ...rest } = input
      const data = {
        ...rest,
        image: image ?? null,
        lore: lore ?? null,
        convergenceGenerations: convergenceGenerations ?? null,
      }
      if (id) return db.breed.update({ where: { id }, data })
      return db.breed.create({ data: { gameId, ...data } })
    }),
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.breedStatProfile.deleteMany({ where: { breedId: input.id } })
        await tx.breedConformationStandard.deleteMany({ where: { breedId: input.id } })
        return tx.breed.delete({ where: { id: input.id } })
      })
    ),

  listStatProfiles: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedStatProfile.findMany({
        where: { breedId: input.breedId },
        include: { statDef: { select: { id: true, name: true } } },
        orderBy: { statDef: { name: "asc" } },
      })
    ),
  saveStatProfile: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      statDefId: z.string(),
      weight: z.number(),
      naturalMin: z.number(),
      naturalMax: z.number(),
      baseline: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedStatProfile.update({ where: { id }, data })
      return db.breedStatProfile.create({ data: { breedId, ...data } })
    }),
  removeStatProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedStatProfile.delete({ where: { id: input.id } })),

  listConformationStandards: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedConformationStandard.findMany({
        where: { breedId: input.breedId },
        include: { locus: { select: { id: true, name: true } } },
      })
    ),
  saveConformationStandard: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      locusId: z.string(),
      idealExpressionLabel: z.string().min(1),
      weight: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedConformationStandard.update({ where: { id }, data })
      return db.breedConformationStandard.create({ data: { breedId, ...data } })
    }),
  removeConformationStandard: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedConformationStandard.delete({ where: { id: input.id } })),

  listPersonalityProfiles: publicProcedure
    .input(z.object({ breedId: z.string() }))
    .query(({ input }) =>
      db.breedPersonalityProfile.findMany({
        where: { breedId: input.breedId },
        include: { traitDef: { select: { id: true, name: true } } },
        orderBy: { traitDef: { name: "asc" } },
      })
    ),
  savePersonalityProfile: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      breedId: z.string(),
      traitDefId: z.string(),
      naturalMin: z.number(),
      naturalMax: z.number(),
      baseline: z.number(),
    }))
    .mutation(({ input }) => {
      const { id, breedId, ...data } = input
      if (id) return db.breedPersonalityProfile.update({ where: { id }, data })
      return db.breedPersonalityProfile.create({ data: { breedId, ...data } })
    }),
  removePersonalityProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.breedPersonalityProfile.delete({ where: { id: input.id } })),

  listLoci: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.locus.findMany({
        where: { gameId: input.gameId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    ),
})
