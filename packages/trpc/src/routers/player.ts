import { TRPCError } from "@trpc/server"
import { db, ProfileFieldKey } from "@sim-engine/db"
import { router, publicProcedure, protectedProcedure } from "../trpc.js"
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
              { fieldKey: "FRIENDS", isVisible: true },
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
          seniority: { select: { tutorialCompleted: true, tutorialDriverStep: true } },
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
        include: { currencyDef: { select: { id: true, name: true, symbol: true, currencyType: true } } },
        orderBy: { currencyDef: { currencyType: "asc" } },
      })
    ),

  getStarterBreeds: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.starterBreedOption.findMany({
        where: { gameId: input.gameId, isActive: true, breed: { isUnregistered: false } },
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

  getProfile: protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const account = await db.playerAccount.findFirst({
        where: { username: input.username },
        select: {
          id: true,
          username: true,
          avatar: true,
          createdAt: true,
          profile: { select: { bio: true, bannerPath: true } },
          seniority: { select: { activeDaysPlayed: true } },
          reputation: { select: { averageRating: true, totalRatings: true } },
          profileVisibilitySettings: { select: { fieldKey: true, isVisible: true } },
          playerSubscriptions: {
            where: { expiresAt: { gt: new Date() }, pausedAt: null },
            select: { id: true },
            take: 1,
          },
          _count: {
            select: {
              animalsOwned: { where: { status: "ALIVE", NOT: { gameShopAnimal: { isAvailable: true } } } },
              animalsBred: true,
              groupMemberships: { where: { status: "ACTIVE" } },
              foundedBreeds: true,
              friendshipsAsPlayerOne: true,
              friendshipsAsPlayerTwo: true,
            },
          },
          subContainers: {
            select: { id: true, name: true, displayOrder: true },
            orderBy: { displayOrder: "asc" },
          },
          animalsOwned: {
            where: { status: "ALIVE", NOT: { gameShopAnimal: { isAvailable: true } } },
            select: {
              id: true,
              name: true,
              image: true,
              subContainerId: true,
              ageInCycles: true,
              breed: { select: { name: true, species: { select: { name: true } } } },
              lifeStage: { select: { name: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 48,
          },
          friendshipsAsPlayerOne: {
            select: {
              id: true,
              playerTwo: { select: { id: true, username: true, avatar: true } },
            },
            take: 48,
          },
          friendshipsAsPlayerTwo: {
            select: {
              id: true,
              playerOne: { select: { id: true, username: true, avatar: true } },
            },
            take: 48,
          },
          achievements: {
            where: { earnedAt: { not: null } },
            select: {
              id: true,
              earnedAt: true,
              achievementDef: { select: { id: true, name: true, description: true } },
            },
            orderBy: { earnedAt: "desc" },
            take: 24,
          },
          groupMemberships: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              group: { select: { id: true, name: true } },
              groupRole: { select: { name: true, isOwner: true } },
            },
            take: 12,
          },
          seasonRankings: {
            select: {
              id: true,
              rank: true,
              score: true,
              season: { select: { name: true } },
              category: { select: { name: true } },
            },
            orderBy: { rank: "asc" },
            take: 20,
          },
          recordEntries: {
            select: {
              id: true,
              value: true,
              setAt: true,
              recordDef: { select: { name: true } },
            },
            orderBy: { setAt: "desc" },
            take: 20,
          },
          breedingListings: {
            where: { isActive: true },
            select: {
              id: true,
              animal: { select: { id: true, name: true, image: true, breed: { select: { name: true } } } },
            },
            take: 12,
          },
          marketplaceListings: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              price: true,
              listingType: true,
              currencyDef: { select: { symbol: true, name: true } },
            },
            take: 12,
          },
          hostedClinics: {
            select: { id: true, name: true, endsAt: true },
            orderBy: { startedAt: "desc" },
            take: 12,
          },
          foundedBreeds: {
            where: { isUnregistered: false },
            select: { id: true, name: true, image: true },
          },
        },
      })
      if (!account) throw new TRPCError({ code: "NOT_FOUND" })
      return account
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      playerAccountId: z.string(),
      bio: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({
        where: { id: input.playerAccountId },
        select: { userId: true },
      })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.playerProfile.update({
        where: { playerAccountId: input.playerAccountId },
        data: { bio: input.bio },
      })
    }),

  updateVisibility: protectedProcedure
    .input(z.object({
      playerAccountId: z.string(),
      fieldKey: z.string(),
      isVisible: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({
        where: { id: input.playerAccountId },
        select: { userId: true },
      })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.profileVisibilitySetting.update({
        where: {
          playerAccountId_fieldKey: {
            playerAccountId: input.playerAccountId,
            fieldKey: input.fieldKey as ProfileFieldKey,
          },
        },
        data: { isVisible: input.isVisible },
      })
    }),

  getMyAccount: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return db.user.findUnique({
        where: { id: ctx.userId },
        select: {
          id: true,
          email: true,
          name: true,
          playerAccounts: {
            where: { gameId: input.gameId },
            select: {
              id: true,
              username: true,
              avatar: true,
              profile: { select: { bio: true, bannerPath: true } },
            },
            take: 1,
          },
        },
      })
    }),

  getNotificationSettings: protectedProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.notificationSetting.findMany({
        where: { playerAccountId: input.playerAccountId },
        include: { topicDef: { select: { id: true, name: true, topicKey: true } } },
        orderBy: { topicDef: { name: "asc" } },
      })
    }),

  updateNotificationSetting: protectedProcedure
    .input(z.object({ playerAccountId: z.string(), topicDefId: z.string(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.notificationSetting.update({
        where: { playerAccountId_topicDefId: { playerAccountId: input.playerAccountId, topicDefId: input.topicDefId } },
        data: { isEnabled: input.isEnabled },
      })
    }),

  getBlockedPlayers: protectedProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.blockedPlayer.findMany({
        where: { blockerPlayerId: input.playerAccountId },
        select: { id: true, blockedPlayerId: true, blockedPlayer: { select: { id: true, username: true, avatar: true } } },
      })
    }),

  addTestCurrency: protectedProcedure
    .input(z.object({ playerAccountId: z.string(), gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })

      const baseCurrency = await db.currencyDef.findFirst({
        where: { gameId: input.gameId, currencyType: "BASE" },
        select: { id: true },
      })
      if (!baseCurrency) throw new TRPCError({ code: "NOT_FOUND", message: "No base currency configured" })

      const AMOUNT = 1000

      await db.$transaction([
        db.playerBalance.upsert({
          where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: baseCurrency.id } },
          create: { playerAccountId: input.playerAccountId, currencyDefId: baseCurrency.id, balance: AMOUNT },
          update: { balance: { increment: AMOUNT } },
        }),
        db.transaction.create({
          data: {
            gameId: input.gameId,
            toPlayerAccountId: input.playerAccountId,
            currencyDefId: baseCurrency.id,
            amount: AMOUNT,
            txnType: "TESTING_GRANT",
          },
        }),
      ])
    }),

  getSubscription: protectedProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await db.playerAccount.findUnique({ where: { id: input.playerAccountId }, select: { userId: true } })
      if (!account || account.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" })
      return db.playerSubscription.findFirst({
        where: { playerAccountId: input.playerAccountId },
        include: { subscriptionTier: { select: { id: true, name: true, cost: true, hasGeneReveal: true, hasPlayerStore: true } } },
        orderBy: { startedAt: "desc" },
      })
    }),
})
