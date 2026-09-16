import { initTRPC } from "@trpc/server"
import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"
import { guardTutorialMutation } from "./tutorial-guard.js"

export type Context = {
  userId: string | null
}

export const t = initTRPC.context<Context>().create()

export const router = t.router
const baseProcedure = t.procedure.use(async ({ ctx, type, path, getRawInput, next }) => {
  if (type === "mutation") await guardTutorialMutation(ctx.userId, path, await getRawInput())
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
