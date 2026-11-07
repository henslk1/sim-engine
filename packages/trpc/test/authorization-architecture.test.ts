import { test } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { appRouter } from "../src/router.js"
import { router, publicProcedure, authedProcedure, playerProcedure, t, type ProcedureTier } from "../src/trpc.js"
import { ACTING_ACCOUNT_ALLOWLIST, PUBLIC_ROUTE_ALLOWLIST } from "./authorization-allowlists.js"

/**
 * The structural guard for the authorization pass.
 *
 * It walks the **mounted** router rather than grepping the sources. That
 * distinction is not pedantry: `health` is declared inline in `router.ts` and a
 * source scan missed it, which is how the first count of this surface came out
 * at 425 procedures instead of 426.
 *
 * Every invariant has a self-test first - without those, a detector that
 * quietly stopped detecting would make the assertions below pass for the wrong
 * reason, and nobody would notice until something was exploited. The zod walker
 * in particular was wrong once already: reading `.shape` alone found nothing
 * inside `z.union([...])`, which is exactly the shape `runPredictor` uses to
 * take a `playerAccountId`.
 */

type MountedProcedure = {
  _def: {
    type: "query" | "mutation" | "subscription"
    meta?: { tier?: ProcedureTier } | undefined
    inputs: unknown[]
  }
}

const KNOWN_TIERS: readonly ProcedureTier[] = [
  "public",
  "authed",
  "player",
  "animal",
  "animalView",
  "moderator",
  "admin",
  "owner",
  "dev",
  "messaging",
  "channelAdmin",
  "messageModeration",
]

/**
 * The tiers that resolve the acting account from the session.
 *
 * A route on one of these may not take the acting account as an input at all,
 * with no allowlist and no exceptions: having resolved the caller and then
 * accepted a different account is a contradiction, not a migration backlog.
 */
const SESSION_RESOLVED: readonly ProcedureTier[] = [
  "player",
  "animal",
  "animalView",
  "messaging",
  "channelAdmin",
  "messageModeration",
]

/**
 * The tiers where naming an account is a *target*, not a stand-in for the
 * caller. `grantCurrency`, `addNote` and `ban` all name somebody else on
 * purpose, so the rule does not apply to them.
 */
const STAFF_TIERS: readonly ProcedureTier[] = ["moderator", "admin", "owner", "dev"]

/**
 * Input keys that stand in for the caller.
 *
 * Curated rather than matched by pattern, because the distinction the rule
 * turns on is not visible in the spelling: `followerPlayerAccountId` is the
 * caller and `followedPlayerAccountId` is somebody else, one letter apart. A
 * pattern loose enough to catch the first catches the second, and a pattern
 * tight enough to spare the second misses `senderPlayerId`.
 *
 * Add a key here when a route is found taking one. The cost of a missing key is
 * a route that slips through; the cost of a wrong one is a false failure that
 * gets the rule weakened.
 */
const ACTING_ACCOUNT_KEYS = [
  "playerAccountId",
  "userId",
  "senderPlayerId",
  "followerPlayerAccountId",
  "blockerPlayerId",
  "viewerPlayerAccountId",
  "excludePlayerAccountId",
]

function mounted(): Record<string, MountedProcedure> {
  return (appRouter as unknown as { _def: { procedures: Record<string, MountedProcedure> } })._def
    .procedures
}

function procedures(
  built: unknown
): Record<string, MountedProcedure> {
  return (built as { _def: { procedures: Record<string, MountedProcedure> } })._def.procedures
}

function tierOf(procedure: MountedProcedure): string {
  return procedure._def.meta?.tier ?? "UNTAGGED"
}

/**
 * Every key any of a route's input schemas can accept.
 *
 * `.shape` is only present on a plain object schema. Everything a route can
 * legally wrap one in - a union, a discriminated union, an intersection, a
 * `.refine()`, an `.optional()`, a `z.lazy()`, a `.pipe()` - hides it one or
 * more levels down, so the walker descends through all of them and unions what
 * it finds. A union counts a key as accepted if **any** branch accepts it,
 * which is the right reading for a guard: one reachable branch is enough.
 *
 * `seen` guards against a `z.lazy()` cycle rather than against repeated work.
 */
function inputKeys(procedure: MountedProcedure): string[] {
  const found = new Set<string>()
  const seen = new Set<unknown>()

  const walk = (parser: unknown): void => {
    if (!parser || typeof parser !== "object" || seen.has(parser)) return
    seen.add(parser)

    const shape = (parser as { shape?: unknown }).shape
    if (shape && typeof shape === "object") {
      for (const key of Object.keys(shape)) found.add(key)
      return
    }

    const def = (parser as { _def?: Record<string, unknown> })._def
    if (!def) return

    // z.union / z.discriminatedUnion - an array of branches, or a Map of them
    // keyed by discriminator value depending on the zod version.
    const options = def["options"]
    if (Array.isArray(options)) options.forEach(walk)
    else if (options instanceof Map) [...options.values()].forEach(walk)

    // z.intersection (left/right), z.pipeline (in/out), ZodEffects (schema),
    // optional / nullable / default / branded (innerType), z.record (type).
    for (const key of ["schema", "innerType", "left", "right", "in", "out", "type"]) {
      walk(def[key])
    }

    // z.lazy - the schema only exists once the getter is called.
    const getter = def["getter"]
    if (typeof getter === "function") {
      try {
        walk((getter as () => unknown)())
      } catch {
        // A lazy schema that cannot be resolved standalone is not a key source.
      }
    }
  }

  for (const parser of procedure._def.inputs) walk(parser)
  return [...found]
}

/** The acting-account keys a route accepts, or an empty list if it is clean. */
function actingAccountInputs(procedure: MountedProcedure): string[] {
  const tier = tierOf(procedure) as ProcedureTier
  if (STAFF_TIERS.includes(tier)) return []
  return inputKeys(procedure)
    .filter((key) => ACTING_ACCOUNT_KEYS.includes(key))
    .sort()
}

// ---------------------------------------------------------------------------
// The detectors, proved against a router built the same way the real one is.
// ---------------------------------------------------------------------------

test("the detector reads the tier off a mounted procedure", () => {
  const procs = procedures(
    router({
      open: publicProcedure.query(() => 1),
      signedIn: authedProcedure.query(() => 2),
      inGame: playerProcedure.query(() => 3),
      nested: router({ deep: authedProcedure.query(() => 4) }),
      // A route built on the raw builder, bypassing every guard in trpc.ts.
      raw: t.procedure.query(() => 5),
    })
  )

  assert.equal(tierOf(procs["open"]!), "public")
  assert.equal(tierOf(procs["signedIn"]!), "authed")
  assert.equal(tierOf(procs["inGame"]!), "player")
  // Inheritance through a nested router is the case that makes walking the
  // mounted router worth it at all.
  assert.equal(tierOf(procs["nested.deep"]!), "authed")
  assert.equal(tierOf(procs["raw"]!), "UNTAGGED")
})

test("the zod walker finds keys through every wrapper a route can use", () => {
  type Rec = z.ZodType<{ playerAccountId?: string }>
  const lazy: Rec = z.lazy(() => z.object({ playerAccountId: z.string() })) as Rec

  const procs = procedures(
    router({
      plain: authedProcedure.input(z.object({ playerAccountId: z.string() })).query(() => 0),
      // The shape runPredictor actually uses: the key is in one branch only.
      union: authedProcedure
        .input(
          z.union([
            z.object({ offerId: z.string() }),
            z.object({ sireId: z.string(), playerAccountId: z.string() }),
          ])
        )
        .query(() => 0),
      discriminated: authedProcedure
        .input(
          z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("a"), gameId: z.string() }),
            z.object({ kind: z.literal("b"), playerAccountId: z.string() }),
          ])
        )
        .query(() => 0),
      refined: authedProcedure
        .input(z.object({ playerAccountId: z.string() }).refine(() => true))
        .query(() => 0),
      optional: authedProcedure
        .input(z.object({ playerAccountId: z.string() }).optional())
        .query(() => 0),
      intersected: authedProcedure
        .input(z.intersection(z.object({ a: z.string() }), z.object({ playerAccountId: z.string() })))
        .query(() => 0),
      lazy: authedProcedure.input(lazy).query(() => 0),
      // Two separate .input() calls, which tRPC keeps as separate parsers.
      stacked: playerProcedure.input(z.object({ playerAccountId: z.string() })).query(() => 0),
      clean: authedProcedure.input(z.object({ animalId: z.string() })).query(() => 0),
    })
  )

  for (const path of [
    "plain",
    "union",
    "discriminated",
    "refined",
    "optional",
    "intersected",
    "lazy",
    "stacked",
  ]) {
    assert.deepEqual(
      actingAccountInputs(procs[path]!),
      ["playerAccountId"],
      `the walker missed the key inside "${path}"`
    )
  }
  assert.deepEqual(actingAccountInputs(procs["clean"]!), [])
  // playerProcedure's own gameId must still be visible, and must not be
  // mistaken for an acting-account input.
  assert.ok(inputKeys(procs["stacked"]!).includes("gameId"))
})

test("the detector knows a target account from a stand-in for the caller", () => {
  const procs = procedures(
    router({
      sender: authedProcedure.input(z.object({ senderPlayerId: z.string() })).mutation(() => 0),
      follower: authedProcedure
        .input(z.object({ followerPlayerAccountId: z.string() }))
        .mutation(() => 0),
      // One letter apart from the key above, and the opposite answer.
      followed: authedProcedure
        .input(z.object({ followedPlayerAccountId: z.string() }))
        .mutation(() => 0),
      recipient: authedProcedure.input(z.object({ recipientPlayerId: z.string() })).mutation(() => 0),
    })
  )

  assert.deepEqual(actingAccountInputs(procs["sender"]!), ["senderPlayerId"])
  assert.deepEqual(actingAccountInputs(procs["follower"]!), ["followerPlayerAccountId"])
  assert.deepEqual(actingAccountInputs(procs["followed"]!), [])
  assert.deepEqual(actingAccountInputs(procs["recipient"]!), [])
})

// ---------------------------------------------------------------------------
// The invariants.
// ---------------------------------------------------------------------------

test("every mounted procedure resolves to a known tier", () => {
  const untagged = Object.entries(mounted())
    .filter(([, p]) => !KNOWN_TIERS.includes(tierOf(p) as ProcedureTier))
    .map(([path, p]) => `${path} (${tierOf(p)})`)

  assert.deepEqual(untagged, [], "a route built on a raw t.procedure skips every guard in trpc.ts")
})

test("the public routes are exactly the ones written down", () => {
  const live = Object.entries(mounted())
    .filter(([, p]) => tierOf(p) === "public")
    .map(([path]) => path)
    .sort()
  const allowed = [...PUBLIC_ROUTE_ALLOWLIST].sort()

  const added = live.filter((path) => !allowed.includes(path))
  const stale = allowed.filter((path) => !live.includes(path))

  assert.deepEqual(added, [], "a new publicProcedure route has to be written down on purpose")
  assert.deepEqual(stale, [], "a route that has moved off publicProcedure must lose its line here")
})

test("no session-resolved route accepts the acting account as an input", () => {
  // No allowlist. A route whose tier resolves the caller and whose input names
  // an account to act as is self-contradictory, and migrating a route into that
  // state is the mistake this catches.
  const offences = Object.entries(mounted())
    .filter(([, p]) => SESSION_RESOLVED.includes(tierOf(p) as ProcedureTier))
    .map(([path, p]) => ({ path, keys: actingAccountInputs(p) }))
    .filter(({ keys }) => keys.length > 0)
    .map(({ path, keys }) => `${path}: ${keys.join(", ")}`)

  assert.deepEqual(offences, [])
})

test("the routes still taking an acting account are exactly the ones written down", () => {
  // The ratchet for the routes that have not migrated yet. Resource-keyed
  // routes on authedProcedure that resolve the player inside the handler are
  // caught here - they are the predictor's shape and the friend-request
  // shape, and the tier alone says nothing about them.
  const live = Object.entries(mounted())
    .filter(([, p]) => actingAccountInputs(p).length > 0)
    .map(([path]) => path)
    .sort()
  const allowed = [...ACTING_ACCOUNT_ALLOWLIST].sort()

  const added = live.filter((path) => !allowed.includes(path))
  const stale = allowed.filter((path) => !live.includes(path))

  assert.deepEqual(added, [], "a new route taking the acting account has to be written down")
  assert.deepEqual(stale, [], "a route that stopped taking it must lose its line here")
})
