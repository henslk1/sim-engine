import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

// The channel list, history pagination and channel administration.
//
// Same substitution as the other messaging suites — no real row is reachable
// from here — but with one difference that matters: the chatMessage.findMany
// double actually applies `where`, `orderBy` and `take`. Several of the tests
// below exist to prove that a filter is correct, and a double that ignored
// filters would make every one of them pass for the wrong reason.

type ChannelRow = {
  id: string
  gameId: string
  serverId: string | null
  channelType: "TEXT" | "ANNOUNCEMENT" | "DM"
  name: string | null
  description: string | null
  displayOrder: number | null
  defaultCanPost: boolean
  isArchived: boolean
  server: { id: string; serverType: "GLOBAL" | "GROUP"; isArchived: boolean } | null
  directMessage: { id: string; participantLowId: string; participantHighId: string } | null
}

type MessageRow = {
  id: string
  gameId: string
  channelId: string
  authorPlayerId: string
  clientMessageId: string
  content: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedByPlayerId: string | null
  authorPlayer: { username: string }
}

type ReadStatusRow = {
  chatChannelId: string
  lastReadMessage: { createdAt: Date } | null
}

const GAME = "game-1"
const ME = "player-me"
const THEM = "player-them"
const SERVER = "server-global"
const GENERAL = "channel-general"
const ANNOUNCE = "channel-announcements"

const state = {
  server: null as { id: string; name: string; description: string | null; isArchived: boolean } | null,
  channels: [] as ChannelRow[],
  messages: [] as MessageRow[],
  readStatuses: [] as ReadStatusRow[],
  emitted: [] as { room: string; event: string; payload: unknown }[],
  logged: [] as string[],
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; data: Record<string, unknown> }[],
}

// --- a very small slice of Prisma's query language -------------------------
// Only the operators the code under test actually uses. Anything else throws,
// so a future query that this cannot answer fails loudly instead of quietly
// matching everything.

type Where = Record<string, unknown>

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime()
  if (typeof condition === "object") {
    for (const [op, operand] of Object.entries(condition as Record<string, unknown>)) {
      const left = value instanceof Date ? value.getTime() : value
      const right = operand instanceof Date ? operand.getTime() : operand
      if (op === "not" && left === right) return false
      else if (op === "gt" && !((left as number) > (right as number))) return false
      else if (op === "lt" && !((left as number) < (right as number))) return false
      else if (op === "in" && !(operand as unknown[]).includes(value)) return false
      else if (!["not", "gt", "lt", "in"].includes(op)) throw new Error(`unsupported operator: ${op}`)
    }
    return true
  }
  return value === condition
}

function matches(row: Record<string, unknown>, where: Where): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      if (!(condition as Where[]).some(branch => matches(row, branch))) return false
      continue
    }
    if (!matchesField(row[key], condition)) return false
  }
  return true
}

function compare(a: Record<string, unknown>, b: Record<string, unknown>, orderBy: unknown): number {
  const clauses = Array.isArray(orderBy) ? orderBy : orderBy === undefined ? [] : [orderBy]
  for (const clause of clauses as Record<string, "asc" | "desc">[]) {
    for (const [field, direction] of Object.entries(clause)) {
      const left = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field]
      const right = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field]
      if (left === right) continue
      // Prisma puts nulls last in an ascending order, and so does Postgres.
      if (left === null) return 1
      if (right === null) return -1
      const sign = (left as number) < (right as number) ? -1 : 1
      return direction === "desc" ? -sign : sign
    }
  }
  return 0
}

function query<T extends Record<string, unknown>>(
  rows: T[],
  args: { where?: Where; orderBy?: unknown; take?: number } = {}
): T[] {
  const filtered = args.where ? rows.filter(row => matches(row, args.where!)) : [...rows]
  const sorted = args.orderBy ? filtered.sort((a, b) => compare(a, b, args.orderBy)) : filtered
  return args.take === undefined ? sorted : sorted.slice(0, args.take)
}

const db = {
  chatServer: { findUnique: async () => state.server },
  chatChannel: {
    // Returns the whole row rather than only the selected fields. Harmless
    // here: nothing under test asserts that an unselected field is absent.
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where["id"] === "string") {
        return state.channels.find(channel => channel.id === where["id"]) ?? null
      }
      const key = where["serverId_name"] as { serverId: string; name: string } | undefined
      if (!key) return null
      return (
        state.channels.find(c => c.serverId === key.serverId && c.name === key.name) ?? null
      )
    },
    findMany: async (args: { where?: Where; orderBy?: unknown } = {}) => query(state.channels, args),
    count: async ({ where }: { where: Where }) => query(state.channels, { where }).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      state.created.push(data)
      const row: ChannelRow = {
        id: `channel-new-${state.created.length}`,
        gameId: data["gameId"] as string,
        serverId: (data["serverId"] as string) ?? null,
        channelType: data["channelType"] as ChannelRow["channelType"],
        name: (data["name"] as string) ?? null,
        description: (data["description"] as string) ?? null,
        displayOrder: (data["displayOrder"] as number) ?? null,
        defaultCanPost: data["defaultCanPost"] as boolean,
        isArchived: false,
        server: { id: SERVER, serverType: "GLOBAL", isArchived: false },
        directMessage: null,
      }
      state.channels.push(row)
      return row
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = state.channels.findIndex(channel => channel.id === where.id)
      if (index === -1) throw new Error("no such channel")
      state.updated.push({ id: where.id, data })
      const next = { ...state.channels[index]!, ...data } as ChannelRow
      state.channels[index] = next
      return next
    },
  },
  messageReadStatus: {
    findMany: async () => state.readStatuses,
    upsert: async () => ({}),
  },
  chatMessage: {
    findMany: async (args: { where?: Where; orderBy?: unknown; take?: number } = {}) =>
      query(state.messages, args),
    findUnique: async ({ where }: { where: { id: string } }) =>
      state.messages.find(message => message.id === where.id) ?? null,
  },
  blockedPlayer: { count: async () => 0 },
  adminActionLog: {
    create: async ({ data }: { data: { action: string } }) => {
      state.logged.push(data.action)
      return {}
    },
  },
  // Both forms. The message service passes a callback; reorderChannels passes an
  // array of already-issued updates.
  $transaction: async (work: unknown) =>
    typeof work === "function"
      ? (work as (tx: unknown) => Promise<unknown>)(db)
      : Promise.all(work as Promise<unknown>[]),
}
Object.assign(globalThis, { prisma: db })

const { loadMessagingOverview, UNREAD_BADGE_CAP } = await import("../src/messaging/channels.ts")
const { loadHistory } = await import("../src/messaging/messages.ts")
const { createChannel, updateChannel, setChannelArchived, reorderChannels } = await import(
  "../src/messaging/channel-admin.ts"
)

const realtime = {
  emitToPlayer: (gameId: string, playerId: string, event: string, payload: unknown) =>
    void state.emitted.push({ room: `player:${gameId}:${playerId}`, event, payload }),
  emitToChannel: (channelId: string, event: string, payload: unknown) =>
    void state.emitted.push({ room: `channel:${channelId}`, event, payload }),
  emitToGame: (gameId: string, event: string, payload: unknown) =>
    void state.emitted.push({ room: `game:${gameId}`, event, payload }),
  disconnectUser: () => {},
}

const actor = (staffRole: "OWNER" | "ADMIN" | "MODERATOR" | null = null) => ({
  userId: "user-me",
  gameId: GAME,
  playerAccountId: ME,
  username: "me",
  staffRole,
})

function channel(over: Partial<ChannelRow> = {}): ChannelRow {
  return {
    id: GENERAL,
    gameId: GAME,
    serverId: SERVER,
    channelType: "TEXT",
    name: "general",
    description: null,
    displayOrder: 0,
    defaultCanPost: true,
    isArchived: false,
    server: { id: SERVER, serverType: "GLOBAL", isArchived: false },
    directMessage: null,
    ...over,
  }
}

let nextMessage = 0
function message(over: Partial<MessageRow> = {}): MessageRow {
  nextMessage += 1
  return {
    id: `message-${nextMessage}`,
    gameId: GAME,
    channelId: GENERAL,
    authorPlayerId: THEM,
    clientMessageId: `client-${nextMessage}`,
    content: `message ${nextMessage}`,
    // One minute apart, so ordering is unambiguous unless a test says otherwise.
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, nextMessage)),
    editedAt: null,
    deletedAt: null,
    deletedByPlayerId: null,
    authorPlayer: { username: "them" },
    ...over,
  }
}

function seed(count: number, over: Partial<MessageRow> = {}) {
  for (let i = 0; i < count; i += 1) state.messages.push(message(over))
}

beforeEach(() => {
  state.server = { id: SERVER, name: "Global", description: null, isArchived: false }
  state.channels = [channel()]
  state.messages = []
  state.readStatuses = []
  state.emitted = []
  state.logged = []
  state.created = []
  state.updated = []
  nextMessage = 0
})

// --- unread counting -------------------------------------------------------

test("a channel that has never been opened counts everything in it", async () => {
  seed(3)
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.unreadCount, 3)
  assert.equal(overview.totalUnread, 3)
})

test("your own messages do not make a channel look unread", async () => {
  seed(2)
  state.messages.push(message({ authorPlayerId: ME }))
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.unreadCount, 2)
})

test("a removed message does not light up the badge", async () => {
  seed(2)
  state.messages.push(message({ deletedAt: new Date() }))
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.unreadCount, 2)
})

test("the unread watermark is the read message's own timestamp, not when it was marked", async () => {
  // The regression this guards. A player reads message one at 12:01 and presses
  // nothing until 12:05; message two arrives at 12:02. Counting from the time
  // they marked it read would swallow message two entirely.
  const first = message({ createdAt: new Date(Date.UTC(2026, 9, 1, 12, 1)) })
  const second = message({ createdAt: new Date(Date.UTC(2026, 9, 1, 12, 2)) })
  state.messages.push(first, second)
  state.readStatuses = [{ chatChannelId: GENERAL, lastReadMessage: { createdAt: first.createdAt } }]

  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.unreadCount, 1)
})

test("the unread count stops at the badge cap", async () => {
  seed(UNREAD_BADGE_CAP + 40)
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.unreadCount, UNREAD_BADGE_CAP + 1)
})

test("the total is the sum across channels", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  seed(2)
  state.messages.push(message({ channelId: ANNOUNCE }))
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.totalUnread, 3)
})

// --- the channel list ------------------------------------------------------

test("an archived channel leaves the list for a player but stays for an admin", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1, isArchived: true }))

  const asPlayer = await loadMessagingOverview(actor())
  assert.deepEqual(asPlayer.channels.map(c => c.name), ["general"])

  const asAdmin = await loadMessagingOverview(actor("ADMIN"))
  assert.deepEqual(asAdmin.channels.map(c => c.name), ["general", "announcements"])
})

test("a read-only channel carries the composer's reason, and staff are not refused", async () => {
  state.channels = [channel({ channelType: "ANNOUNCEMENT", defaultCanPost: false })]

  const asPlayer = await loadMessagingOverview(actor())
  assert.equal(asPlayer.channels[0]?.canPost, false)
  assert.equal(asPlayer.channels[0]?.cannotPostReason, "Only staff can post here")

  const asModerator = await loadMessagingOverview(actor("MODERATOR"))
  assert.equal(asModerator.channels[0]?.canPost, true)
  assert.equal(asModerator.channels[0]?.cannotPostReason, null)
})

test("an archived channel refuses posting even to an owner", async () => {
  state.channels = [channel({ isArchived: true })]
  const overview = await loadMessagingOverview(actor("OWNER"))
  assert.equal(overview.channels[0]?.canPost, false)
  assert.equal(overview.channels[0]?.cannotPostReason, "This channel is archived")
})

test("an archived server closes the composer in every one of its channels", async () => {
  state.server = { id: SERVER, name: "Global", description: null, isArchived: true }
  state.channels = [channel({ server: { id: SERVER, serverType: "GLOBAL", isArchived: true } })]
  const overview = await loadMessagingOverview(actor())
  assert.equal(overview.channels[0]?.canPost, false)
})

test("a game with no chat server returns an empty list rather than failing", async () => {
  state.server = null
  const overview = await loadMessagingOverview(actor())
  assert.deepEqual(overview, { server: null, channels: [], totalUnread: 0 })
})

// --- history ---------------------------------------------------------------

test("the first page is the newest messages, oldest first", async () => {
  seed(5)
  const page = await loadHistory(actor(), { channelId: GENERAL, limit: 3 })
  assert.equal(page.ok, true)
  if (!page.ok) return
  assert.deepEqual(page.value.messages.map(m => m.content), ["message 3", "message 4", "message 5"])
})

test("the cursor walks upward without repeating or skipping", async () => {
  seed(5)
  const first = await loadHistory(actor(), { channelId: GENERAL, limit: 2 })
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.deepEqual(first.value.messages.map(m => m.content), ["message 4", "message 5"])
  assert.notEqual(first.value.nextCursor, null)

  const second = await loadHistory(actor(), {
    channelId: GENERAL,
    limit: 2,
    before: first.value.nextCursor,
  })
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.deepEqual(second.value.messages.map(m => m.content), ["message 2", "message 3"])
})

test("the top of a conversation reports no further pages", async () => {
  seed(2)
  const page = await loadHistory(actor(), { channelId: GENERAL, limit: 5 })
  assert.equal(page.ok, true)
  if (!page.ok) return
  assert.equal(page.value.nextCursor, null)
})

test("messages sharing a timestamp are paged by id, not lost", async () => {
  // The reason the cursor has two fields. Three messages, one instant: a cursor
  // that knew only the timestamp would either return all three again or skip
  // the rest of them.
  const same = new Date(Date.UTC(2026, 9, 1, 12, 0))
  state.messages = [
    message({ id: "message-a", content: "a", createdAt: same }),
    message({ id: "message-b", content: "b", createdAt: same }),
    message({ id: "message-c", content: "c", createdAt: same }),
  ]

  const first = await loadHistory(actor(), { channelId: GENERAL, limit: 2 })
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.deepEqual(first.value.messages.map(m => m.content), ["b", "c"])

  const second = await loadHistory(actor(), {
    channelId: GENERAL,
    limit: 2,
    before: first.value.nextCursor,
  })
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.deepEqual(second.value.messages.map(m => m.content), ["a"])
})

test("a removed message keeps its place in history with an empty body", async () => {
  state.messages = [
    message({ content: "still here" }),
    message({ content: "taken down", deletedAt: new Date(), deletedByPlayerId: "player-mod" }),
  ]
  const page = await loadHistory(actor(), { channelId: GENERAL })
  assert.equal(page.ok, true)
  if (!page.ok) return
  assert.equal(page.value.messages.length, 2)
  assert.equal(page.value.messages[1]?.content, "")
  assert.equal(page.value.messages[1]?.removedBy, "staff")
  // The author stays, so the bubble keeps its name and position.
  assert.equal(page.value.messages[1]?.authorUsername, "them")
})

test("history in another game's channel is refused", async () => {
  state.channels = [channel({ gameId: "game-2" })]
  const page = await loadHistory(actor(), { channelId: GENERAL })
  assert.equal(page.ok, false)
  if (page.ok) return
  assert.equal(page.code, "CHANNEL_NOT_FOUND")
})

// --- channel administration ------------------------------------------------

test("a new channel's name is normalized before it is stored", async () => {
  const result = await createChannel(actor("ADMIN"), realtime, {
    name: "  Testing Feedback!  ",
    channelType: "TEXT",
    defaultCanPost: true,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.name, "testing-feedback")
})

test("a name with nothing left after normalizing is refused", async () => {
  const result = await createChannel(actor("ADMIN"), realtime, {
    name: "###",
    channelType: "TEXT",
    defaultCanPost: true,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_NAME_INVALID")
})

test("a channel name differing only by case is a duplicate", async () => {
  const result = await createChannel(actor("ADMIN"), realtime, {
    name: "General",
    channelType: "TEXT",
    defaultCanPost: true,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_NAME_TAKEN")
})

test("a new channel is announced to the game, not to its own empty room", async () => {
  await createChannel(actor("ADMIN"), realtime, {
    name: "lounge",
    channelType: "TEXT",
    defaultCanPost: true,
  })
  assert.deepEqual(
    state.emitted.map(e => ({ room: e.room, event: e.event })),
    [{ room: `game:${GAME}`, event: "channel:created" }]
  )
  assert.deepEqual(state.logged, ["chat_channel_created"])
})

test("an update leaves out what it was not asked to change", async () => {
  state.channels = [channel({ description: "Everything else." })]
  const result = await updateChannel(actor("ADMIN"), realtime, {
    channelId: GENERAL,
    defaultCanPost: false,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.defaultCanPost, false)
  assert.equal(result.value.name, "general")
  assert.equal(result.value.description, "Everything else.")
  // Only the field that was sent reaches the database.
  assert.deepEqual(state.updated[0]?.data, { defaultCanPost: false })
})

test("renaming a channel to its own name is not a clash", async () => {
  const result = await updateChannel(actor("ADMIN"), realtime, {
    channelId: GENERAL,
    name: "General",
  })
  assert.equal(result.ok, true)
})

test("renaming onto another channel's name is refused", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await updateChannel(actor("ADMIN"), realtime, {
    channelId: ANNOUNCE,
    name: "general",
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_NAME_TAKEN")
})

test("turning a channel read-only tells the whole game so composers close", async () => {
  await updateChannel(actor("ADMIN"), realtime, { channelId: GENERAL, defaultCanPost: false })
  const event = state.emitted[0]
  assert.equal(event?.room, `game:${GAME}`)
  assert.equal(event?.event, "channel:updated")
  assert.equal((event?.payload as { defaultCanPost: boolean }).defaultCanPost, false)
})

test("archiving and restoring send different events", async () => {
  await setChannelArchived(actor("ADMIN"), realtime, { channelId: GENERAL, isArchived: true })
  assert.equal(state.emitted.at(-1)?.event, "channel:archived")
  await setChannelArchived(actor("ADMIN"), realtime, { channelId: GENERAL, isArchived: false })
  assert.equal(state.emitted.at(-1)?.event, "channel:updated")
  assert.deepEqual(state.logged, ["chat_channel_archived", "chat_channel_restored"])
})

test("a channel in another game cannot be administered", async () => {
  state.channels = [channel({ gameId: "game-2" })]
  const result = await updateChannel(actor("ADMIN"), realtime, { channelId: GENERAL, name: "x" })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_NOT_FOUND")
})

test("a reorder missing a channel is refused", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await reorderChannels(actor("ADMIN"), realtime, { channelIds: [ANNOUNCE] })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_ORDER_INCOMPLETE")
})

test("a reorder that repeats a channel to pad its length is refused", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await reorderChannels(actor("ADMIN"), realtime, {
    channelIds: [ANNOUNCE, ANNOUNCE],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_ORDER_INCOMPLETE")
})

test("a reorder naming a channel from somewhere else is refused", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await reorderChannels(actor("ADMIN"), realtime, {
    channelIds: [GENERAL, "channel-elsewhere"],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CHANNEL_ORDER_INCOMPLETE")
})

test("a reorder writes positions and only announces what actually moved", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await reorderChannels(actor("ADMIN"), realtime, {
    channelIds: [ANNOUNCE, GENERAL],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(
    state.channels.map(c => [c.id, c.displayOrder]),
    [[GENERAL, 1], [ANNOUNCE, 0]]
  )
  // Both ends swapped, so both moved.
  assert.equal(result.value.length, 2)
  assert.equal(state.emitted.length, 2)
  assert.equal(state.emitted.every(e => e.room === `game:${GAME}`), true)
})

test("a reorder that changes nothing writes nothing", async () => {
  state.channels.push(channel({ id: ANNOUNCE, name: "announcements", displayOrder: 1 }))
  const result = await reorderChannels(actor("ADMIN"), realtime, {
    channelIds: [GENERAL, ANNOUNCE],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(state.updated, [])
  assert.deepEqual(state.emitted, [])
  assert.deepEqual(state.logged, [])
})
