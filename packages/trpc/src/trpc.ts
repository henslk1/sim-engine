import { initTRPC } from "@trpc/server"
import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"

export type Context = {
  userId: string | null
}

export const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

export const staffProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = await db.staffRole.findFirst({ where: { userId: ctx.userId } })
  if (!role) throw new TRPCError({ code: "FORBIDDEN" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

export const ownerProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = await db.staffRole.findFirst({ where: { userId: ctx.userId, role: "OWNER" } })
  if (!role) throw new TRPCError({ code: "FORBIDDEN" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})
