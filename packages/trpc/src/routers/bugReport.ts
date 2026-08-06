import { z } from "zod"
import { router, protectedProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { notifyStaff } from "../lib/staffNotify.js"

const bugReportSelect = {
  id: true,
  title: true,
  category: true,
  severity: true,
  status: true,
  pageUrl: true,
  description: true,
  expectedOutcome: true,
  stepsToReproduce: true,
  errorMessages: true,
  screenshotUrls: true,
  adminNote: true,
  claimedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, username: true } },
  claimedBy: { select: { id: true, name: true } },
  _count: { select: { upvotes: true, comments: true } },
} as const

const PENDING_STATUSES = ["OPEN", "CONFIRMED", "IN_PROGRESS", "NEEDS_MORE_INFO"] as const
const FIXED_STATUSES = ["RESOLVED", "NOT_A_BUG", "CLOSED"] as const

export const bugReportRouter = router({
  list: protectedProcedure
    .input(z.object({
      gameId: z.string(),
      tab: z.enum(["hottest", "latest", "pending", "fixed"]).default("hottest"),
      category: z.enum(["VISUAL", "TEXT", "UI", "GAMEPLAY", "ECONOMY", "PERFORMANCE"]).optional(),
      severity: z.enum(["MINOR", "MAJOR", "GAME_BREAKING"]).optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(30),
    }))
    .query(async ({ input }) => {
      const { gameId, tab, category, severity, search, cursor, limit } = input

      const statusFilter =
        tab === "pending" ? { status: { in: [...PENDING_STATUSES] } } :
        tab === "fixed"   ? { status: { in: [...FIXED_STATUSES] } } :
        tab === "hottest" ? { status: { in: [...PENDING_STATUSES] } } : {}

      const reports = await db.bugReport.findMany({
        where: {
          gameId,
          ...(category && { category }),
          ...(severity && { severity }),
          ...(search && {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }),
          ...statusFilter,
        },
        select: bugReportSelect,
        orderBy: tab === "hottest" ? { upvotes: { _count: "desc" } } : { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      const hasMore = reports.length > limit
      return { reports: reports.slice(0, limit), hasMore, nextCursor: hasMore ? reports[limit - 1]!.id : undefined }
    }),

  get: protectedProcedure
    .input(z.object({ gameId: z.string(), reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUnique({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const [report, hasUpvoted] = await Promise.all([
        db.bugReport.findUniqueOrThrow({
          where: { id: input.reportId },
          select: {
            ...bugReportSelect,
            comments: {
              select: {
                id: true,
                body: true,
                isMergedReport: true,
                createdAt: true,
                author: { select: { id: true, username: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        }),
        player
          ? db.bugReportUpvote.findUnique({
              where: { bugReportId_playerAccountId: { bugReportId: input.reportId, playerAccountId: player.id } },
              select: { id: true },
            })
          : null,
      ])
      return { report, hasUpvoted: !!hasUpvoted }
    }),

  create: protectedProcedure
    .input(z.object({
      gameId: z.string(),
      title: z.string().min(5).max(200),
      category: z.enum(["VISUAL", "TEXT", "UI", "GAMEPLAY", "ECONOMY", "PERFORMANCE"]),
      severity: z.enum(["MINOR", "MAJOR", "GAME_BREAKING"]),
      pageUrl: z.string().min(1),
      description: z.string().min(10).max(5000),
      expectedOutcome: z.string().min(5).max(2000),
      stepsToReproduce: z.string().min(5).max(5000),
      errorMessages: z.string().max(2000).optional(),
      screenshotUrls: z.array(z.string()).max(3).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const report = await db.bugReport.create({
        data: {
          gameId: input.gameId,
          authorId: player.id,
          title: input.title,
          category: input.category,
          severity: input.severity,
          pageUrl: input.pageUrl,
          description: input.description,
          expectedOutcome: input.expectedOutcome,
          stepsToReproduce: input.stepsToReproduce,
          errorMessages: input.errorMessages ?? null,
          screenshotUrls: input.screenshotUrls,
          status: "OPEN",
        },
        select: { id: true },
      })
      await notifyStaff(input.gameId, `New bug report: ${input.title}`, `/admin/bugs/${report.id}`)
      return report
    }),

  toggleUpvote: protectedProcedure
    .input(z.object({ gameId: z.string(), reportId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const existing = await db.bugReportUpvote.findUnique({
        where: { bugReportId_playerAccountId: { bugReportId: input.reportId, playerAccountId: player.id } },
        select: { id: true },
      })
      if (existing) {
        await db.bugReportUpvote.delete({ where: { id: existing.id } })
        return { upvoted: false }
      }
      await db.bugReportUpvote.create({
        data: { bugReportId: input.reportId, playerAccountId: player.id },
      })
      return { upvoted: true }
    }),

  comment: protectedProcedure
    .input(z.object({ gameId: z.string(), reportId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      return db.bugReportComment.create({
        data: { bugReportId: input.reportId, authorId: player.id, body: input.body },
        select: {
          id: true,
          body: true,
          isMergedReport: true,
          createdAt: true,
          author: { select: { id: true, username: true } },
        },
      })
    }),

  myReports: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await db.playerAccount.findUniqueOrThrow({
        where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
        select: { id: true },
      })
      const [submitted, upvoted, commented] = await Promise.all([
        db.bugReport.findMany({
          where: { authorId: player.id, gameId: input.gameId },
          select: bugReportSelect,
          orderBy: { createdAt: "desc" },
        }),
        db.bugReportUpvote.findMany({
          where: { playerAccountId: player.id, bugReport: { gameId: input.gameId } },
          select: { bugReport: { select: bugReportSelect } },
        }),
        db.bugReportComment.findMany({
          where: { authorId: player.id, bugReport: { gameId: input.gameId } },
          select: { bugReport: { select: bugReportSelect } },
          distinct: ["bugReportId"],
        }),
      ])

      const submittedIds = new Set(submitted.map(r => r.id))
      const engaged = [
        ...upvoted.map(u => u.bugReport),
        ...commented.map(c => c.bugReport),
      ].filter((r, i, arr) =>
        !submittedIds.has(r.id) && arr.findIndex(x => x.id === r.id) === i
      )

      return { submitted, engaged }
    }),
})
