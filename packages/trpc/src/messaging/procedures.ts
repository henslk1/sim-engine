import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { protectedProcedure } from "../trpc.js"
import { resolveActor } from "./actor.js"
import { canManageChannels, canModerateMessages } from "./permissions.js"
import type { Denied, MessagingDenialCode } from "./result.js"

const TRPC_CODE: Record<MessagingDenialCode, TRPCError["code"]> = {
  BANNED: "FORBIDDEN",
  NO_PLAYER_ACCOUNT: "FORBIDDEN",
  CHANNEL_NOT_FOUND: "NOT_FOUND",
  GROUP_CHAT_UNAVAILABLE: "NOT_FOUND",
  CHANNEL_ARCHIVED: "FORBIDDEN",
  STAFF_ONLY: "FORBIDDEN",
  BLOCKED: "FORBIDDEN",
  DM_UNAVAILABLE: "FORBIDDEN",
  NOT_STAFF: "FORBIDDEN",
}

// Only the player-facing message crosses the wire. `detail` stays here.
export function denialToTRPCError(denied: Denied): TRPCError {
  return new TRPCError({ code: TRPC_CODE[denied.code], message: denied.message })
}

// The base procedure for every messaging route.
//
// It requires a gameId in the input and resolves the acting player from the
// authenticated session plus that game — so a caller cannot name the player
// account it wants to act as. Handlers read ctx.actor and never re-derive it.
export const messagingProcedure = protectedProcedure
  .input(z.object({ gameId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const decision = await resolveActor(ctx.userId, input.gameId)
    if (!decision.ok) throw denialToTRPCError(decision)
    return next({ ctx: { ...ctx, actor: decision.value } })
  })

// Channel structure: create, rename, reorder, archive, configure.
//
// This is the derivative staffProcedure cannot express. staffProcedure accepts
// any staff row for any game; this one resolves the role held in *this* game
// and requires admin or owner, so a moderator does not quietly gain the ability
// to restructure the server, and neither does an admin of a different game.
export const channelAdminProcedure = messagingProcedure.use(({ ctx, next }) => {
  const check = canManageChannels(ctx.actor)
  if (!check.ok) throw denialToTRPCError(check)
  return next()
})

// Content moderation: delete other players' messages, pin, review reports.
export const messageModerationProcedure = messagingProcedure.use(({ ctx, next }) => {
  const check = canModerateMessages(ctx.actor)
  if (!check.ok) throw denialToTRPCError(check)
  return next()
})
