import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server as HttpServer } from "node:http"
import { io as connect, type Socket as ClientSocket } from "socket.io-client"

// Drives the real socket server. The session resolver and the Redis adapter are
// injected, so this needs neither Better Auth nor Redis — everything else, the
// handshake, the per-event revalidation, the sweep and the message service, is
// the production path.

const GAME = "game-1"
const ME = "player-me"
const USER = "user-me"
const SESSION = "session-me"
const CHANNEL = "channel-general"

const state = {
  session: null as { id: string; expiresAt: Date } | null,
  activeBans: 0,
  player: null as { id: string; username: string } | null,
  channel: null as Record<string, unknown> | null,
  messages: new Map<string, Record<string, unknown>>(),
}

let nextMessage = 0

const db = {
  session: {
    findUnique: async () => state.session,
    // The sweep filters on `expiresAt: { gt: now }`, so the double has to apply
    // it. A mock that returned every row regardless would make the expiry test
    // pass for the wrong reason — which is exactly what it caught the first time.
    findMany: async ({ where }: { where?: { expiresAt?: { gt?: Date } } }) => {
      if (!state.session) return []
      const after = where?.expiresAt?.gt
      if (after && state.session.expiresAt <= after) return []
      return [{ id: state.session.id }]
    },
  },
  banRecord: {
    count: async () => state.activeBans,
    findMany: async () => (state.activeBans > 0 ? [{ userId: USER }] : []),
  },
  playerAccount: { findUnique: async () => state.player, findFirst: async () => state.player },
  staffRole: { findMany: async () => [] },
  chatChannel: { findUnique: async () => state.channel },
  blockedPlayer: { count: async () => 0 },
  chatMessage: {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const key = where["authorPlayerId_clientMessageId"] as
        | { authorPlayerId: string; clientMessageId: string }
        | undefined
      if (key) return state.messages.get(`${key.authorPlayerId}:${key.clientMessageId}`) ?? null
      return state.messages.get(where["id"] as string) ?? null
    },
    create: async ({ data }: { data: Record<string, string> }) => {
      nextMessage += 1
      const row = {
        id: `message-${nextMessage}`,
        gameId: data["gameId"],
        channelId: data["channelId"],
        authorPlayerId: data["authorPlayerId"],
        clientMessageId: data["clientMessageId"],
        content: data["content"],
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
        deletedByPlayerId: null,
        authorPlayer: { username: "me" },
      }
      state.messages.set(row.id, row)
      state.messages.set(`${row.authorPlayerId}:${row.clientMessageId}`, row)
      return row
    },
  },
  directMessage: { update: async () => ({}) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
}
Object.assign(globalThis, { prisma: db })

const { initSocket, sweepConnections } = await import("../src/socket.ts")

let httpServer: HttpServer
let server: Awaited<ReturnType<typeof initSocket>>
let url: string

before(async () => {
  httpServer = createServer()
  server = initSocket(httpServer, {
    resolveSession: async (cookieHeader) => {
      // The harness passes the session id as the cookie. Anything else is an
      // unknown session, which is what an expired or revoked one looks like.
      if (!state.session || cookieHeader !== `session=${state.session.id}`) return null
      return { userId: USER, sessionId: state.session.id, expiresAt: state.session.expiresAt }
    },
    attachRedisAdapter: false,
  })
  await new Promise<void>(resolve => httpServer.listen(0, resolve))
  const address = httpServer.address()
  if (address === null || typeof address === "string") throw new Error("no port")
  url = `http://localhost:${address.port}`
})

after(async () => {
  await server.close()
  await new Promise<void>(resolve => httpServer.close(() => resolve()))
})

beforeEach(() => {
  state.session = { id: SESSION, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
  state.activeBans = 0
  state.player = { id: ME, username: "me" }
  state.channel = {
    id: CHANNEL,
    gameId: GAME,
    channelType: "TEXT",
    name: "general",
    defaultCanPost: true,
    minimumStaffRole: null,
    isArchived: false,
    server: { id: "server-global", serverType: "GLOBAL", isArchived: false },
    directMessage: null,
  }
  state.messages.clear()
  nextMessage = 0
})

type Ack = { ok: true; value: unknown } | { ok: false; code: string; message: string }

function open(cookie: string | null): Promise<{ socket: ClientSocket; error: string | null }> {
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    ...(cookie === null ? {} : { extraHeaders: { cookie } }),
  })
  return new Promise(resolve => {
    socket.on("connect", () => resolve({ socket, error: null }))
    socket.on("connect_error", e => resolve({ socket, error: e.message }))
  })
}

function emit(socket: ClientSocket, event: string, payload: unknown): Promise<Ack> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, code: "TIMEOUT", message: "no ack" }), 4000)
    socket.emit(event, payload, (result: Ack) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

const authed = () => open(`session=${SESSION}`)

// Resolves with the first payload of `event`, or null if nothing arrives in
// time. A null is a real answer here: two of the tests below exist to prove
// that a broadcast does *not* reach somebody.
function nextEvent(socket: ClientSocket, event: string, waitMs = 600): Promise<unknown> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), waitMs)
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

test("an unauthenticated socket cannot connect", async () => {
  const { socket, error } = await open(null)
  assert.equal(error, "Unauthorized")
  socket.close()
})

test("an unknown session cannot connect", async () => {
  const { socket, error } = await open("session=someone-elses")
  assert.equal(error, "Unauthorized")
  socket.close()
})

test("an actively banned user cannot connect", async () => {
  state.activeBans = 1
  const { socket, error } = await authed()
  assert.equal(error, "Unauthorized")
  socket.close()
})

test("a valid session connects and can enter its game", async () => {
  const { socket, error } = await authed()
  assert.equal(error, null)
  assert.deepEqual(await emit(socket, "game:enter", { gameId: GAME }), { ok: true, value: null })
  socket.close()
})

test("entering a game joins both the game room and the player room", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })

  // The game room is what channel:created and channel:archived are addressed
  // to. Without it an admin creating a channel reaches nobody, because no
  // client has joined a channel that did not exist a moment ago.
  const inGame = await server.in(`game:${GAME}`).fetchSockets()
  const inPlayer = await server.in(`player:${GAME}:${ME}`).fetchSockets()
  assert.equal(inGame.length, 1)
  assert.equal(inPlayer.length, 1)
  socket.close()
})

test("switching games leaves the previous game's rooms behind", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })
  await emit(socket, "game:enter", { gameId: "game-2" })

  // Otherwise this socket would keep hearing about channels in a game it left.
  assert.equal((await server.in(`game:${GAME}`).fetchSockets()).length, 0)
  assert.equal((await server.in("game:game-2").fetchSockets()).length, 1)
  socket.close()
})

test("revoking the session mid-connection stops the next event and drops the socket", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })

  // What logging out looks like from here: the row is gone.
  state.session = null

  const result = await emit(socket, "channel:join", { channelId: CHANNEL })
  assert.equal(result.ok === false && result.code, "SESSION_INVALID")

  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(socket.connected, false)
  socket.close()
})

test("a ban issued after connecting is caught by the sweep", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })
  assert.equal(socket.connected, true)

  state.activeBans = 1
  await sweepConnections(server)

  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(socket.connected, false)
  socket.close()
})

test("a listening socket whose session expires is dropped without sending anything", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })

  // Expiry rather than revocation: the row is still there, its date is not.
  state.session = { id: SESSION, expiresAt: new Date(Date.now() - 1000) }
  await sweepConnections(server)

  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(socket.connected, false)
  socket.close()
})

test("a channel in another game cannot be joined", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })
  state.channel = { ...state.channel, gameId: "game-2" }

  const result = await emit(socket, "channel:join", { channelId: CHANNEL })
  assert.equal(result.ok === false && result.code, "CHANNEL_NOT_FOUND")
  socket.close()
})

test("a staff-only channel cannot be joined over the socket by a player", async () => {
  // The read gate lives in loadViewableChannel, which channel:join calls — so
  // the socket inherits it rather than restating it. staffRole.findMany returns
  // nothing in this harness, so this connection holds no role.
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })
  state.channel = { ...state.channel, minimumStaffRole: "MODERATOR" }

  const result = await emit(socket, "channel:join", { channelId: CHANNEL })
  assert.equal(result.ok === false && result.code, "CHANNEL_NOT_FOUND")
  socket.close()
})

test("a staff-only channel refuses a message even if a join somehow happened", async () => {
  // Room membership is never treated as proof of access: createMessage calls
  // loadViewableChannel again from scratch.
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })
  await emit(socket, "channel:join", { channelId: CHANNEL })
  state.channel = { ...state.channel, minimumStaffRole: "ADMIN" }

  const result = await emit(socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-staff",
    content: "should not land",
  })
  assert.equal(result.ok === false && result.code, "CHANNEL_NOT_FOUND")
  assert.equal(state.messages.size, 0)
  socket.close()
})

test("sending before entering a game is refused", async () => {
  const { socket } = await authed()
  const result = await emit(socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c1",
    content: "hello",
  })
  assert.equal(result.ok === false && result.code, "NO_GAME")
  socket.close()
})

test("the author comes from the session, not from the payload", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })

  const result = await emit(socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-forged",
    content: "posted as someone else?",
    // All three are ignored. The server never reads them.
    authorPlayerId: "player-victim",
    gameId: "game-2",
    playerAccountId: "player-victim",
  })

  assert.equal(result.ok, true)
  if (result.ok !== true) return
  const saved = result.value as { authorPlayerId: string; gameId: string }
  assert.equal(saved.authorPlayerId, ME)
  assert.equal(saved.gameId, GAME)
  socket.close()
})

test("a message reaches another client that joined the same channel", async () => {
  // The delivery path end to end: one client sends, the service commits, and
  // the broadcast lands on a second connection. Everything either side of this
  // is tested elsewhere; this is the part where chat is actually chat.
  const sender = await authed()
  const listener = await authed()
  await emit(sender.socket, "game:enter", { gameId: GAME })
  await emit(listener.socket, "game:enter", { gameId: GAME })
  await emit(sender.socket, "channel:join", { channelId: CHANNEL })
  await emit(listener.socket, "channel:join", { channelId: CHANNEL })

  const delivered = nextEvent(listener.socket, "message:created")
  await emit(sender.socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-live",
    content: "hello room",
  })

  const payload = (await delivered) as { content: string; authorPlayerId: string } | null
  assert.notEqual(payload, null)
  assert.equal(payload?.content, "hello room")
  assert.equal(payload?.authorPlayerId, ME)
  sender.socket.close()
  listener.socket.close()
})

test("a client that never joined the channel is not sent its messages", async () => {
  const sender = await authed()
  const bystander = await authed()
  await emit(sender.socket, "game:enter", { gameId: GAME })
  await emit(bystander.socket, "game:enter", { gameId: GAME })
  await emit(sender.socket, "channel:join", { channelId: CHANNEL })

  const delivered = nextEvent(bystander.socket, "message:created")
  await emit(sender.socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-scoped",
    content: "only for the room",
  })

  assert.equal(await delivered, null)
  sender.socket.close()
  bystander.socket.close()
})

test("leaving a channel stops its messages arriving", async () => {
  const sender = await authed()
  const leaver = await authed()
  await emit(sender.socket, "game:enter", { gameId: GAME })
  await emit(leaver.socket, "game:enter", { gameId: GAME })
  await emit(sender.socket, "channel:join", { channelId: CHANNEL })
  await emit(leaver.socket, "channel:join", { channelId: CHANNEL })
  await emit(leaver.socket, "channel:leave", { channelId: CHANNEL })

  const delivered = nextEvent(leaver.socket, "message:created")
  await emit(sender.socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-left",
    content: "after leaving",
  })

  assert.equal(await delivered, null)
  sender.socket.close()
  leaver.socket.close()
})

test("a retried client id does not create a second message", async () => {
  const { socket } = await authed()
  await emit(socket, "game:enter", { gameId: GAME })

  const first = await emit(socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-retry",
    content: "original",
  })
  const second = await emit(socket, "message:send", {
    channelId: CHANNEL,
    clientMessageId: "c-retry",
    content: "a different message entirely",
  })

  assert.equal(first.ok && second.ok, true)
  if (first.ok !== true || second.ok !== true) return
  const a = first.value as { id: string; content: string }
  const b = second.value as { id: string; content: string }
  assert.equal(a.id, b.id)
  assert.equal(b.content, "original")
  socket.close()
})
