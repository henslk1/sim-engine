import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"

export const starterBreedAdminRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.starterBreedOption.findMany({
        where: { gameId: input.gameId },
        include: {
          breed: { select: { id: true, name: true } },
          colorOptions: {
            orderBy: { name: "asc" },
            include: {
              genotypes: {
                select: { id: true, locusId: true, alleleOneId: true, alleleTwoId: true },
              },
            },
          },
          tutorialMaleTemplate: { select: { id: true, name: true } },
          tutorialFemaleTemplate: { select: { id: true, name: true } },
        },
        orderBy: { breed: { name: "asc" } },
      })
    ),

  listTemplates: publicProcedure
  .input(z.object({ gameId: z.string() }))
  .query(({ input }) =>
    db.animalTemplate.findMany({
      where: { gameId: input.gameId },
      select: {
        id: true,
        name: true,
        sex: true,
        breedName: true,
        breed: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    })
  ),

  save: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      gameId: z.string(),
      breedId: z.string(),
      isActive: z.boolean(),
      tutorialMaleTemplateId: z.string().nullish(),
      tutorialFemaleTemplateId: z.string().nullish(),
    }))
    .mutation(({ input }) => {
      const { id, gameId, tutorialMaleTemplateId, tutorialFemaleTemplateId, ...data } = input
      const fullData = {
        ...data,
        tutorialMaleTemplateId: tutorialMaleTemplateId ?? null,
        tutorialFemaleTemplateId: tutorialFemaleTemplateId ?? null,
      }
      if (id) return db.starterBreedOption.update({ where: { id }, data: fullData })
      return db.starterBreedOption.create({ data: { gameId, ...fullData } })
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.$transaction(async (tx) => {
        await tx.starterColorOption.deleteMany({ where: { starterBreedOptionId: input.id } })
        return tx.starterBreedOption.delete({ where: { id: input.id } })
      })
    ),

  listLoci: publicProcedure
    .input(z.object({ gameId: z.string(), breedId: z.string() }))
    .query(async ({ input }) => {
      const loci = await db.locus.findMany({
        where: {
          gameId: input.gameId,
          panelEntries: { none: { panelDef: { panelType: "CONFORMATION" } } },
          alleles: { some: { frequencies: { some: { breedId: input.breedId, frequency: { gt: 0 } } } } },
        },
        select: {
          id: true,
          name: true,
          alleles: {
            select: { id: true, symbol: true, frequencies: { where: { breedId: input.breedId }, select: { frequency: true } } },
            orderBy: { symbol: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })
      return loci
        .filter(l => l.alleles.filter(a => (a.frequencies[0]?.frequency ?? 0) > 0).length >= 2)
        .map(l => ({
          id: l.id,
          name: l.name,
          alleles: l.alleles
            .filter(a => (a.frequencies[0]?.frequency ?? 0) > 0)
            .map(a => ({ id: a.id, symbol: a.symbol })),
        }))
    }),

  saveColorOption: publicProcedure
    .input(z.object({
      id: z.string().optional(),
      starterBreedOptionId: z.string(),
      name: z.string().min(1),
      image: z.string().nullish(),
      isActive: z.boolean(),
    }))
    .mutation(({ input }) => {
      const { id, starterBreedOptionId, image, ...data } = input
      if (id) return db.starterColorOption.update({ where: { id }, data: { ...data, image: image ?? null } })
      return db.starterColorOption.create({ data: { starterBreedOptionId, ...data, image: image ?? null } })
    }),

  setColorGenotype: publicProcedure
    .input(z.object({
      starterColorOptionId: z.string(),
      locusId: z.string(),
      alleleOneId: z.string(),
      alleleTwoId: z.string(),
    }))
    .mutation(({ input }) =>
      db.starterColorOptionGenotype.upsert({
        where: {
          starterColorOptionId_locusId: {
            starterColorOptionId: input.starterColorOptionId,
            locusId: input.locusId,
          },
        },
        update: { alleleOneId: input.alleleOneId, alleleTwoId: input.alleleTwoId },
        create: input,
      })
    ),

  clearColorGenotype: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.starterColorOptionGenotype.delete({ where: { id: input.id } })),

  removeColorOption: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => db.starterColorOption.delete({ where: { id: input.id } })),
})