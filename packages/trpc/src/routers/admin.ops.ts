import { router, protectedProcedure, staffProcedure, ownerProcedure } from "../trpc.js"
import { db, Prisma } from "@sim-engine/db"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { removeAllMessagesByUser } from "../messaging/messages.js"

// ── Overview ────────────────────────────────────────────────────────────────

const overviewRouter = router({
  stats: staffProcedure
    .input(z.object({ gameId: z.string().optional() }))
    .query(async ({ input }) => {
      const { gameId } = input
      const gf = gameId ? { gameId } : {}
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000)
      const [
        openTickets,
        inProgressTickets,
        bugGameBreaking,
        bugMajor,
        bugMinor,
        exploitCount,
        pendingReports,
        activeBans,
        recentPlayers,
        recentActions,
        lastNightlyLog,
      ] = await Promise.all([
        db.supportTicket.count({ where: { ...gf, status: "OPEN" } }),
        db.supportTicket.count({ where: { ...gf, status: "IN_PROGRESS" } }),
        db.bugReport.count({ where: { ...gf, severity: "GAME_BREAKING", status: { notIn: ["RESOLVED", "CLOSED", "NOT_A_BUG"] } } }),
        db.bugReport.count({ where: { ...gf, severity: "MAJOR", status: { notIn: ["RESOLVED", "CLOSED", "NOT_A_BUG"] } } }),
        db.bugReport.count({ where: { ...gf, severity: "MINOR", status: { notIn: ["RESOLVED", "CLOSED", "NOT_A_BUG"] } } }),
        db.bugReport.count({ where: { ...gf, isExploit: true, status: { notIn: ["RESOLVED", "CLOSED", "NOT_A_BUG"] } } }),
        db.userReport.count({ where: { ...gf, status: "PENDING" } }),
        db.banRecord.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
        db.playerAccount.findMany({
          where: { ...gf, createdAt: { gte: sevenDaysAgo } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            username: true,
            createdAt: true,
            user: {
              select: {
                email: true,
                emailVerified: true,
                staffRoles: { select: { role: true, gameId: true } },
                banRecords: { orderBy: { bannedAt: "desc" }, take: 1, select: { expiresAt: true, reason: true } },
                userIpLogs: { orderBy: { seenAt: "desc" }, take: 1, select: { ipAddress: true } },
                playerAccounts: { select: { game: { select: { id: true, name: true } } } },
              },
            },
            _count: { select: { warnings: true, animalsOwned: true } },
          },
        }),
        db.adminActionLog.findMany({
          where: gf,
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { user: { select: { email: true, name: true } } },
        }),
        db.nightlyUpdateLog.findFirst({
          where: gf,
          orderBy: { startedAt: "desc" },
        }),
      ])
      return { openTickets, inProgressTickets, bugGameBreaking, bugMajor, bugMinor, exploitCount, pendingReports, activeBans, recentPlayers, recentActions, lastNightlyLog }
    }),
})

// ── Players ──────────────────────────────────────────────────────────────────

const playersOpsRouter = router({
  myRoles: protectedProcedure.query(async ({ ctx }) => {
    return db.staffRole.findMany({ where: { userId: ctx.userId } })
  }),

  list: staffProcedure
    .input(z.object({
      gameId: z.string().optional(),
      search: z.string().optional(),
      isBanned: z.boolean().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, search, isBanned, cursor, limit } = input
      const players = await db.playerAccount.findMany({
        where: {
          ...(gameId && { gameId }),
          ...(search && {
            OR: [
              { username: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }),
          ...(isBanned !== undefined && {
            user: { banRecords: isBanned ? { some: { expiresAt: { gt: new Date() } } } : { none: {} } },
          }),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              emailVerified: true,
              staffRoles: { select: { role: true, gameId: true } },
              banRecords: { orderBy: { bannedAt: "desc" }, take: 1, select: { expiresAt: true, reason: true } },
              userIpLogs: { orderBy: { seenAt: "desc" }, take: 1, select: { ipAddress: true, seenAt: true } },
              playerAccounts: { select: { game: { select: { id: true, name: true } } } },
            },
          },
          seniority: { select: { activeDaysPlayed: true, lastActiveDateAt: true, tutorialCompleted: true } },
          _count: { select: { animalsOwned: true, warnings: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = players.length > limit
      return { players: players.slice(0, limit), hasMore, nextCursor: hasMore ? players[limit - 1]!.id : undefined }
    }),

  getById: staffProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { id: input.playerAccountId },
        include: {
          user: {
            include: {
              banRecords: { orderBy: { bannedAt: "desc" } },
              staffRoles: { include: { game: { select: { name: true } } } },
              // The games this user can be made a moderator of: a moderator
              // role only means anything where they hold an account.
              playerAccounts: {
                select: { gameId: true, game: { select: { name: true } } },
                orderBy: { createdAt: "asc" },
              },
              userIpLogs: { orderBy: { seenAt: "desc" }, take: 20 },
              userDeviceLogs: { orderBy: { seenAt: "desc" }, take: 20 },
            },
          },
          seniority: true,
          playerBalances: { include: { currencyDef: true } },
          warnings: { orderBy: { createdAt: "desc" } },
          staffNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { email: true, name: true } } } },
          supportTickets: { orderBy: { createdAt: "desc" }, take: 10 },
          bugReports: { select: { id: true, title: true, category: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 },
          _count: { select: { animalsOwned: true } },
        },
      })

      const recentTransactions = await db.transaction.findMany({
        where: { gameId: player.gameId, OR: [{ fromPlayerAccountId: player.id }, { toPlayerAccountId: player.id }] },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          currencyDef: { select: { symbol: true, name: true } },
          fromPlayerAccount: { select: { username: true } },
          toPlayerAccount: { select: { username: true } },
        },
      })

      const reportsAgainst = await db.userReport.count({ where: { reportedPlayerId: player.id } })

      return { player, recentTransactions, reportsAgainst }
    }),

  grantCurrency: staffProcedure
    .input(z.object({
      playerAccountId: z.string(),
      currencyDefId: z.string(),
      amount: z.number().int(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = await db.playerAccount.findUniqueOrThrow({ where: { id: input.playerAccountId } })
      await db.$transaction([
        db.playerBalance.upsert({
          where: { playerAccountId_currencyDefId: { playerAccountId: input.playerAccountId, currencyDefId: input.currencyDefId } },
          update: { balance: { increment: input.amount } },
          create: { playerAccountId: input.playerAccountId, currencyDefId: input.currencyDefId, balance: input.amount },
        }),
        db.transaction.create({
          data: {
            gameId: player.gameId,
            toPlayerAccountId: input.amount > 0 ? input.playerAccountId : null,
            fromPlayerAccountId: input.amount < 0 ? input.playerAccountId : null,
            currencyDefId: input.currencyDefId,
            amount: Math.abs(input.amount),
            txnType: "ADMIN_ADJUSTMENT",
          },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: player.gameId,
            action: `grant_currency:${input.amount}:${input.reason}`,
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  issueWarning: staffProcedure
    .input(z.object({
      playerAccountId: z.string(),
      reason: z.string(),
      warningType: z.enum(["VERBAL", "FORMAL", "FINAL"]),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = await db.playerAccount.findUniqueOrThrow({ where: { id: input.playerAccountId } })
      await db.$transaction([
        db.playerWarning.create({
          data: {
            playerAccountId: input.playerAccountId,
            issuedByUserId: ctx.userId,
            reason: input.reason,
            warningType: input.warningType,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: player.gameId,
            action: `issue_warning:${input.warningType}:${input.reason}`,
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  ban: staffProcedure
    .input(z.object({
      userId: z.string(),
      reason: z.string(),
      expiresAt: z.string().datetime().optional(),
      gameId: z.string(),
      // Deliberately a per-incident choice rather than a consequence of the ban
      // length: a day-long ban for one bad post should not have to erase months
      // of good ones, and a permanent ban for spam usually should.
      removeMessages: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.$transaction([
        db.banRecord.create({
          data: {
            userId: input.userId,
            bannedByUserId: ctx.userId,
            reason: input.reason,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: input.gameId,
            action: `ban:${input.expiresAt ? "temp" : "permanent"}:${input.reason}`,
            targetType: "User",
            targetId: input.userId,
          },
        }),
      ])

      // After the transaction, never inside it: a rolled back ban must not have
      // kicked anyone. The periodic sweep would catch this within a minute
      // anyway, so this is the fast path rather than the guarantee.
      ctx.realtime.disconnectUser(input.userId, "banned")

      if (input.removeMessages) {
        const removed = await removeAllMessagesByUser(input.userId, ctx.realtime)
        await db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: input.gameId,
            action: `ban_removed_messages:${removed}`,
            targetType: "User",
            targetId: input.userId,
          },
        })
      }
    }),

  banIp: staffProcedure
    .input(z.object({
      ipAddress: z.string(),
      reason: z.string(),
      expiresAt: z.string().datetime().optional(),
      gameId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.$transaction([
        db.ipBan.upsert({
          where: { ipAddress: input.ipAddress },
          update: { reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
          create: { ipAddress: input.ipAddress, reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: input.gameId,
            action: `ban_ip:${input.ipAddress}:${input.reason}`,
            targetType: "IpAddress",
            targetId: input.ipAddress,
          },
        }),
      ])
    }),

  // Owners and admins are global; a moderator is appointed to one game and has
  // to name it. Splitting the input by role means a moderator without a game,
  // or an owner carrying one, cannot be expressed at all — the caller has to
  // say which it is, rather than leaving a scope to be inferred later.
  assignRole: ownerProcedure
    .input(z.discriminatedUnion("role", [
      z.object({ role: z.literal("MODERATOR"), userId: z.string(), gameId: z.string() }),
      z.object({ role: z.enum(["OWNER", "ADMIN"]), userId: z.string() }),
    ]))
    .mutation(async ({ input, ctx }) => {
      const gameId = input.role === "MODERATOR" ? input.gameId : null
      if (gameId) {
        // A moderator moderates a game they actually play. Messaging resolves
        // the acting player from user plus game, so a moderator role in a game
        // where the user has no account would authorize nothing at all.
        const account = await db.playerAccount.findUnique({
          where: { userId_gameId: { userId: input.userId, gameId } },
          select: { id: true },
        })
        if (!account) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That user has no account in this game." })
        }
      }
      await db.staffRole.create({
        data: { userId: input.userId, gameId, role: input.role },
      })
      // A socket caches its staff role at game:enter and the 60s sweep only
      // re-checks sessions and bans, so a role change would otherwise sit
      // unnoticed on an open connection. Dropping it costs the user a silent
      // reconnect, after which they re-resolve and join only the channels the
      // new role can see. Matters most in the other direction — see removeRole.
      ctx.realtime.disconnectUser(input.userId, `staff role assigned: ${input.role}`)
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId,
          action: `assign_role:${input.role}`,
          targetType: "User",
          targetId: input.userId,
        },
      })
    }),

  removeRole: ownerProcedure
    .input(z.object({
      staffRoleId: z.string(),
      gameId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const role = await db.staffRole.findUniqueOrThrow({ where: { id: input.staffRoleId } })
      await db.staffRole.delete({ where: { id: input.staffRoleId } })
      // The load-bearing one. Staff-restricted channels are gated on the role
      // resolved at game:enter, so without this a demoted moderator keeps
      // receiving #staff traffic on their existing socket until they happen to
      // reconnect. After the commit, never before: a rolled back delete must
      // not have kicked anyone.
      ctx.realtime.disconnectUser(role.userId, `staff role removed: ${role.role}`)
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: input.gameId ?? null,
          action: `remove_role:${role.role}`,
          targetType: "User",
          targetId: role.userId,
        },
      })
    }),

  bypassGates: staffProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const player = await db.playerAccount.findUniqueOrThrow({ where: { id: input.playerAccountId } })
      await db.$transaction([
        db.playerSeniority.upsert({
          where: { playerAccountId: input.playerAccountId },
          update: { gatesBypassed: true },
          create: { playerAccountId: input.playerAccountId, gatesBypassed: true },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: player.gameId,
            action: "bypass_seniority_gates",
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  resetAnimalName: staffProcedure
    .input(z.object({
      animalId: z.string(),
      newName: z.string(),
      gameId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.$transaction([
        db.animal.update({ where: { id: input.animalId }, data: { name: input.newName } }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: input.gameId,
            action: `reset_animal_name:${input.newName}`,
            targetType: "Animal",
            targetId: input.animalId,
          },
        }),
      ])
    }),

  addNote: staffProcedure
    .input(z.object({
      playerAccountId: z.string(),
      body: z.string().min(1),
    }))
    .mutation(({ input, ctx }) =>
      db.staffPlayerNote.create({
        data: { playerAccountId: input.playerAccountId, authorUserId: ctx.userId, body: input.body },
      })
    ),

  deleteNote: staffProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(({ input }) => db.staffPlayerNote.delete({ where: { id: input.noteId } })),
})

// ── Economy ───────────────────────────────────────────────────────────────────

const economyOpsRouter = router({
  stats: staffProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const currencyDefs = await db.currencyDef.findMany({
        where: { gameId: input.gameId },
        select: {
          id: true, name: true, symbol: true, currencyType: true,
          playerBalances: { select: { balance: true } },
        },
      })
      const since = new Date(Date.now() - 7 * 86400000)
      const recentTxns = await db.transaction.findMany({
        where: { gameId: input.gameId, createdAt: { gte: since } },
        select: { txnType: true, amount: true },
      })
      const volumeMap: Record<string, { count: number; total: number }> = {}
      for (const t of recentTxns) {
        if (!volumeMap[t.txnType]) volumeMap[t.txnType] = { count: 0, total: 0 }
        volumeMap[t.txnType]!.count++
        volumeMap[t.txnType]!.total += t.amount
      }
      const dailyVolume = Object.entries(volumeMap).map(([txnType, v]) => ({ txnType, count: v.count, total: v.total }))
      const circulation = currencyDefs.map(c => ({
        id: c.id, name: c.name, symbol: c.symbol, currencyType: c.currencyType,
        totalInCirculation: c.playerBalances.reduce((s, b) => s + b.balance, 0),
      }))
      return { circulation, dailyVolume }
    }),

  transactions: staffProcedure
    .input(z.object({
      gameId: z.string(),
      playerAccountId: z.string().optional(),
      txnType: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, playerAccountId, txnType, cursor, limit } = input
      const txns = await db.transaction.findMany({
        where: {
          gameId,
          ...(playerAccountId && { OR: [{ fromPlayerAccountId: playerAccountId }, { toPlayerAccountId: playerAccountId }] }),
          ...(txnType && { txnType: txnType as never }),
        },
        include: {
          currencyDef: { select: { symbol: true, name: true } },
          fromPlayerAccount: { select: { username: true } },
          toPlayerAccount: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = txns.length > limit
      return { txns: txns.slice(0, limit), hasMore, nextCursor: hasMore ? txns[limit - 1]!.id : undefined }
    }),
})

// ── Support Tickets ───────────────────────────────────────────────────────────

const supportOpsRouter = router({
  list: staffProcedure
    .input(z.object({
      gameId: z.string(),
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, status, cursor, limit } = input
      const tickets = await db.supportTicket.findMany({
        where: { gameId, ...(status && { status }) },
        include: {
          playerAccount: { select: { id: true, username: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = tickets.length > limit
      return { tickets: tickets.slice(0, limit), hasMore, nextCursor: hasMore ? tickets[limit - 1]!.id : undefined }
    }),

  getById: staffProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(({ input }) =>
      db.supportTicket.findUniqueOrThrow({
        where: { id: input.ticketId },
        include: {
          playerAccount: { select: { id: true, username: true } },
          claimedBy: { select: { id: true, name: true } },
          messages: { include: { author: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "asc" } },
        },
      })
    ),

  reply: staffProcedure
    .input(z.object({ ticketId: z.string(), body: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      db.supportTicketMessage.create({
        data: { ticketId: input.ticketId, authorId: ctx.userId, body: input.body },
      })
    ),

  setClaim: staffProcedure
    .input(z.object({
      ticketId: z.string(),
      claim: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: input.ticketId } })
      await db.supportTicket.update({
        where: { id: input.ticketId },
        data: {
          claimedByUserId: input.claim ? ctx.userId : null,
          claimedAt: input.claim ? new Date() : null,
        },
      })
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: ticket.gameId,
          action: input.claim ? "ticket_claim" : "ticket_unclaim",
          targetType: "SupportTicket",
          targetId: input.ticketId,
        },
      })
    }),

  setStatus: staffProcedure
    .input(z.object({
      ticketId: z.string(),
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: input.ticketId } })
      await db.$transaction([
        db.supportTicket.update({ where: { id: input.ticketId }, data: { status: input.status } }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: ticket.gameId,
            action: `ticket_status:${input.status}`,
            targetType: "SupportTicket",
            targetId: input.ticketId,
          },
        }),
      ])
    }),
})

// ── Bug Reports ───────────────────────────────────────────────────────────────

const bugsOpsRouter = router({
  list: staffProcedure
    .input(z.object({
      gameId: z.string(),
      status: z.enum(["OPEN", "CONFIRMED", "IN_PROGRESS", "NEEDS_MORE_INFO", "NOT_A_BUG", "RESOLVED", "CLOSED"]).optional(),
      severity: z.enum(["MINOR", "MAJOR", "GAME_BREAKING"]).optional(),
      category: z.enum(["VISUAL", "TEXT", "UI", "GAMEPLAY", "ECONOMY", "PERFORMANCE"]).optional(),
      exploitsOnly: z.boolean().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, status, severity, category, exploitsOnly, cursor, limit } = input
      const reports = await db.bugReport.findMany({
        where: {
          gameId,
          ...(status && { status }),
          ...(severity && { severity }),
          ...(category && { category }),
          ...(exploitsOnly && { isExploit: true }),
        },
        include: {
          author: { select: { id: true, username: true } },
          claimedBy: { select: { id: true, name: true } },
          _count: { select: { upvotes: true, comments: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = reports.length > limit
      return { reports: reports.slice(0, limit), hasMore, nextCursor: hasMore ? reports[limit - 1]!.id : undefined }
    }),

  getById: staffProcedure
    .input(z.object({ reportId: z.string() }))
    .query(({ input }) =>
      db.bugReport.findUniqueOrThrow({
        where: { id: input.reportId },
        include: {
          author: { select: { id: true, username: true } },
          claimedBy: { select: { id: true, name: true } },
          comments: {
            include: { author: { select: { id: true, username: true, user: { select: { staffRoles: true } } } } },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { upvotes: true } },
        },
      })
    ),

  setStatus: staffProcedure
    .input(z.object({
      reportId: z.string(),
      status: z.enum(["OPEN", "CONFIRMED", "IN_PROGRESS", "NEEDS_MORE_INFO", "NOT_A_BUG", "RESOLVED", "CLOSED"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.reportId } })
      await db.$transaction([
        db.bugReport.update({ where: { id: input.reportId }, data: { status: input.status } }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: report.gameId,
            action: `bug_status:${input.status}`,
            targetType: "BugReport",
            targetId: input.reportId,
          },
        }),
      ])
    }),

  setExploit: staffProcedure
    .input(z.object({
      reportId: z.string(),
      isExploit: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.reportId } })
      await db.$transaction([
        db.bugReport.update({ where: { id: input.reportId }, data: { isExploit: input.isExploit } }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: report.gameId,
            action: input.isExploit ? "bug_flag_exploit" : "bug_unflag_exploit",
            targetType: "BugReport",
            targetId: input.reportId,
          },
        }),
      ])
    }),

  setClaim: staffProcedure
    .input(z.object({
      reportId: z.string(),
      claim: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.reportId } })
      await db.bugReport.update({
        where: { id: input.reportId },
        data: {
          claimedByUserId: input.claim ? ctx.userId : null,
          claimedAt: input.claim ? new Date() : null,
        },
      })
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: report.gameId,
          action: input.claim ? "bug_claim" : "bug_unclaim",
          targetType: "BugReport",
          targetId: input.reportId,
        },
      })
    }),

  addComment: staffProcedure
    .input(z.object({ bugReportId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.bugReportId } })
      const player = await db.playerAccount.findFirstOrThrow({ where: { userId: ctx.userId, gameId: report.gameId } })
      return db.bugReportComment.create({
        data: { bugReportId: input.bugReportId, authorId: player.id, body: input.body },
      })
    }),

  merge: staffProcedure
    .input(z.object({
      sourceReportId: z.string(),
      targetReportId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { sourceReportId, targetReportId } = input
      if (sourceReportId === targetReportId) throw new Error("Cannot merge a report into itself")

      const source = await db.bugReport.findUniqueOrThrow({
        where: { id: sourceReportId },
        include: { author: { select: { id: true, username: true } } },
      })

      const lines = [
        `Merged report from ${source.author.username} — ${source.title}`,
        `Category: ${source.category} | Severity: ${source.severity}`,
        ``,
        `Description:\n${source.description}`,
        ``,
        `Expected Outcome:\n${source.expectedOutcome}`,
        ``,
        `Steps to Reproduce:\n${source.stepsToReproduce}`,
        ...(source.errorMessages ? [``, `Error Messages:\n${source.errorMessages}`] : []),
        ...(source.screenshotUrls.length ? [``, `Screenshots: ${source.screenshotUrls.join(", ")}`] : []),
      ]

      await db.$transaction([
        db.bugReportComment.updateMany({
          where: { bugReportId: sourceReportId },
          data: { bugReportId: targetReportId },
        }),
        db.bugReportComment.create({
          data: {
            bugReportId: targetReportId,
            authorId: source.authorId,
            body: lines.join("\n"),
            isMergedReport: true,
          },
        }),
        db.bugReportUpvote.deleteMany({ where: { bugReportId: sourceReportId } }),
        db.bugReport.delete({ where: { id: sourceReportId } }),
        db.adminActionLog.create({
          data: {
            staffUserId: ctx.userId,
            gameId: source.gameId,
            action: `bug_merge:${targetReportId}`,
            targetType: "BugReport",
            targetId: sourceReportId,
          },
        }),
      ])

      return { targetReportId }
    }),
})

// ── Moderation ────────────────────────────────────────────────────────────────

const moderationOpsRouter = router({
  list: staffProcedure
    .input(z.object({
      gameId: z.string(),
      status: z.enum(["PENDING", "REVIEWED", "DISMISSED"]).optional(),
      reportType: z.enum(["PLAYER", "ANIMAL", "GROUP", "FORUM_POST", "FORUM_THREAD", "CHAT_MESSAGE", "DIRECT_MESSAGE", "MARKETPLACE_LISTING"]).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, status, reportType, cursor, limit } = input
      const reports = await db.userReport.findMany({
        where: { gameId, ...(status && { status }), ...(reportType && { reportType }) },
        include: {
          reporterPlayer: { select: { id: true, username: true } },
          reportedPlayer: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = reports.length > limit
      return { reports: reports.slice(0, limit), hasMore, nextCursor: hasMore ? reports[limit - 1]!.id : undefined }
    }),

  review: staffProcedure
    .input(z.object({
      reportId: z.string(),
      status: z.enum(["REVIEWED", "DISMISSED"]),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const report = await db.userReport.findUniqueOrThrow({ where: { id: input.reportId } })
      const player = await db.playerAccount.findFirstOrThrow({ where: { userId: ctx.userId, gameId: report.gameId } })
      return db.userReport.update({
        where: { id: input.reportId },
        data: {
          status: input.status,
          adminNote: input.adminNote ?? null,
          reviewedByPlayerId: player.id,
          reviewedAt: new Date(),
        },
      })
    }),
})

// ── Seasons ───────────────────────────────────────────────────────────────────

const seasonsOpsRouter = router({
  list: staffProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.season.findMany({
        where: { gameId: input.gameId },
        include: { _count: { select: { rankings: true } } },
        orderBy: { startsAt: "desc" },
        take: 20,
      })
    ),

  getCompetitions: staffProcedure
    .input(z.object({ gameId: z.string(), status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional() }))
    .query(({ input }) =>
      db.competition.findMany({
        where: { gameId: input.gameId, ...(input.status && { status: input.status }) },
        include: {
          venue: { select: { name: true } },
          _count: { select: { entries: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
})

// ── Events / LiveOps ──────────────────────────────────────────────────────────

const eventsOpsRouter = router({
  list: staffProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.liveOpsEvent.findMany({
        where: { gameId: input.gameId },
        orderBy: { startsAt: "desc" },
      })
    ),

  create: staffProcedure
    .input(z.object({
      gameId: z.string(),
      eventType: z.string(),
      configOverrides: z.record(z.unknown()),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      isTemplate: z.boolean().default(false),
      templateOf: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const event = await db.liveOpsEvent.create({
        data: {
          gameId: input.gameId,
          eventType: input.eventType,
          configOverrides: input.configOverrides as Prisma.InputJsonValue,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          isTemplate: input.isTemplate,
          templateOf: input.templateOf ?? null,
        },
      })
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: input.gameId,
          action: `create_live_ops_event:${input.eventType}`,
          targetType: "LiveOpsEvent",
          targetId: event.id,
        },
      })
      return event
    }),

  update: staffProcedure
    .input(z.object({
      eventId: z.string(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      configOverrides: z.record(z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updateData: Prisma.LiveOpsEventUpdateInput = {}
      if (input.startsAt) updateData.startsAt = new Date(input.startsAt)
      if (input.endsAt) updateData.endsAt = new Date(input.endsAt)
      if (input.configOverrides) updateData.configOverrides = input.configOverrides as Prisma.InputJsonValue
      if (input.isActive !== undefined) updateData.isActive = input.isActive
      const event = await db.liveOpsEvent.update({
        where: { id: input.eventId },
        data: updateData,
      })
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: event.gameId,
          action: "update_live_ops_event",
          targetType: "LiveOpsEvent",
          targetId: event.id,
        },
      })
      return event
    }),

  delete: staffProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const event = await db.liveOpsEvent.findUniqueOrThrow({ where: { id: input.eventId } })
      await db.liveOpsEvent.delete({ where: { id: input.eventId } })
      await db.adminActionLog.create({
        data: {
          staffUserId: ctx.userId,
          gameId: event.gameId,
          action: "delete_live_ops_event",
          targetType: "LiveOpsEvent",
          targetId: event.id,
        },
      })
    }),
})

// ── Integrity ─────────────────────────────────────────────────────────────────

const integrityOpsRouter = router({
  sharedIps: staffProcedure
    .input(z.object({ gameId: z.string(), minAccounts: z.number().int().min(2).default(2) }))
    .query(async ({ input }) => {
      const logs = await db.userIpLog.findMany({
        select: { ipAddress: true, userId: true, seenAt: true, user: { select: { email: true, playerAccounts: { where: { gameId: input.gameId }, select: { id: true, username: true } } } } },
        orderBy: { seenAt: "desc" },
      })
      const ipMap = new Map<string, typeof logs>()
      const seen = new Set<string>()
      for (const log of logs) {
        const key = `${log.ipAddress}:${log.userId}`
        if (seen.has(key)) continue
        seen.add(key)
        const arr = ipMap.get(log.ipAddress) ?? []
        arr.push(log)
        ipMap.set(log.ipAddress, arr)
      }
      return Array.from(ipMap.entries())
        .filter(([, users]) => users.length >= input.minAccounts)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50)
        .map(([ipAddress, users]) => ({ ipAddress, count: users.length, users }))
    }),

  sharedFingerprints: staffProcedure
    .input(z.object({ gameId: z.string(), minAccounts: z.number().int().min(2).default(2) }))
    .query(async ({ input }) => {
      const logs = await db.userDeviceLog.findMany({
        select: { fingerprintHash: true, userId: true, seenAt: true, user: { select: { email: true, playerAccounts: { where: { gameId: input.gameId }, select: { id: true, username: true } } } } },
        orderBy: { seenAt: "desc" },
      })
      const fpMap = new Map<string, typeof logs>()
      const seen = new Set<string>()
      for (const log of logs) {
        const key = `${log.fingerprintHash}:${log.userId}`
        if (seen.has(key)) continue
        seen.add(key)
        const arr = fpMap.get(log.fingerprintHash) ?? []
        arr.push(log)
        fpMap.set(log.fingerprintHash, arr)
      }
      return Array.from(fpMap.entries())
        .filter(([, users]) => users.length >= input.minAccounts)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50)
        .map(([fingerprintHash, users]) => ({ fingerprintHash, count: users.length, users }))
    }),

  excessiveTransfers: staffProcedure
    .input(z.object({ gameId: z.string(), hoursBack: z.number().int().min(1).max(168).default(24), threshold: z.number().int().default(10) }))
    .query(async ({ input }) => {
      const since = new Date(Date.now() - input.hoursBack * 3600000)
      const txns = await db.transaction.findMany({
        where: {
          gameId: input.gameId,
          createdAt: { gte: since },
          txnType: { in: ["MARKETPLACE_SALE", "MARKETPLACE_PURCHASE", "GIFT"] },
          fromPlayerAccountId: { not: null },
        },
        select: { fromPlayerAccountId: true },
      })
      const countMap = new Map<string, number>()
      for (const t of txns) {
        if (!t.fromPlayerAccountId) continue
        countMap.set(t.fromPlayerAccountId, (countMap.get(t.fromPlayerAccountId) ?? 0) + 1)
      }
      const flagged = Array.from(countMap.entries())
        .filter(([, count]) => count >= input.threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
      const results = await Promise.all(
        flagged.map(async ([playerAccountId, count]) => {
          const player = await db.playerAccount.findUnique({ where: { id: playerAccountId }, select: { id: true, username: true } })
          return { playerAccountId, count, player }
        })
      )
      return results
    }),
})

// ── Audit Log ─────────────────────────────────────────────────────────────────

const auditOpsRouter = router({
  list: staffProcedure
    .input(z.object({
      gameId: z.string(),
      staffUserId: z.string().optional(),
      targetType: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const { gameId, staffUserId, targetType, cursor, limit } = input
      const logs = await db.adminActionLog.findMany({
        where: { gameId, ...(staffUserId && { staffUserId }), ...(targetType && { targetType }) },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = logs.length > limit
      return { logs: logs.slice(0, limit), hasMore, nextCursor: hasMore ? logs[limit - 1]!.id : undefined }
    }),
})

// ── System ────────────────────────────────────────────────────────────────────

const systemOpsRouter = router({
  recentLogs: staffProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.nightlyUpdateLog.findMany({
        where: { gameId: input.gameId },
        orderBy: { startedAt: "desc" },
        take: 30,
      })
    ),

  shopStatus: staffProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.gameShopBreedConfig.findMany({
        where: { gameId: input.gameId },
        include: {
          breed: { select: { name: true } },
          _count: { select: { shopAnimals: true } },
        },
      })
    ),
})

// ── Scheduled-run analytics ──────────────────────────────────────────────────
//
// Everything here is read back out of `ScheduledTaskRun`, its progress samples
// and its per-animal work items. None of it is accumulated live in the server
// process, which is the point: a nightly that crashed halfway can still be
// asked what it managed to do, and a run that is still going can be watched
// from a second browser without the running process being involved at all.

/** How many samples the "current" rate looks back over. */
const RATE_TRAIL = 5

/** How many previous runs a run is compared against. */
const COMPARISON_RUNS = 5

const OUTSTANDING_WORK = ["PENDING", "RETRYING", "RUNNING"] as const

type RateSample = {
  recordedAt: Date
  succeededTotal: number
  activeWorkers: number
}

/** Animals a second between two samples, or null if no time passed. */
function rateBetween(from: RateSample, to: RateSample): number | null {
  const seconds = (to.recordedAt.getTime() - from.recordedAt.getTime()) / 1000
  if (seconds <= 0) return null
  return (to.succeededTotal - from.succeededTotal) / seconds
}

const analyticsOpsRouter = router({
  /**
   * The run history, newest first. This is the comparison table: one row per
   * boundary that came due, with what it cost and what it changed.
   */
  runs: staffProcedure
    .input(z.object({
      gameId: z.string(),
      taskType: z.enum(["NIGHTLY", "COMPETITION_SWEEP", "VENUE_ROTATION"]).optional(),
      limit: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      const runs = await db.scheduledTaskRun.findMany({
        where: { gameId: input.gameId, ...(input.taskType && { taskType: input.taskType }) },
        orderBy: { scheduledFor: "desc" },
        take: input.limit,
        select: {
          id: true, taskType: true, scheduledFor: true, status: true, attempt: true,
          startedAt: true, completedAt: true, errorMessage: true,
          eligibleCount: true, processedCount: true, succeededCount: true,
          failedCount: true, retriedCount: true, skippedCount: true,
          nightlyLog: {
            select: { animalsAged: true, animalDeaths: true, lifeStageTransitions: true },
          },
        },
      })

      const now = new Date()

      return runs.map((run) => {
        // An unfinished run is measured against now, so a stuck one visibly
        // grows rather than sitting at whatever it last reached.
        const until = run.completedAt ?? (run.startedAt ? now : null)
        const durationMs =
          run.startedAt && until ? until.getTime() - run.startedAt.getTime() : null

        return {
          ...run,
          durationMs,
          // Successful items only. A retried animal is counted once, when it
          // finally completes, so retries never inflate throughput.
          wallClockRate:
            durationMs && durationMs > 0 ? run.succeededCount / (durationMs / 1000) : null,
        }
      })
    }),

  /**
   * One run in detail: its progress curve, what is left, what failed, and how
   * it compares with the runs before it.
   *
   * With no `runId` it picks the run worth looking at - whatever is live, and
   * otherwise the most recent one.
   */
  run: staffProcedure
    .input(z.object({
      gameId: z.string(),
      runId: z.string().optional(),
      taskType: z.enum(["NIGHTLY", "COMPETITION_SWEEP", "VENUE_ROTATION"]).default("NIGHTLY"),
    }))
    .query(async ({ input }) => {
      const run = input.runId
        ? await db.scheduledTaskRun.findFirst({
            where: { id: input.runId, gameId: input.gameId },
          })
        : ((await db.scheduledTaskRun.findFirst({
            where: {
              gameId: input.gameId,
              taskType: input.taskType,
              status: { in: [...OUTSTANDING_WORK] },
            },
            orderBy: { scheduledFor: "desc" },
          })) ??
          (await db.scheduledTaskRun.findFirst({
            where: { gameId: input.gameId, taskType: input.taskType },
            orderBy: { scheduledFor: "desc" },
          })))

      if (!run) return null

      const [sampleRows, workGroups, retriedItems, oldest, failures, log, previous] =
        await Promise.all([
          db.scheduledTaskRunSample.findMany({
            where: { runId: run.id },
            orderBy: { recordedAt: "asc" },
            select: {
              recordedAt: true, processedTotal: true, succeededTotal: true,
              failedTotal: true, activeWorkers: true,
            },
          }),
          db.nightlyAnimalWork.groupBy({
            by: ["status"],
            where: { runId: run.id },
            _count: { _all: true },
          }),
          // Items that needed more than one try. Distinct from `failedCount`:
          // most of these eventually succeeded.
          db.nightlyAnimalWork.count({ where: { runId: run.id, attempt: { gt: 1 } } }),
          db.nightlyAnimalWork.findFirst({
            where: { runId: run.id, status: { in: [...OUTSTANDING_WORK] } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true, animalId: true, status: true, attempt: true, claimedBy: true,
              createdAt: true, startedAt: true, leaseUntil: true,
              animal: { select: { name: true } },
            },
          }),
          db.nightlyAnimalWork.findMany({
            where: { runId: run.id, status: "FAILED" },
            orderBy: { completedAt: "desc" },
            take: 50,
            select: {
              id: true, animalId: true, attempt: true, errorMessage: true,
              completedAt: true, animal: { select: { name: true } },
            },
          }),
          db.nightlyUpdateLog.findUnique({
            where: { runId: run.id },
            select: {
              animalsAged: true, animalDeaths: true, lifeStageTransitions: true,
              success: true, errorMessage: true,
            },
          }),
          db.scheduledTaskRun.findMany({
            where: {
              gameId: input.gameId,
              taskType: run.taskType,
              status: "COMPLETED",
              scheduledFor: { lt: run.scheduledFor },
              startedAt: { not: null },
              completedAt: { not: null },
            },
            orderBy: { scheduledFor: "desc" },
            take: COMPARISON_RUNS,
            select: { startedAt: true, completedAt: true, succeededCount: true },
          }),
        ])

      const work = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0, cancelled: 0 }
      for (const row of workGroups) {
        const key = row.status.toLowerCase() as keyof typeof work
        if (key in work) work[key] = row._count._all
      }
      const totalWork = Object.values(work).reduce((a, b) => a + b, 0)
      const remaining = work.pending + work.running + work.retrying

      // Pregnancies that came to term during this run. Counted from the
      // database rather than tallied by the handler, so the number survives a
      // run that was reclaimed halfway and finished by a second attempt.
      const pregnanciesCompleted = run.startedAt
        ? await db.pregnancy.count({
            where: {
              isCompleted: true,
              completedAt: { gte: run.startedAt },
              animal: { nightlyWork: { some: { runId: run.id } } },
            },
          })
        : 0

      const now = new Date()
      const isLive = (OUTSTANDING_WORK as readonly string[]).includes(run.status)
      const until = run.completedAt ?? (run.startedAt ? now : null)
      const elapsedMs = run.startedAt && until ? until.getTime() - run.startedAt.getTime() : null

      // Completed items, not attempts. This is the numerator of every rate
      // below, which is how retries are kept out of successful throughput.
      const succeeded = work.completed > 0 ? work.completed : run.succeededCount

      const samples: RateSample[] = sampleRows.map((row) => ({
        recordedAt: row.recordedAt,
        succeededTotal: row.succeededTotal,
        activeWorkers: row.activeWorkers,
      }))

      // Worker-seconds: each sample's worker count held for the interval that
      // ended at it, including the first interval back to the run's start.
      // This is what makes the processing rate differ from the wall-clock rate
      // once more than one worker is on a run.
      let workerSeconds = 0
      let previousAt = run.startedAt
      for (const sample of samples) {
        if (previousAt) {
          const dt = (sample.recordedAt.getTime() - previousAt.getTime()) / 1000
          if (dt > 0) workerSeconds += dt * sample.activeWorkers
        }
        previousAt = sample.recordedAt
      }

      let peakRate: number | null = null
      for (let i = 1; i < samples.length; i++) {
        const rate = rateBetween(samples[i - 1]!, samples[i]!)
        if (rate !== null && (peakRate === null || rate > peakRate)) peakRate = rate
      }

      const trail = samples.slice(-RATE_TRAIL)
      const currentRate =
        isLive && trail.length >= 2 ? rateBetween(trail[0]!, trail[trail.length - 1]!) : null

      const wallClockRate = elapsedMs && elapsedMs > 0 ? succeeded / (elapsedMs / 1000) : null
      const processingRate = workerSeconds > 0 ? succeeded / workerSeconds : null
      const projectionRate = currentRate && currentRate > 0 ? currentRate : wallClockRate

      const estimatedCompletionAt =
        isLive && remaining > 0 && projectionRate && projectionRate > 0
          ? new Date(now.getTime() + (remaining / projectionRate) * 1000)
          : null

      const comparable = previous.filter((p) => p.succeededCount > 0)
      const comparison =
        comparable.length > 0
          ? {
              runs: comparable.length,
              averageDurationMs:
                comparable.reduce(
                  (sum, p) => sum + (p.completedAt!.getTime() - p.startedAt!.getTime()),
                  0
                ) / comparable.length,
              averageSucceeded:
                comparable.reduce((sum, p) => sum + p.succeededCount, 0) / comparable.length,
              averageRate:
                comparable.reduce((sum, p) => {
                  const seconds = (p.completedAt!.getTime() - p.startedAt!.getTime()) / 1000
                  return sum + (seconds > 0 ? p.succeededCount / seconds : 0)
                }, 0) / comparable.length,
            }
          : null

      return {
        run: {
          id: run.id,
          taskType: run.taskType,
          scheduledFor: run.scheduledFor,
          status: run.status,
          attempt: run.attempt,
          claimedBy: run.claimedBy,
          leaseUntil: run.leaseUntil,
          heartbeatAt: run.heartbeatAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          errorMessage: run.errorMessage,
          eligibleCount: run.eligibleCount,
          claimedCount: run.claimedCount,
          processedCount: run.processedCount,
          succeededCount: run.succeededCount,
          failedCount: run.failedCount,
          retriedCount: run.retriedCount,
          skippedCount: run.skippedCount,
        },
        isLive,
        elapsedMs,
        work: { ...work, total: totalWork, remaining },
        retriedItems,
        rates: {
          current: currentRate,
          average: wallClockRate,
          peak: peakRate,
          processing: processingRate,
          workerSeconds,
        },
        activeWorkers: samples.length > 0 ? samples[samples.length - 1]!.activeWorkers : 0,
        estimatedCompletionAt,
        oldestUnfinished: oldest
          ? {
              id: oldest.id,
              animalId: oldest.animalId,
              animalName: oldest.animal.name,
              status: oldest.status,
              attempt: oldest.attempt,
              claimedBy: oldest.claimedBy,
              leaseUntil: oldest.leaseUntil,
              waitingMs: now.getTime() - (oldest.startedAt ?? oldest.createdAt).getTime(),
            }
          : null,
        failures: failures.map((f) => ({
          id: f.id,
          animalId: f.animalId,
          animalName: f.animal.name,
          attempt: f.attempt,
          errorMessage: f.errorMessage,
          completedAt: f.completedAt,
        })),
        outcomes: {
          animalsAged: log?.animalsAged ?? null,
          animalDeaths: log?.animalDeaths ?? null,
          lifeStageTransitions: log?.lifeStageTransitions ?? null,
          pregnanciesCompleted,
        },
        samples: sampleRows,
        comparison,
      }
    }),

  /**
   * Plan section 8's admin action: put a run's failed animals back in the
   * queue and hand the run itself back to the scheduler.
   *
   * Attempts are reset on both, because an administrator asking for a retry is
   * saying the cause has been dealt with - leaving the counters where they are
   * would mean the next tick gave up immediately.
   */
  retryFailed: staffProcedure
    .input(z.object({ gameId: z.string(), runId: z.string() }))
    .mutation(async ({ input }) => {
      const run = await db.scheduledTaskRun.findFirst({
        where: { id: input.runId, gameId: input.gameId },
        select: { id: true, status: true },
      })
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" })

      if (run.status === "RUNNING") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This run is still going. Wait for it to stop before retrying it.",
        })
      }

      return db.$transaction(async (tx) => {
        const { count } = await tx.nightlyAnimalWork.updateMany({
          where: { runId: run.id, status: "FAILED" },
          data: {
            status: "PENDING",
            attempt: 0,
            claimedBy: null,
            leaseUntil: null,
            startedAt: null,
            completedAt: null,
            errorMessage: null,
          },
        })

        // RETRYING rather than PENDING: the run has been attempted, and
        // RETRYING is the scheduler's own word for "pick this up again". The
        // next tick claims it like any other outstanding run.
        await tx.scheduledTaskRun.update({
          where: { id: run.id },
          data: {
            status: "RETRYING",
            attempt: 0,
            claimedBy: null,
            claimedAt: null,
            leaseUntil: null,
            completedAt: null,
            errorMessage: null,
          },
        })

        return { requeued: count }
      })
    }),
})

// ── Root ──────────────────────────────────────────────────────────────────────

export const opsAdminRouter = router({
  overview: overviewRouter,
  players: playersOpsRouter,
  economy: economyOpsRouter,
  support: supportOpsRouter,
  bugs: bugsOpsRouter,
  moderation: moderationOpsRouter,
  seasons: seasonsOpsRouter,
  events: eventsOpsRouter,
  integrity: integrityOpsRouter,
  audit: auditOpsRouter,
  system: systemOpsRouter,
  analytics: analyticsOpsRouter,
})
