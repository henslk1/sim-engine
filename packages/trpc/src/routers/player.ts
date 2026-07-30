import { db, ProfileFieldKey } from "@sim-engine/db"
import { router, publicProcedure } from "../trpc.js"
import { z } from "zod"

export const playerRouter = router({
  create: publicProcedure
    .input(z.object({ 
      gameId: z.string(), 
      username: z.string().min(3).max(30),
      starterBreedOptionId: z.string(),
      starterColorOptionId: z.string(),
      starterGender: z.string(), 
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error("Not authenticated")
      const existing = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
      })
      if (existing) throw new Error("Player account already exists")

      const [currencyDefs, topics, gameConfig] = await Promise.all([
        db.currencyDef.findMany({
          where: { gameId: input.gameId },
          select: { id: true },
        }),
        db.notificationTopicDef.findMany({
          where: { gameId: input.gameId },
          select: { id: true, isDefaultEnabled: true },
        }),
        db.gameConfig.findUnique({
          where: { gameId: input.gameId },
          select: { defaultAnimalSlots: true, defaultSubContainers: true, subContainerLabel: true },
        })
      ])

      if (!gameConfig) throw new Error("Game config not found")

      return db.$transaction(async (tx) => {
        const account = await tx.playerAccount.create({
          data: { userId: ctx.userId!, gameId: input.gameId, username: input.username },
        })
        await Promise.all([
          tx.playerBalance.createMany({
            data: currencyDefs.map((c) => ({
              playerAccountId: account.id,
              currencyDefId: c.id,
              balance: 0,
            })),
          }),
          tx.playerCapacity.create({
            data: { 
              playerAccountId: account.id, 
              animalSlotBase: gameConfig.defaultAnimalSlots, 
              subContainerBase: gameConfig.defaultSubContainers, 
              geneticStorageBase: 50, 
            },
          }),
          tx.playerProfile.create({ data: { playerAccountId: account.id } }),
          tx.playerSeniority.create({ 
            data: { 
              playerAccountId: account.id,
              starterBreedOptionId: input.starterBreedOptionId,
              starterColorOptionId: input.starterColorOptionId,
              starterGender: input.starterGender, 
            } ,
          }),
          tx.playerReputation.create({ data: { playerAccountId: account.id } }),
          tx.notificationSetting.createMany({
            data: topics.map((t) => ({
              playerAccountId: account.id,
              topicDefId: t.id,
              isEnabled: t.isDefaultEnabled,
            })),
          }),
          tx.profileVisibilitySetting.createMany({
            data: [
              { fieldKey: "BIO", isVisible: true },
              { fieldKey: "GROUPS", isVisible: true },
              { fieldKey: "ACHIEVEMENTS", isVisible: true },
              { fieldKey: "FORUM_ACTIVITY", isVisible: true },
              { fieldKey: "LEADERBOARD_PLACINGS", isVisible: true },
              { fieldKey: "MARKETPLACE_LISTINGS", isVisible: true },
              { fieldKey: "CLINICS", isVisible: false },
              { fieldKey: "PLAYER_SHOP", isVisible: false },
            ].map((entry) => ({
              playerAccountId: account.id,
              fieldKey: entry.fieldKey as ProfileFieldKey,
              isVisible: entry.isVisible,
            })),
          }),
          tx.subContainer.create({
            data: {
              playerAccountId: account.id,
              name: gameConfig.subContainerLabel!,
              displayOrder: 1
            }
          })
        ])
        return account
      })
    }),

  me: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) return null
      return db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: {
          id: true,
          username: true,
          avatar: true,
          seniority: { select: { tutorialCompleted: true } },
        },
      })
    }),

  listSubContainers: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.subContainer.findMany({
        where: { playerAccountId: input.playerAccountId },
        select: { id: true, name: true },
        orderBy: { displayOrder: "asc" },
      })
    ),

  balances: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(({ input }) =>
      db.playerBalance.findMany({
        where: { playerAccountId: input.playerAccountId },
        include: { currencyDef: { select: { id: true, name: true, symbol: true } } },
      })
    ),

  getStarterBreeds: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.starterBreedOption.findMany({
        where: { gameId: input.gameId, isActive: true },
        include: {
          breed: { select: { id: true, name: true, image: true } },
          colorOptions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { breed: { name: "asc" } },
      })
    ),
})