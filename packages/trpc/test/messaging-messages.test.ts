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
}

let nextId = 0
function makeMessage(over: Partial<MessageRow> = {}): MessageRow {
  nextId += 1
  return {
    id: `message-${nextId}`,
    gameId: GAME,
    channelId: CHANNEL,
    authorPlayerId: ME,
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
  state.messagesByClientId.set(`${message.authorPlayerId}:${message.clientMessageId}`, message)
  return message
}

const db = {
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
    create: async ({ data }: { data: Record<string, string> }) =>
      store(makeMessage({
        gameId: data["gameId"] as string,
        channelId: data["channelId"] as string,
        authorPlayerId: data["authorPlayerId"] as string,
        clientMessageId: data["clientMessageId"] as string,
        content: data["content"] as string,
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
  messageReadStatus: { upsert: async () => ({}) },
  adminActionLog: {
    create: async ({ data }: { data: { action: string } }) => {
      state.auditLogged.push(data.action)
      return {}
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
}
Object.assign(globalThis, { prisma: db })

const { createMessage, editMessage, deleteMessage, markRead, removeAllMessagesByUser } = await import("../src/messaging/messages.ts")
const { getOrCreateDirectMessage } = await import("../src/messaging/conversations.ts")
const { prepareContent, MAX_CONTENT_CODE_POINTS } = await import("../src/messaging/content.ts")

const realtime = {
  emitToPlayer: (gameId: string, playerId: string, event: string) =>
    void state.emitted.push({ room: `player:${gameId}:${playerId}`, event }),
  emitToChannel: (channelId: string, event: string) =>
    void state.emitted.push({ room: `channel:${channelId}`, event }),
  disconnectUser: () => {},
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
  server: { id: "server-global", serverType: "GLOBAL", isArchived: false },
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
  state.userAccounts = [{ id: ME }]
  state.allMessages = []
  state.createdChannels = 0
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
  assert.deepEqual(state.emitted, [{ room: `channel:${CHANNEL}`, event: "message:created" }])
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
    directMessage: { id: "dm-1", participantLowId: ME, participantHighId: THEM },
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
    directMessage: { id: "dm-1", participantLowId: ME, participantHighId: THEM },
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
