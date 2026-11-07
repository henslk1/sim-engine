/**
 * The procedure vocabulary.
 *
 * Four procedures used to exist, and none of them had a name for the thing this
 * codebase does most often - "acts on an animal you own" - so thirty-odd routes
 * hand-rolled it or skipped it. These ten give every shape a name, and the name
 * is the authorization.
 *
 * Two rules run through all of them:
 *
 *   - **The acting account is never an input.** It is resolved from the session.
 *     `messagingProcedure` has said so in its own comment since it was written;
 *     this file generalises it.
 *   - **Scope comes from the resource, not the input.** A route that names a
 *     resource resolves its game from that resource. A `gameId` input is the
 *     anchor only for list and create routes, where there is no resource yet.
 *     Otherwise a caller can name their own game while acting on another one.
 *
 * A tier establishes *identity*. For a mutation it does not establish
 * authorization, because a middleware returns before the handler opens its
 * transaction - see `authz.ts` for the helpers that assert inside it.
 */

import { initTRPC } from "@trpc/server"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { db, type StaffRoleType } from "@sim-engine/db"
import { RANK, getActingStaffRole } from "./staff.js"
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

/**
 * The tier a route is on, carried as tRPC meta so it can be read back off the
 * **mounted** router rather than grepped out of the sources.
 *
 * Source scanning was tried and misses things: `health` is declared inline in
 * `router.ts` and was missed by exactly that distinction, which is why the
 * first count of this surface said 425 procedures instead of 426.
 *
 * Meta is inherited by every procedure built from a tagged builder, so a route
 * never sets this itself - it gets the tag of the procedure it was built on,
 * and a route built on a raw `t.procedure` has no tag at all, which is what the
 * structural test looks for.
 */
export type ProcedureTier =
  | "public"
  | "authed"
  | "player"
  | "animal"
  | "animalView"
  | "moderator"
  | "admin"
  | "owner"
  | "dev"
  | "messaging"
  | "channelAdmin"
  | "messageModeration"

export type ProcedureMeta = { tier: ProcedureTier }

export const t = initTRPC.context<Context>().meta<ProcedureMeta>().create()

export const router = t.router
const baseProcedure = t.procedure.meta({ tier: "public" }).use(async ({ ctx, type, path, getRawInput, next }) => {
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

/**
 * No authentication at all.
 *
 * The migration target is **one** use of this: `health`. It is the default and
 * nothing refuses it, which is how it reached 350-odd call sites, so the
 * structural test keeps a shrinking allowlist of the routes still on it.
 */
export const publicProcedure = baseProcedure

/**
 * Somebody is signed in. That is the whole claim.
 *
 * Renamed from `protectedProcedure`, which said nothing about what it protects
 * and was the name people reached for when they meant "this one is important" -
 * which is how 65 routes ended up with a session check and no ownership check.
 *
 * Two predicates still have to land here, in step 7 of the rollout rather than
 * now: an **active ban** and **email verification**, each with the same small
 * exception list (own support tickets and replies, `player.me`,
 * `admin.ops.players.myRoles`). They are deliberately not wired yet - a ban
 * that refuses the authenticated layout before the limited shell exists makes
 * the first ban in alpha unappealable, and the shell is step 7's other half.
 */
export const authedProcedure = baseProcedure.meta({ tier: "authed" }).use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

/** @deprecated The old name for `authedProcedure`. Call sites migrate per router. */
export const protectedProcedure = authedProcedure

const playerSelect = { id: true, userId: true, gameId: true, username: true } as const

/**
 * Signed in, and holds an account in the named game.
 *
 * The account is never an input - this is `messagingProcedure` generalised to
 * the rest of the app.
 *
 * This is the **input-anchored** form, for a route that names no resource:
 * lists, creates, and anything genuinely about a game rather than a thing in
 * one. A route that names a resource must resolve the game from the resource
 * and call `requirePlayerInGame` instead, or the `gameId` it trusts is the
 * caller's claim rather than a fact.
 */
export const playerProcedure = authedProcedure
  .meta({ tier: "player" })
  .input(z.object({ gameId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const player = await db.playerAccount.findUnique({
      where: { userId_gameId: { userId: ctx.userId, gameId: input.gameId } },
      select: playerSelect,
    })
    if (!player) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have a character in this game." })
    }
    return next({ ctx: { ...ctx, player } })
  })

const animalSelect = {
  id: true,
  gameId: true,
  status: true,
  playerAccount: { select: playerSelect },
} as const

/**
 * Acts on an animal the caller owns.
 *
 * The game comes from the animal, so these routes need no `gameId` in their
 * input at all - and must not take one.
 *
 * **For a query this is the authorization.** For a mutation it is only the
 * identity half: re-assert ownership with `assertOwnsAnimal` inside the
 * transaction, because this read is stale the moment it returns.
 */
export const animalProcedure = authedProcedure
  .meta({ tier: "animal" })
  .input(z.object({ animalId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const found = await db.animal.findUnique({
      where: { id: input.animalId },
      select: animalSelect,
    })
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found." })
    const { playerAccount, ...animal } = found
    // Owner *and* in the animal's own game. Nothing in the schema ties
    // `Animal.gameId` to its owner's `gameId`, so a game A account attached to
    // a game B animal would otherwise pass as the owner while every game-scoped
    // rule around the route was evaluated against the other game.
    if (playerAccount.userId !== ctx.userId || playerAccount.gameId !== animal.gameId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this animal." })
    }
    return next({ ctx: { ...ctx, animal, player: playerAccount } })
  })

/**
 * May *look at* an animal: the caller holds an account in the animal's game.
 *
 * The profile page is reachable for other players' animals from the stud
 * market, and health and certificates are meant to be visible to a prospective
 * buyer. Five routes need this.
 *
 * It settles **whether the caller may call the route**. It does not settle
 * **what comes back** - that is the response projection, and `isOwner` is here
 * because it is exactly the discriminator those projections need. A hidden UI
 * element is not a protection, and neither is a masked one.
 */
export const animalViewProcedure = authedProcedure
  .meta({ tier: "animalView" })
  .input(z.object({ animalId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const found = await db.animal.findUnique({
      where: { id: input.animalId },
      select: animalSelect,
    })
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found." })
    const { playerAccount, ...animal } = found

    // Membership is always in the **animal's** game. The shortcut only applies
    // when the owning account is itself in that game: an owner-of-record whose
    // account lives in another game is not a member here, and taking their
    // account as the membership would hand them the owner view of an animal
    // their game cannot see.
    const player =
      playerAccount.userId === ctx.userId && playerAccount.gameId === animal.gameId
        ? playerAccount
        : await db.playerAccount.findUnique({
            where: { userId_gameId: { userId: ctx.userId, gameId: animal.gameId } },
            select: playerSelect,
          })
    if (!player) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have a character in this game." })
    }
    return next({ ctx: { ...ctx, animal, player, isOwner: player.id === playerAccount.id } })
  })

/**
 * The three staff tiers, built on one rank test.
 *
 * `getActingStaffRole` and not `getStaffRole`, because these answer "may this
 * person use this screen at all". Owners and admins are global; a moderator is
 * appointed to a game, and a moderator row with no game grants nothing.
 *
 * A **game-scoped write** - a support reply, a moderation review, a staff note
 * - needs more than the tier: it resolves the game from the resource and calls
 * `requireStaff`. The tier is the door; that is the desk.
 *
 * There is deliberately no response filtering by rank. Rank decides which
 * routes a staff member may call, not which fields come back from a route they
 * are allowed to call.
 */
function rankProcedure(minimum: StaffRoleType, tier: ProcedureTier) {
  return authedProcedure.meta({ tier }).use(async ({ ctx, next }) => {
    const role = await getActingStaffRole(ctx.userId)
    if (role === null || RANK[role] < RANK[minimum]) throw new TRPCError({ code: "FORBIDDEN" })
    return next({ ctx: { ...ctx, staff: { userId: ctx.userId, role } } })
  })
}

export const moderatorProcedure = rankProcedure("MODERATOR", "moderator")
export const adminProcedure = rankProcedure("ADMIN", "admin")
export const ownerProcedure = rankProcedure("OWNER", "owner")

/**
 * @deprecated Any staff row, any rank, any game.
 *
 * Now an alias of `moderatorProcedure`, which is what it meant to be: the only
 * behavioural difference is that a malformed `MODERATOR` row - one with no
 * `gameId`, which `assignRole` will not create - no longer satisfies it.
 *
 * Every call site gets an explicit tier in step 5. Until then this keeps the
 * 48 existing uses compiling and slightly tighter than they were.
 */
export const staffProcedure = moderatorProcedure

/**
 * Admin **and** a development build.
 *
 * Five routes exist to make testing bearable and have no business in
 * production: the three `tutorial.dev*` routes, `player.addTestCurrency` and
 * `animal.advanceAge`. They are merely authenticated today, so any alpha player
 * who opens the network tab can grant themselves currency or age an animal.
 *
 * `NOT_FOUND` rather than `FORBIDDEN` on purpose: outside development the route
 * should not appear to exist.
 *
 * There is no override flag. An environment that needs these routes is not a
 * production environment, which is what `NODE_ENV` is for - and a flag that can
 * be set is a flag that will be. `NODE_ENV` unset is therefore also refused, so
 * the development command has to set `NODE_ENV=development` explicitly before
 * the five routes move onto this tier.
 */
export const devProcedure = adminProcedure.meta({ tier: "dev" }).use(({ next }) => {
  if (process.env.NODE_ENV !== "development") throw new TRPCError({ code: "NOT_FOUND" })
  return next()
})
