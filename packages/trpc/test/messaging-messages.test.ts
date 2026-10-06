import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

// Same substitution as the permission tests: no real row is reachable from here.
type ChannelRow = {
  id: string
  gameId: string
  channelType: "TEXT" | "ANNOUNCEMENT" | "DM"
  name: string | null
  defaultCanPost: boolean
  isArchived: boolean
  server: { id: string; gameId: string; serverType: "GLOBAL" | "GROUP"; isArchived: boolean } | null
  directMessage: {
    id: string
    gameId: string
    participantLowId: string
    participantHighId: string
    participantLow: { gameId: string }
    participantHigh: { gameId: string }
  } | null
}

type MessageRow = {
  id: string
  gameId: string
  channelId: string
  authorPlayerId: string | null
  authorName: string | null
  clientMessageId: string
  content: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedByPlayerId: string | null
  authorPlayer: { username: string } | null
}

const GAME = "game-1"
const ME = "player-me"
const THEM = "player-them"
const CHANNEL = "channel-general"

const state = {
  channel: null as ChannelRow | null,
  blocks: 0,
  // Keyed by `${authorPlayerId}:${clientMessageId}`
  messagesByClientId: new Map<string, MessageRow>(),
  messagesById: new Map<string, MessageRow>(),
  directMessage: null as { id: string; chatChannelId: string } | null,
  targetPlayer: { id: THEM } as { id: string } | null,
  // Recorded so a test can prove the broadcast happened after the write.
  emitted: [] as { room: string; event: string }[],
  dmActivityBumped: 0,
  auditLogged: [] as string[],
  userAccounts: [{ id: ME }] as { id: string }[],
  allMessages: [] as MessageRow[],
  createdChannels: 0,
  announcementServer: null as {
    announcementChannelId: string | null
    game: { name: string }
  } | null,
  readStatus: null as {
    lastReadMessageId: string
    lastReadAt: Date
    lastReadMessage: { id: string; createdAt: Date }
  } | null,
}

let nextId = 0
function makeMessage(over: Partial<MessageRow> = {}): MessageRow {
  nextId += 1
  return {
    id: `message-${nextId}`,
    gameId: GAME,
    channelId: CHANNEL,
    authorPlayerId: ME,
    authorName: null,
    clientMessageId: `client-${nextId}`,
    content: "hello",
    createdAt: new Date("2026-09-30T12:00:00Z"),
    editedAt: null,
    deletedAt: null,
    deletedByPlayerId: null,
    authorPlayer: { username: "me" },
    ...over,
  }
}

function store(message: MessageRow) {
  state.messagesById.set(message.id, message)
  if (message.authorPlayerId !== null) {
    state.messagesByClientId.set(`${message.authorPlayerId}:${message.clientMessageId}`, message)
  }
  return message
}

const db = {
  chatServer: { findUnique: async () => state.announcementServer },
  chatChannel: {
    findUnique: async () => state.channel,
    create: async () => {
      state.createdChannels += 1
      return { id: `channel-new-${state.createdChannels}` }
    },
  },
  blockedPlayer: { count: async () => state.blocks },
  playerAccount: {
    findFirst: async () => state.targetPlayer,
    findMany: async () => state.userAccounts,
  },
  chatMessage: {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where["id"] === "string") return state.messagesById.get(where["id"]) ?? null
      const key = where["authorPlayerId_clientMessageId"] as
        | { authorPlayerId: string; clientMessageId: string }
        | undefined
      if (!key) return null
      return state.messagesByClientId.get(`${key.authorPlayerId}:${key.clientMessageId}`) ?? null
    },
    create: async ({ data }: { data: Record<string, unknown> }) =>
      store(makeMessage({
        gameId: data["gameId"] as string,
        channelId: data["channelId"] as string,
        authorPlayerId: data["authorPlayerId"] as string | null,
        authorName: (data["authorName"] as string | undefined) ?? null,
        clientMessageId: data["clientMessageId"] as string,
        content: data["content"] as string,
        authorPlayer: data["authorPlayerId"] === null ? null : { username: "me" },
      })),
    findMany: async () => state.allMessages,
    updateMany: async ({ data }: { data: { deletedAt: Date } }) => {
      for (const row of state.allMessages) store({ ...row, deletedAt: data.deletedAt })
      return { count: state.allMessages.length }
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = state.messagesById.get(where.id)
      if (!existing) throw new Error("no such message")
      return store({ ...existing, ...data } as MessageRow)
    },
  },
  directMessage: {
    findUnique: async () => state.directMessage,
    create: async () => ({ id: "dm-new", chatChannelId: "channel-new-1" }),
    update: async () => { state.dmActivityBumped += 1 },
  },
  messageReadStatus: {
    findUnique: async () => state.readStatus,
    upsert: async ({ create, update }: {
      create: { lastReadMessageId: string; lastReadAt: Date }
      update: { lastReadMessageId: string; lastReadAt: Date }
    }) => {
      const next = state.readStatus === null ? create : update
      const message = state.messagesById.get(next.lastReadMessageId)
      if (!message) throw new Error("read target missing")
      state.readStatus = {
        lastReadMessageId: next.lastReadMessageId,
        lastReadAt: next.lastReadAt,
        lastReadMessage: { id: message.id, createdAt: message.createdAt },
      }
      return { lastReadMessageId: next.lastReadMessageId, lastReadAt: next.lastReadAt }
    },
  },
  adminActionLog: {
    create: async ({ data }: { data: { action: string } }) => {
      state.auditLogged.push(data.action)
      return {}
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
}
Object.assign(globalThis, { prisma: db })

const {
  createGameAnnouncement,
  createMessage,
  editMessage,
  deleteMessage,
  markRead,
  removeAllMessagesByUser,
} = await import("../src/messaging/messages.ts")
const { getOrCreateDirectMessage } = await import("../src/messaging/conversations.ts")
const { prepareContent, MAX_CONTENT_CODE_POINTS } = await import("../src/messaging/content.ts")
const { resetMessagingRateLimits } = await import("../src/messaging/rate-limit.ts")

const realtime = {
  emitToPlayer: (gameId: string, playerId: string, event: string) =>
    void state.emitted.push({ room: `player:${gameId}:${playerId}`, event }),
  emitToChannel: (channelId: string, event: string) =>
    void state.emitted.push({ room: `channel:${channelId}`, event }),
  emitToGame: (gameId: string, event: string) =>
    void state.emitted.push({ room: `game:${gameId}`, event }),
  emitMessagingActivity: () =>
    void state.emitted.push({ room: "activity", event: "messaging:activity" }),
  disconnectUser: () => {},
  disconnectGame: () => {},
}

const actor = (staffRole: "OWNER" | "ADMIN" | "MODERATOR" | null = null) => ({
  userId: "user-me",
  gameId: GAME,
  playerAccountId: ME,
  username: "me",
  staffRole,
})

const globalChannel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: CHANNEL,
  gameId: GAME,
  channelType: "TEXT",
  name: "general",
  defaultCanPost: true,
  isArchived: false,
  server: { id: "server-global", gameId: GAME, serverType: "GLOBAL", isArchived: false },
  directMessage: null,
  ...over,
})

beforeEach(() => {
  state.channel = globalChannel()
  state.blocks = 0
  state.messagesByClientId.clear()
  state.messagesById.clear()
  state.directMessage = null
  state.targetPlayer = { id: THEM }
  state.emitted = []
  state.dmActivityBumped = 0
  state.auditLogged = []
  // Limits are module-level counters, so without this the first test to send
  // five messages would silently starve every test after it.
  resetMessagingRateLimits()
  state.userAccounts = [{ id: ME }]
  state.allMessages = []
  state.createdChannels = 0
  state.announcementServer = null
  state.readStatus = null
  nextId = 0
})

// ── Content ──────────────────────────────────────────────────────────────────

test("content is normalized and trimmed before it is measured", () => {
  const result = prepareContent("  hello\r\nworld  ")
  assert.equal(result.ok === true && result.value, "hello\nworld")
})

test("a blank or whitespace-only message is refused", () => {
  for (const raw of ["", "   ", "\r\n\r\n", "\t"]) {
    assert.equal(prepareContent(raw).ok === false && prepareContent(raw).code, "CONTENT_EMPTY")
  }
})

test("the character limit counts code points, not UTF-16 units", () => {
  // Each of these is one code point but two UTF-16 units, so a naive .length
  // check would reject at half the real limit.
  const emoji = "🐴".repeat(MAX_CONTENT_CODE_POINTS)
  assert.equal(prepareContent(emoji).ok, true)
  assert.equal(prepareContent(emoji + "🐴").ok, false)
})

test("a message inside the character limit can still be rejected on bytes", () => {
  // Four bytes each, so 2000 of them is 8000 bytes — under the ceiling. Padding
  // with more multi-byte characters crosses it while staying under 2000 chars.
  const result = prepareContent("🐴".repeat(1999) + "é".repeat(200))
  assert.equal(result.ok === false && result.code, "CONTENT_TOO_LONG")
})

// ── Sending ──────────────────────────────────────────────────────────────────

const send = (over: Partial<{ channelId: string; clientMessageId: string; content: string }> = {}) =>
  createMessage(actor(), realtime, {
    channelId: CHANNEL,
    clientMessageId: "client-abc",
    content: "hello",
    ...over,
  })

test("a message is saved and announced to its channel", async () => {
  const result = await send()
  assert.equal(result.ok, true)
  assert.deepEqual(state.emitted, [
    { room: `channel:${CHANNEL}`, event: "message:created" },
    { room: "activity", event: "messaging:activity" },
  ])
})

test("a broadcast is authored by the game in its configured announcement channel", async () => {
  state.channel = globalChannel({
    channelType: "ANNOUNCEMENT",
    defaultCanPost: false,
  })
  state.announcementServer = {
    announcementChannelId: CHANNEL,
    game: { name: "Horse World" },
  }

  const result = await createGameAnnouncement(actor("ADMIN"), realtime, {
    content: "  Scheduled maintenance tonight.  ",
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.channelId, CHANNEL)
  assert.equal(result.value.authorPlayerId, null)
  assert.equal(result.value.authorUsername, "Horse World")
  assert.equal(result.value.content, "Scheduled maintenance tonight.")
  assert.deepEqual(state.auditLogged, ["chat_announcement_posted"])
  assert.deepEqual(state.emitted.map(event => event.event), [
    "message:created",
    "messaging:activity",
  ])
})

test("resending the same client id returns the original instead of a duplicate", async () => {
  const first = await send()
  state.emitted = []
  const second = await send({ content: "different text entirely" })

  assert.equal(first.ok && second.ok, true)
  assert.equal(first.ok === true && second.ok === true && first.value.id, second.ok === true ? second.value.id : "")
  assert.equal(state.messagesById.size, 1)
  // A retry is not a new event; the room already heard about this message.
  assert.deepEqual(state.emitted, [])
})

test("a retry still succeeds after the channel has been archived", async () => {
  await send()
  state.channel = globalChannel({ isArchived: true })
  const retry = await send()
  assert.equal(retry.ok, true)
})

test("a first send into an archived channel is refused", async () => {
  state.channel = globalChannel({ isArchived: true })
  const result = await send()
  assert.equal(result.ok === false && result.code, "CHANNEL_ARCHIVED")
})

test("a blocked DM refuses the send but the channel still loads", async () => {
  state.channel = globalChannel({
    channelType: "DM",
    server: null,
    directMessage: {
      id: "dm-1",
      gameId: GAME,
      participantLowId: ME,
      participantHighId: THEM,
      participantLow: { gameId: GAME },
      participantHigh: { gameId: GAME },
    },
  })
  state.blocks = 1
  const result = await send()
  assert.equal(result.ok === false && result.code, "BLOCKED")
  assert.deepEqual(state.emitted, [])
})

test("sending into a DM bumps its position in the conversation list", async () => {
  state.channel = globalChannel({
    channelType: "DM",
    server: null,
    directMessage: {
      id: "dm-1",
      gameId: GAME,
      participantLowId: ME,
      participantHighId: THEM,
      participantLow: { gameId: GAME },
      participantHigh: { gameId: GAME },
    },
  })
  await send()
  assert.equal(state.dmActivityBumped, 1)
})

test("a missing or oversized client id is refused before anything is written", async () => {
  for (const clientMessageId of ["", "   ", "x".repeat(101)]) {
    const result = await send({ clientMessageId })
    assert.equal(result.ok === false && result.code, "BAD_CLIENT_ID")
  }
  assert.equal(state.messagesById.size, 0)
})

// ── Editing and deleting ─────────────────────────────────────────────────────

test("only the author may edit", async () => {
  const message = store(makeMessage({ authorPlayerId: THEM }))
  const result = await editMessage(actor("OWNER"), realtime, { messageId: message.id, content: "rewritten" })
  assert.equal(result.ok === false && result.code, "NOT_AUTHOR")
})

test("an author can edit their own message", async () => {
  const message = store(makeMessage())
  const result = await editMessage(actor(), realtime, { messageId: message.id, content: "second thoughts" })
  assert.equal(result.ok === true && result.value.content, "second thoughts")
  assert.equal(result.ok === true && result.value.editedAt !== null, true)
  assert.deepEqual(state.emitted, [{ room: `channel:${CHANNEL}`, event: "message:updated" }])
})

test("a deleted message cannot be edited back into existence", async () => {
  const message = store(makeMessage({ deletedAt: new Date() }))
  const result = await editMessage(actor(), realtime, { messageId: message.id, content: "undelete me" })
  assert.equal(result.ok === false && result.code, "MESSAGE_NOT_FOUND")
})

test("an ordinary player cannot delete someone else's message, a moderator can", async () => {
  const message = store(makeMessage({ authorPlayerId: THEM }))
  assert.equal((await deleteMessage(actor(), realtime, { messageId: message.id })).ok, false)
  assert.equal((await deleteMessage(actor("MODERATOR"), realtime, { messageId: message.id })).ok, true)
})

test("moderation still works in an archived channel", async () => {
  const message = store(makeMessage({ authorPlayerId: THEM }))
  state.channel = globalChannel({ isArchived: true })
  const result = await deleteMessage(actor("MODERATOR"), realtime, { messageId: message.id })
  assert.equal(result.ok, true)
})

test("a removed message keeps its author and loses its text", async () => {
  const message = store(makeMessage({ authorPlayerId: THEM, content: "something abusive" }))
  const result = await deleteMessage(actor("MODERATOR"), realtime, { messageId: message.id })

  assert.equal(result.ok, true)
  if (result.ok !== true) return
  // The bubble keeps its place and its name; only the body is replaced.
  assert.equal(result.value.authorPlayerId, THEM)
  assert.equal(result.value.content, "")
  assert.equal(result.value.removedBy, "staff")
  // The original text is still on the row for reports and moderation history.
  assert.equal(state.messagesById.get(message.id)?.content, "something abusive")
})

test("an author removing their own message is marked as such, not as staff", async () => {
  const message = store(makeMessage())
  const result = await deleteMessage(actor(), realtime, { messageId: message.id })
  assert.equal(result.ok === true && result.value.removedBy, "author")
})

test("staff removal is written to the admin log, a self-removal is not", async () => {
  const mine = store(makeMessage())
  await deleteMessage(actor(), realtime, { messageId: mine.id })
  assert.deepEqual(state.auditLogged, [])

  const theirs = store(makeMessage({ authorPlayerId: THEM }))
  await deleteMessage(actor("MODERATOR"), realtime, { messageId: theirs.id })
  assert.deepEqual(state.auditLogged, ["chat_message_removed"])
})

test("deleting twice lands on the same state rather than an error", async () => {
  const message = store(makeMessage())
  const first = await deleteMessage(actor(), realtime, { messageId: message.id })
  const second = await deleteMessage(actor(), realtime, { messageId: message.id })
  assert.equal(first.ok && second.ok, true)
  // Only the real deletion is announced.
  assert.equal(state.emitted.filter(e => e.event === "message:deleted").length, 1)
})

// ── Removal on ban ───────────────────────────────────────────────────────────

test("a ban removal takes down every message across all of the user's characters", async () => {
  const otherCharacter = "player-me-second-game"
  state.userAccounts = [{ id: ME }, { id: otherCharacter }]
  state.allMessages = [
    makeMessage({ content: "in horse sim" }),
    makeMessage({ authorPlayerId: otherCharacter, channelId: "channel-other", content: "in another game" }),
  ]
  for (const row of state.allMessages) store(row)

  const removed = await removeAllMessagesByUser("user-me", realtime)

  assert.equal(removed, 2)
  // Both channels are told, so nobody is left looking at removed content.
  assert.deepEqual(state.emitted.map(e => e.event), ["message:deleted", "message:deleted"])
  assert.deepEqual(state.emitted.map(e => e.room).sort(), [`channel:${CHANNEL}`, "channel:channel-other"])
})

test("ban removal reads as staff, since no player took it down in a channel", async () => {
  const message = makeMessage()
  state.allMessages = [message]
  store(message)
  await removeAllMessagesByUser("user-me", realtime)
  assert.equal(state.messagesById.get(message.id)?.deletedByPlayerId, null)
})

test("removing messages for a user with no characters is a no-op", async () => {
  state.userAccounts = []
  assert.equal(await removeAllMessagesByUser("user-nobody", realtime), 0)
  assert.deepEqual(state.emitted, [])
})

// ── Read pointers ────────────────────────────────────────────────────────────

test("the read pointer must name a message in that channel", async () => {
  const elsewhere = store(makeMessage({ channelId: "channel-other" }))
  const result = await markRead(actor(), realtime, { channelId: CHANNEL, lastReadMessageId: elsewhere.id })
  assert.equal(result.ok === false && result.code, "MESSAGE_NOT_FOUND")
})

test("marking read notifies only the player's own room", async () => {
  const message = store(makeMessage())
  const result = await markRead(actor(), realtime, { channelId: CHANNEL, lastReadMessageId: message.id })
  assert.equal(result.ok, true)
  assert.deepEqual(state.emitted, [{ room: `player:${GAME}:${ME}`, event: "read:updated" }])
})

test("an older tab cannot move the read pointer backwards", async () => {
  const createdAt = new Date("2026-09-30T12:00:00Z")
  const older = store(makeMessage({ id: "message-a", createdAt }))
  const newer = store(makeMessage({ id: "message-b", createdAt }))

  const advanced = await markRead(actor(), realtime, {
    channelId: CHANNEL,
    lastReadMessageId: newer.id,
  })
  const stale = await markRead(actor(), realtime, {
    channelId: CHANNEL,
    lastReadMessageId: older.id,
  })

  assert.equal(advanced.ok, true)
  assert.equal(stale.ok === true && stale.value.lastReadMessageId, newer.id)
  assert.equal(state.readStatus?.lastReadMessageId, newer.id)
})

// ── Opening conversations ────────────────────────────────────────────────────

test("an existing conversation is returned even when the pair is blocked", async () => {
  state.directMessage = { id: "dm-1", chatChannelId: "channel-dm" }
  state.blocks = 1
  const result = await getOrCreateDirectMessage(actor(), { targetPlayerAccountId: THEM })
  // The history stays reachable; it is the composer that closes.
  assert.equal(result.ok, true)
  assert.equal(result.ok === true && result.value.created, false)
})

test("a blocked pair cannot open a new conversation", async () => {
  state.blocks = 1
  const result = await getOrCreateDirectMessage(actor(), { targetPlayerAccountId: THEM })
  assert.equal(result.ok === false && result.code, "DM_UNAVAILABLE")
  assert.equal(state.createdChannels, 0)
})

test("opening a new conversation creates a channel and a conversation", async () => {
  const result = await getOrCreateDirectMessage(actor(), { targetPlayerAccountId: THEM })
  assert.equal(result.ok === true && result.value.created, true)
  assert.equal(state.createdChannels, 1)
})

// ── Rate limiting ────────────────────────────────────────────────────────────

test("the sixth message in five seconds is refused, the first five are not", async () => {
  for (let i = 0; i < 5; i += 1) {
    const result = await createMessage(actor(), realtime, {
      channelId: CHANNEL,
      clientMessageId: `burst-${i}`,
      content: "hello",
    })
    assert.equal(result.ok, true)
  }

  const over = await createMessage(actor(), realtime, {
    channelId: CHANNEL,
    clientMessageId: "burst-5",
    content: "one too many",
  })
  assert.equal(over.ok, false)
  if (over.ok) return
  assert.equal(over.code, "RATE_LIMITED")
  // The composer shows this, so it has to say when to try again.
  assert.match(over.message, /Try again in \d+ second/)
})

test("retrying a message that is already saved is not charged", async () => {
  // The whole point of the idempotency check running first. A client whose
  // acknowledgement was lost retries; if that retry spent allowance, a flaky
  // connection would rate-limit someone who never sent a second message.
  const first = await createMessage(actor(), realtime, {
    channelId: CHANNEL,
    clientMessageId: "c-retry",
    content: "original",
  })
  assert.equal(first.ok, true)

  for (let i = 0; i < 20; i += 1) {
    const retry = await createMessage(actor(), realtime, {
      channelId: CHANNEL,
      clientMessageId: "c-retry",
      content: "original",
    })
    assert.equal(retry.ok, true)
  }

  // Four of the five are still available, so a genuinely new message lands.
  const fresh = await createMessage(actor(), realtime, {
    channelId: CHANNEL,
    clientMessageId: "c-new",
    content: "a real second message",
  })
  assert.equal(fresh.ok, true)
})

test("a rate-limited send is refused before the channel is even loaded", async () => {
  // Charged ahead of the permission work, so a flood aimed at a channel the
  // sender cannot see still costs them their allowance rather than a database
  // round trip each time.
  for (let i = 0; i < 5; i += 1) {
    await createMessage(actor(), realtime, {
      channelId: CHANNEL,
      clientMessageId: `burst-${i}`,
      content: "hello",
    })
  }
  state.channel = null

  const result = await createMessage(actor(), realtime, {
    channelId: CHANNEL,
    clientMessageId: "burst-5",
    content: "into the void",
  })
  assert.equal(result.ok === false && result.code, "RATE_LIMITED")
})

test("reopening an existing conversation is free, only new ones are charged", async () => {
  // getOrCreateDirectMessage returns early for a conversation that already
  // exists, so the limiter is never reached — which is why `created` is on the
  // return value in the first place.
  state.directMessage = { id: "dm-1", chatChannelId: "channel-dm" }
  for (let i = 0; i < 50; i += 1) {
    const result = await getOrCreateDirectMessage(actor(), { targetPlayerAccountId: THEM })
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.value.created, false)
  }

  // The allowance was never touched, so a genuinely new conversation opens.
  state.directMessage = null
  const created = await getOrCreateDirectMessage(actor(), { targetPlayerAccountId: THEM })
  assert.equal(created.ok, true)
  assert.equal(created.ok && created.value.created, true)
})
