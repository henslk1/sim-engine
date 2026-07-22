import { router, publicProcedure } from "../trpc.js"
import { db, Prisma } from "@sim-engine/db"
import { z } from "zod"

// ── Overview ────────────────────────────────────────────────────────────────

const overviewRouter = router({
  stats: publicProcedure
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
        db.bugReport.count({ where: { ...gf, severity: "GAME_BREAKING", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
        db.bugReport.count({ where: { ...gf, severity: "MAJOR", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
        db.bugReport.count({ where: { ...gf, severity: "MINOR", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
        db.bugReport.count({ where: { ...gf, isExploit: true, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
        db.userReport.count({ where: { ...gf, status: "PENDING" } }),
        db.banRecord.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
        db.playerAccount.findMany({
          where: { ...gf, createdAt: { gte: sevenDaysAgo } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, username: true, createdAt: true, user: { select: { email: true } } },
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
  list: publicProcedure
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

  getById: publicProcedure
    .input(z.object({ playerAccountId: z.string() }))
    .query(async ({ input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { id: input.playerAccountId },
        include: {
          user: {
            include: {
              banRecords: { orderBy: { bannedAt: "desc" } },
              staffRoles: true,
              userIpLogs: { orderBy: { seenAt: "desc" }, take: 20 },
              userDeviceLogs: { orderBy: { seenAt: "desc" }, take: 20 },
            },
          },
          seniority: true,
          playerBalances: { include: { currencyDef: true } },
          warnings: { orderBy: { createdAt: "desc" } },
          staffNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { email: true, name: true } } } },
          supportTickets: { orderBy: { createdAt: "desc" }, take: 10 },
          bugReports: { select: { id: true, title: true, severity: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 },
          _count: { select: { animalsOwned: true } },
        },
      })

      const recentTransactions = await db.transaction.findMany({
        where: { gameId: player.gameId, OR: [{ fromPlayerAccountId: player.id }, { toPlayerAccountId: player.id }] },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { currencyDef: { select: { symbol: true, name: true } } },
      })

      const reportsAgainst = await db.userReport.count({ where: { reportedPlayerId: player.id } })

      return { player, recentTransactions, reportsAgainst }
    }),

  grantCurrency: publicProcedure
    .input(z.object({
      playerAccountId: z.string(),
      currencyDefId: z.string(),
      amount: z.number().int(),
      reason: z.string(),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
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
            staffUserId: input.staffUserId,
            gameId: player.gameId,
            action: `grant_currency:${input.amount}:${input.reason}`,
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  issueWarning: publicProcedure
    .input(z.object({
      playerAccountId: z.string(),
      issuedByUserId: z.string(),
      reason: z.string(),
      warningType: z.enum(["VERBAL", "FORMAL", "FINAL"]),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({ where: { id: input.playerAccountId } })
      await db.$transaction([
        db.playerWarning.create({
          data: {
            playerAccountId: input.playerAccountId,
            issuedByUserId: input.issuedByUserId,
            reason: input.reason,
            warningType: input.warningType,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.issuedByUserId,
            gameId: player.gameId,
            action: `issue_warning:${input.warningType}:${input.reason}`,
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  ban: publicProcedure
    .input(z.object({
      userId: z.string(),
      bannedByUserId: z.string(),
      reason: z.string(),
      expiresAt: z.string().datetime().optional(),
      gameId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.$transaction([
        db.banRecord.create({
          data: {
            userId: input.userId,
            bannedByUserId: input.bannedByUserId,
            reason: input.reason,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.bannedByUserId,
            gameId: input.gameId,
            action: `ban:${input.expiresAt ? "temp" : "permanent"}:${input.reason}`,
            targetType: "User",
            targetId: input.userId,
          },
        }),
      ])
    }),

  banIp: publicProcedure
    .input(z.object({
      ipAddress: z.string(),
      reason: z.string(),
      expiresAt: z.string().datetime().optional(),
      staffUserId: z.string(),
      gameId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.$transaction([
        db.ipBan.upsert({
          where: { ipAddress: input.ipAddress },
          update: { reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
          create: { ipAddress: input.ipAddress, reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
            gameId: input.gameId,
            action: `ban_ip:${input.ipAddress}:${input.reason}`,
            targetType: "IpAddress",
            targetId: input.ipAddress,
          },
        }),
      ])
    }),

  assignRole: publicProcedure
    .input(z.object({
      userId: z.string(),
      gameId: z.string().optional(),
      role: z.enum(["OWNER", "ADMIN", "MODERATOR"]),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.staffRole.create({
        data: { userId: input.userId, gameId: input.gameId ?? null, role: input.role },
      })
      await db.adminActionLog.create({
        data: {
          staffUserId: input.staffUserId,
          gameId: input.gameId ?? null,
          action: `assign_role:${input.role}`,
          targetType: "User",
          targetId: input.userId,
        },
      })
    }),

  removeRole: publicProcedure
    .input(z.object({
      staffRoleId: z.string(),
      staffUserId: z.string(),
      gameId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const role = await db.staffRole.findUniqueOrThrow({ where: { id: input.staffRoleId } })
      await db.staffRole.delete({ where: { id: input.staffRoleId } })
      await db.adminActionLog.create({
        data: {
          staffUserId: input.staffUserId,
          gameId: input.gameId ?? null,
          action: `remove_role:${role.role}`,
          targetType: "User",
          targetId: role.userId,
        },
      })
    }),

  bypassGates: publicProcedure
    .input(z.object({ playerAccountId: z.string(), staffUserId: z.string() }))
    .mutation(async ({ input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({ where: { id: input.playerAccountId } })
      await db.$transaction([
        db.playerSeniority.upsert({
          where: { playerAccountId: input.playerAccountId },
          update: { gatesBypassesd: true },
          create: { playerAccountId: input.playerAccountId, gatesBypassesd: true },
        }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
            gameId: player.gameId,
            action: "bypass_seniority_gates",
            targetType: "PlayerAccount",
            targetId: input.playerAccountId,
          },
        }),
      ])
    }),

  resetAnimalName: publicProcedure
    .input(z.object({
      animalId: z.string(),
      newName: z.string(),
      staffUserId: z.string(),
      gameId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.$transaction([
        db.animal.update({ where: { id: input.animalId }, data: { name: input.newName } }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
            gameId: input.gameId,
            action: `reset_animal_name:${input.newName}`,
            targetType: "Animal",
            targetId: input.animalId,
          },
        }),
      ])
    }),

  addNote: publicProcedure
    .input(z.object({
      playerAccountId: z.string(),
      authorUserId: z.string(),
      body: z.string().min(1),
    }))
    .mutation(({ input }) =>
      db.staffPlayerNote.create({
        data: { playerAccountId: input.playerAccountId, authorUserId: input.authorUserId, body: input.body },
      })
    ),

  deleteNote: publicProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(({ input }) => db.staffPlayerNote.delete({ where: { id: input.noteId } })),
})

// ── Economy ───────────────────────────────────────────────────────────────────

const economyOpsRouter = router({
  stats: publicProcedure
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

  transactions: publicProcedure
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
  list: publicProcedure
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

  getById: publicProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(({ input }) =>
      db.supportTicket.findUniqueOrThrow({
        where: { id: input.ticketId },
        include: {
          playerAccount: { select: { id: true, username: true } },
          messages: { include: { author: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "asc" } },
        },
      })
    ),

  reply: publicProcedure
    .input(z.object({ ticketId: z.string(), authorId: z.string(), body: z.string().min(1) }))
    .mutation(({ input }) =>
      db.supportTicketMessage.create({
        data: { ticketId: input.ticketId, authorId: input.authorId, body: input.body },
      })
    ),

  setStatus: publicProcedure
    .input(z.object({
      ticketId: z.string(),
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: input.ticketId } })
      await db.$transaction([
        db.supportTicket.update({ where: { id: input.ticketId }, data: { status: input.status } }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
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
  list: publicProcedure
    .input(z.object({
      gameId: z.string(),
      status: z.enum(["OPEN", "CONFIRMED", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      severity: z.enum(["MINOR", "MAJOR", "GAME_BREAKING"]).optional(),
      category: z.enum(["ART", "TEXT", "UI", "MECHANIC"]).optional(),
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
          _count: { select: { upvotes: true, comments: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = reports.length > limit
      return { reports: reports.slice(0, limit), hasMore, nextCursor: hasMore ? reports[limit - 1]!.id : undefined }
    }),

  getById: publicProcedure
    .input(z.object({ reportId: z.string() }))
    .query(({ input }) =>
      db.bugReport.findUniqueOrThrow({
        where: { id: input.reportId },
        include: {
          author: { select: { id: true, username: true } },
          comments: {
            include: { author: { select: { id: true, username: true, user: { select: { staffRoles: true } } } } },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { upvotes: true } },
        },
      })
    ),

  setStatus: publicProcedure
    .input(z.object({
      reportId: z.string(),
      status: z.enum(["OPEN", "CONFIRMED", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.reportId } })
      await db.$transaction([
        db.bugReport.update({ where: { id: input.reportId }, data: { status: input.status } }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
            gameId: report.gameId,
            action: `bug_status:${input.status}`,
            targetType: "BugReport",
            targetId: input.reportId,
          },
        }),
      ])
    }),

  setExploit: publicProcedure
    .input(z.object({ reportId: z.string(), isExploit: z.boolean(), staffUserId: z.string() }))
    .mutation(async ({ input }) => {
      const report = await db.bugReport.findUniqueOrThrow({ where: { id: input.reportId } })
      await db.$transaction([
        db.bugReport.update({ where: { id: input.reportId }, data: { isExploit: input.isExploit } }),
        db.adminActionLog.create({
          data: {
            staffUserId: input.staffUserId,
            gameId: report.gameId,
            action: `bug_exploit:${input.isExploit}`,
            targetType: "BugReport",
            targetId: input.reportId,
          },
        }),
      ])
    }),

  addComment: publicProcedure
    .input(z.object({ bugReportId: z.string(), authorId: z.string(), body: z.string().min(1) }))
    .mutation(({ input }) =>
      db.bugReportComment.create({
        data: { bugReportId: input.bugReportId, authorId: input.authorId, body: input.body },
      })
    ),
})

// ── Moderation ────────────────────────────────────────────────────────────────

const moderationOpsRouter = router({
  list: publicProcedure
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

  review: publicProcedure
    .input(z.object({
      reportId: z.string(),
      status: z.enum(["REVIEWED", "DISMISSED"]),
      adminNote: z.string().optional(),
      reviewedByPlayerId: z.string(),
    }))
    .mutation(({ input }) =>
      db.userReport.update({
        where: { id: input.reportId },
        data: {
          status: input.status,
          adminNote: input.adminNote ?? null,
          reviewedByPlayerId: input.reviewedByPlayerId,
          reviewedAt: new Date(),
        },
      })
    ),
})

// ── Seasons ───────────────────────────────────────────────────────────────────

const seasonsOpsRouter = router({
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.season.findMany({
        where: { gameId: input.gameId },
        include: { _count: { select: { rankings: true } } },
        orderBy: { startsAt: "desc" },
        take: 20,
      })
    ),

  getCompetitions: publicProcedure
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
  list: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.liveOpsEvent.findMany({
        where: { gameId: input.gameId },
        orderBy: { startsAt: "desc" },
      })
    ),

  create: publicProcedure
    .input(z.object({
      gameId: z.string(),
      eventType: z.string(),
      configOverrides: z.record(z.unknown()),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      isTemplate: z.boolean().default(false),
      templateOf: z.string().optional(),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
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
          staffUserId: input.staffUserId,
          gameId: input.gameId,
          action: `create_live_ops_event:${input.eventType}`,
          targetType: "LiveOpsEvent",
          targetId: event.id,
        },
      })
      return event
    }),

  update: publicProcedure
    .input(z.object({
      eventId: z.string(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      configOverrides: z.record(z.unknown()).optional(),
      isActive: z.boolean().optional(),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
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
          staffUserId: input.staffUserId,
          gameId: event.gameId,
          action: "update_live_ops_event",
          targetType: "LiveOpsEvent",
          targetId: event.id,
        },
      })
      return event
    }),

  delete: publicProcedure
    .input(z.object({ eventId: z.string(), staffUserId: z.string() }))
    .mutation(async ({ input }) => {
      const event = await db.liveOpsEvent.findUniqueOrThrow({ where: { id: input.eventId } })
      await db.liveOpsEvent.delete({ where: { id: input.eventId } })
      await db.adminActionLog.create({
        data: {
          staffUserId: input.staffUserId,
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
  sharedIps: publicProcedure
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

  sharedFingerprints: publicProcedure
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

  excessiveTransfers: publicProcedure
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
  list: publicProcedure
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
  recentLogs: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(({ input }) =>
      db.nightlyUpdateLog.findMany({
        where: { gameId: input.gameId },
        orderBy: { startedAt: "desc" },
        take: 30,
      })
    ),

  shopStatus: publicProcedure
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

// ── Broadcast ─────────────────────────────────────────────────────────────────

const broadcastOpsRouter = router({
  send: publicProcedure
    .input(z.object({
      gameId: z.string(),
      fromPlayerAccountId: z.string(),
      body: z.string().min(1),
      targetPlayerAccountIds: z.array(z.string()).optional(),
      staffUserId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const targets = input.targetPlayerAccountIds
        ?? (await db.playerAccount.findMany({ where: { gameId: input.gameId }, select: { id: true } })).map(p => p.id)

      let sent = 0
      for (const toId of targets) {
        const existing = await db.directMessage.findFirst({
          where: {
            gameId: input.gameId,
            OR: [
              { playerOneId: input.fromPlayerAccountId, playerTwoId: toId },
              { playerOneId: toId, playerTwoId: input.fromPlayerAccountId },
            ],
          },
        })
        let channelId: string
        if (existing) {
          channelId = existing.chatChannelId
        } else {
          const channel = await db.chatChannel.create({
            data: { gameId: input.gameId, channelType: "DM", createdByPlayerId: input.fromPlayerAccountId },
          })
          channelId = channel.id
          await db.directMessage.create({
            data: { gameId: input.gameId, chatChannelId: channelId, playerOneId: input.fromPlayerAccountId, playerTwoId: toId },
          })
        }
        await db.chatMessage.create({
          data: { channelId, authorPlayerId: input.fromPlayerAccountId, content: input.body },
        })
        sent++
      }

      await db.adminActionLog.create({
        data: {
          staffUserId: input.staffUserId,
          gameId: input.gameId,
          action: `broadcast:${sent}_recipients`,
          targetType: "Broadcast",
          targetId: input.gameId,
        },
      })

      return { sent }
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
  broadcast: broadcastOpsRouter,
})
