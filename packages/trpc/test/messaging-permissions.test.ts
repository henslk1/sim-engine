import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

// Substitute the database before loading the evaluator, the same way the
// tutorial tests do. Nothing here may reach a real row.
type StaffRow = { role: "OWNER" | "ADMIN" | "MODERATOR"; gameId: string | null }
type ChannelRow = {
  id: string
  gameId: string
  channelType: "TEXT" | "ANNOUNCEMENT" | "DM"
  name: string | null
  defaultCanPost: boolean
  isArchived: boolean
  server: { id: string; serverType: "GLOBAL" | "GROUP"; isArchived: boolean } | null
  directMessage: { id: string; participantLowId: string; participantHighId: string } | null
}

const state = {
  activeBans: 0,
  player: null as { id: string; username: string } | null,
  staffRows: [] as StaffRow[],
  channel: null as ChannelRow | null,
  blocks: 0,
  targetPlayer: null as { id: string } | null,
}

// The staff query is the one piece of real filtering under test, so this mock
// applies the where clause rather than returning every row.
function matchStaff(where: {
  OR: ({ role?: { in: string[] } } & { role?: string; gameId?: string })[]
}): StaffRow[] {
  return state.staffRows.filter(row =>
    where.OR.some(clause => {
      if (typeof clause.role === "object" && clause.role !== null) {
        return (clause.role as { in: string[] }).in.includes(row.role)
      }
      return clause.role === row.role && clause.gameId === row.gameId
    })
  )
}

const db = {
  banRecord: { count: async () => state.activeBans },
  playerAccount: {
    findUnique: async () => state.player,
    findFirst: async () => state.targetPlayer,
  },
  staffRole: {
    findMany: async ({ where }: { where: Parameters<typeof matchStaff>[0] }) => matchStaff(where),
  },
  chatChannel: { findUnique: async () => state.channel },
  blockedPlayer: { count: async () => state.blocks },
}
Object.assign(globalThis, { prisma: db })

const {
  resolveActor,
  loadViewableChannel,
  evaluatePosting,
  canManageChannels,
  canModerateMessages,
  canOpenDirectMessage,
  canonicalDirectMessagePair,
} = await import("../src/messaging/index.ts")

const GAME = "game-1"
const ME = "player-me"
const THEM = "player-them"

const actor = (staffRole: StaffRow["role"] | null = null) => ({
  userId: "user-me",
  gameId: GAME,
  playerAccountId: ME,
  username: "me",
  staffRole,
})

const globalChannel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: "channel-general",
  gameId: GAME,
  channelType: "TEXT",
  name: "general",
  defaultCanPost: true,
  isArchived: false,
  server: { id: "server-global", serverType: "GLOBAL", isArchived: false },
  directMessage: null,
  ...over,
})

const dmChannel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: "channel-dm",
  gameId: GAME,
  channelType: "DM",
  name: null,
  defaultCanPost: true,
  isArchived: false,
  server: null,
  directMessage: { id: "dm-1", participantLowId: ME, participantHighId: THEM },
  ...over,
})

beforeEach(() => {
  state.activeBans = 0
  state.player = { id: ME, username: "me" }
  state.staffRows = []
  state.channel = null
  state.blocks = 0
  state.targetPlayer = { id: THEM }
})

// ── Who is acting ────────────────────────────────────────────────────────────

test("an active ban denies the actor even with a valid player account", async () => {
  state.activeBans = 1
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.code, "BANNED")
})

test("a user with no character in the game is denied", async () => {
  state.player = null
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok === false && result.code, "NO_PLAYER_ACCOUNT")
})

test("the strongest staff row wins when a user holds several", async () => {
  state.staffRows = [{ role: "MODERATOR", gameId: GAME }, { role: "ADMIN", gameId: null }]
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok, true)
  assert.equal(result.ok === true && result.value.staffRole, "ADMIN")
})

test("no staff rows resolves to no role", async () => {
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok === true && result.value.staffRole, null)
})

// ── How the two tiers are scoped ─────────────────────────────────────────────

test("an admin counts in every game, because admins are global", async () => {
  state.staffRows = [{ role: "ADMIN", gameId: null }]
  const result = await resolveActor("user-me", "some-other-game")
  assert.equal(result.ok === true && result.value.staffRole, "ADMIN")
})

test("a moderator of another game counts for nothing here", async () => {
  state.staffRows = [{ role: "MODERATOR", gameId: "game-2" }]
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok === true && result.value.staffRole, null)
})

test("a moderator of this game counts", async () => {
  state.staffRows = [{ role: "MODERATOR", gameId: GAME }]
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok === true && result.value.staffRole, "MODERATOR")
})

test("a moderator row with no game grants nothing rather than everything", async () => {
  state.staffRows = [{ role: "MODERATOR", gameId: null }]
  const result = await resolveActor("user-me", GAME)
  assert.equal(result.ok === true && result.value.staffRole, null)
})

// ── Staff scope ──────────────────────────────────────────────────────────────

test("channel management requires admin or owner, not moderator", () => {
  assert.equal(canManageChannels(actor("MODERATOR")).ok, false)
  assert.equal(canManageChannels(actor("ADMIN")).ok, true)
  assert.equal(canManageChannels(actor("OWNER")).ok, true)
  assert.equal(canManageChannels(actor(null)).ok, false)
})

test("message moderation accepts moderator and up", () => {
  assert.equal(canModerateMessages(actor(null)).ok, false)
  assert.equal(canModerateMessages(actor("MODERATOR")).ok, true)
  assert.equal(canModerateMessages(actor("OWNER")).ok, true)
})

// ── Seeing a channel ─────────────────────────────────────────────────────────

test("a channel belonging to another game is reported as not found", async () => {
  state.channel = globalChannel({ gameId: "game-2" })
  const result = await loadViewableChannel(actor(), "channel-general")
  assert.equal(result.ok === false && result.code, "CHANNEL_NOT_FOUND")
})

test("a non-participant is told a DM does not exist, not that it is forbidden", async () => {
  state.channel = dmChannel({ directMessage: { id: "dm-2", participantLowId: "a", participantHighId: "b" } })
  const result = await loadViewableChannel(actor(), "channel-dm")
  // Anything other than NOT_FOUND would confirm the conversation is real.
  assert.equal(result.ok === false && result.code, "CHANNEL_NOT_FOUND")
})

test("group server channels are refused until group chat ships", async () => {
  state.channel = globalChannel({ server: { id: "server-group", serverType: "GROUP", isArchived: false } })
  const result = await loadViewableChannel(actor(), "channel-general")
  assert.equal(result.ok === false && result.code, "GROUP_CHAT_UNAVAILABLE")
})

test("an archived channel still loads, because archiving preserves history", async () => {
  state.channel = globalChannel({ isArchived: true })
  const result = await loadViewableChannel(actor(), "channel-general")
  assert.equal(result.ok, true)
})

// ── Posting ──────────────────────────────────────────────────────────────────

const loadAccess = async (who = actor()) => {
  const result = await loadViewableChannel(who, state.channel?.id ?? "")
  assert.equal(result.ok, true)
  if (result.ok !== true) throw new Error("unreachable")
  return result.value
}

test("an ordinary player cannot post to a read-only channel, but a moderator can", async () => {
  state.channel = globalChannel({ channelType: "ANNOUNCEMENT", defaultCanPost: false })
  const access = await loadAccess()
  const denied = evaluatePosting(actor(), access)
  assert.equal(denied.ok, false)
  assert.equal(denied.ok === false && denied.code, "STAFF_ONLY")
  assert.equal(denied.ok === false && denied.message, "Only staff can post here")
  assert.equal(evaluatePosting(actor("MODERATOR"), access).ok, true)
})

test("nobody posts to an archived channel, including an owner", async () => {
  state.channel = globalChannel({ isArchived: true })
  const access = await loadAccess()
  const result = evaluatePosting(actor("OWNER"), access)
  assert.equal(result.ok === false && result.code, "CHANNEL_ARCHIVED")
})

test("an archived server closes its channels even when the channel itself is open", async () => {
  state.channel = globalChannel({ server: { id: "server-global", serverType: "GLOBAL", isArchived: true } })
  const access = await loadAccess()
  const result = evaluatePosting(actor(), access)
  assert.equal(result.ok === false && result.code, "CHANNEL_ARCHIVED")
})

test("a block leaves the DM readable but not writable, without naming the blocker", async () => {
  state.channel = dmChannel()
  state.blocks = 1
  const access = await loadAccess()
  assert.equal(access.blockedEitherWay, true)
  const result = evaluatePosting(actor(), access)
  assert.equal(result.ok === false && result.code, "BLOCKED")
  assert.equal(result.ok === false && result.message, "You can't reply to this conversation")
})

test("an unblocked participant can post to their DM", async () => {
  state.channel = dmChannel()
  const access = await loadAccess()
  assert.equal(evaluatePosting(actor(), access).ok, true)
})

// ── Opening a DM ─────────────────────────────────────────────────────────────

test("every refusal to open a DM looks identical from outside", async () => {
  const messages = new Set<string>()
  const codes = new Set<string>()

  const self = await canOpenDirectMessage(actor(), ME)
  state.targetPlayer = null
  const missing = await canOpenDirectMessage(actor(), "player-ghost")
  state.targetPlayer = { id: THEM }
  state.blocks = 1
  const blocked = await canOpenDirectMessage(actor(), THEM)

  for (const result of [self, missing, blocked]) {
    assert.equal(result.ok, false)
    if (result.ok === false) {
      messages.add(result.message)
      codes.add(result.code)
    }
  }
  // Three different reasons, one indistinguishable answer.
  assert.equal(messages.size, 1)
  assert.equal(codes.size, 1)
})

test("refusals still record internally which rule fired", async () => {
  state.blocks = 1
  const result = await canOpenDirectMessage(actor(), THEM)
  assert.equal(result.ok === false && result.detail, "blocked in one direction or the other")
})

test("any player may open a DM with any other when nothing blocks it", async () => {
  const result = await canOpenDirectMessage(actor(), THEM)
  assert.equal(result.ok, true)
})

// ── Canonical pairs ──────────────────────────────────────────────────────────

test("reversed participant order resolves to the same pair", () => {
  const forward = canonicalDirectMessagePair("player-a", "player-z")
  const backward = canonicalDirectMessagePair("player-z", "player-a")
  assert.deepEqual(forward, backward)
  assert.equal(forward.participantLowId, "player-a")
  assert.equal(forward.participantHighId, "player-z")
})
