import { initTRPC } from "@trpc/server"

export type Context = {
  userId: string | null
}

export const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
