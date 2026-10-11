import { initTRPC } from "@trpc/server"
import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"
import { guardTutorialMutation } from "./tutorial-guard.js"
import { guardGameMaintenance } from "./maintenance.js"
import { noopRealtime, type RealtimeControl } from "./messaging/realtime.js"

export type Context = {
  userId: string | null
  // Supplied by the application server. Lets a mutation push a live event
  // without this package importing Socket.IO — see messaging/realtime.ts.
  realtime: RealtimeControl
}

// A context for callers with no realtime server attached: scripts, jobs, tests.
export function baseContext(userId: string | null): Context {
  return { userId, realtime: noopRealtime }
}

export const t = initTRPC.context<Context>().create()

export const router = t.router
const baseProcedure = t.procedure.use(async ({ ctx, type, path, getRawInput, next }) => {
  if (type === "mutation") {
    const input = await getRawInput()
    // Before the tutorial gate, because a game that is mid-update is closed to
    // everyone — a tutorial player included — and the reason they are refused
    // should be the one they can act on.
    await guardGameMaintenance(ctx.userId, path, input)
    await guardTutorialMutation(ctx.userId, path, input)
  }
  return next()
})
export const publicProcedure = baseProcedure
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

export const staffProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = await db.staffRole.findFirst({ where: { userId: ctx.userId } })
  if (!role) throw new TRPCError({ code: "FORBIDDEN" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

export const ownerProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = await db.staffRole.findFirst({ where: { userId: ctx.userId, role: "OWNER" } })
  if (!role) throw new TRPCError({ code: "FORBIDDEN" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})
