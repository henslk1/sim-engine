import { Server, type Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { Redis } from "ioredis"
import type { Server as HttpServer } from "node:http"
import { db } from "@sim-engine/db"
import {
  activeBansFilter,
  hasActiveBan,
  loadViewableChannel,
  resolveActor,
  type Denied,
  type MessagingActor,
  type ServerToClientEvent,
} from "@sim-engine/trpc/messaging"
import { auth } from "./auth.js"

// How often already-connected sockets are re-checked against PostgreSQL. This
// is the upper bound on how long a logged-out, expired or banned connection can
// keep receiving broadcasts, so it is a revocation guarantee, not a nicety.
const REVALIDATE_INTERVAL_MS = 60_000

// setTimeout fires immediately for delays above this, which would disconnect
// every socket the moment it connected.
const MAX_TIMEOUT_MS = 2_147_483_647

type Ack = { ok: true } | { ok: false; code: string; message: string }
type AckFn = (result: Ack) => void

type SocketData = {
  userId: string
  sessionId: string
  sessionExpiresAt: Date
  // Set by game:enter. Null until then, which is why channel:join refuses to
  // run before it.
  actor: MessagingActor | null
  channelRooms: Set<string>
  expiryTimer: NodeJS.Timeout | null
}

type ClientToServerEvents = {
  "game:enter": (payload: unknown, ack: AckFn) => void
  "channel:join": (payload: unknown, ack: AckFn) => void
  "channel:leave": (payload: unknown, ack: AckFn) => void
}

type ServerToClientEvents = Record<ServerToClientEvent, (payload: unknown) => void>

export type MessagingServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>
type MessagingSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>

let io: MessagingServer | null = null

// Only the player-facing wording crosses the wire — `detail` stays here, the
// same split the tRPC side makes in denialToTRPCError.
function toAck(denied: Denied): Ack {
  return { ok: false, code: denied.code, message: denied.message }
}

// Socket payloads are whatever the client chose to send. Nothing downstream
// sees a value that has not been through here.
function readId(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

// Is this connection still entitled to be one?
//
// Reads the session row rather than re-checking the handshake cookie, because a
// revoked session is a deleted row while the cookie in hand stays superficially
// valid. Returns false on any failure: an unanswerable question is a no.
async function stillAuthorized(socket: MessagingSocket): Promise<boolean> {
  try {
    const [session, banned] = await Promise.all([
      db.session.findUnique({ where: { id: socket.data.sessionId }, select: { expiresAt: true } }),
      hasActiveBan(socket.data.userId),
    ])
    return session !== null && session.expiresAt > new Date() && !banned
  } catch {
    return false
  }
}

// Wraps every inbound event that does anything durable or privileged.
//
// The handshake proved who this was at one moment. It says nothing about
// whether they logged out, were banned, or had the session revoked since — so
// each event asks again before the handler runs. A socket that fails is not
// merely refused, it is dropped, because nothing it does from here is valid.
function privileged(
  socket: MessagingSocket,
  handler: (payload: unknown) => Promise<Ack>
): (payload: unknown, ack: AckFn) => Promise<void> {
  return async (payload, ack) => {
    const respond: AckFn = typeof ack === "function" ? ack : () => {}

    if (!(await stillAuthorized(socket))) {
      respond({ ok: false, code: "SESSION_INVALID", message: "Your session is no longer valid." })
      socket.disconnect(true)
      return
    }

    try {
      respond(await handler(payload))
    } catch (error) {
      console.error("[socket] handler failed:", error)
      respond({ ok: false, code: "INTERNAL", message: "Something went wrong." })
    }
  }
}

function leaveGameRooms(socket: MessagingSocket) {
  const previous = socket.data.actor
  if (previous) socket.leave(`player:${previous.gameId}:${previous.playerAccountId}`)
  for (const channelId of socket.data.channelRooms) socket.leave(`channel:${channelId}`)
  socket.data.channelRooms.clear()
}

function registerHandlers(socket: MessagingSocket) {
  socket.on("game:enter", privileged(socket, async (payload) => {
    const gameId = readId(payload, "gameId")
    if (!gameId) return { ok: false, code: "BAD_PAYLOAD", message: "A game is required." }

    const decision = await resolveActor(socket.data.userId, gameId)
    if (!decision.ok) return toAck(decision)

    // Switching games has to drop the old game's rooms, or this socket would
    // keep receiving player events for a game it has left.
    leaveGameRooms(socket)
    socket.data.actor = decision.value
    socket.join(`player:${gameId}:${decision.value.playerAccountId}`)
    return { ok: true }
  }))

  socket.on("channel:join", privileged(socket, async (payload) => {
    const channelId = readId(payload, "channelId")
    if (!channelId) return { ok: false, code: "BAD_PAYLOAD", message: "A channel is required." }

    const actor = socket.data.actor
    if (!actor) return { ok: false, code: "NO_GAME", message: "Enter a game before joining a channel." }

    // A fresh access check, not a cached one. Room membership is a consequence
    // of access; it is never treated as evidence of it.
    const decision = await loadViewableChannel(actor, channelId)
    if (!decision.ok) return toAck(decision)

    socket.join(`channel:${channelId}`)
    socket.data.channelRooms.add(channelId)
    return { ok: true }
  }))

  socket.on("channel:leave", privileged(socket, async (payload) => {
    const channelId = readId(payload, "channelId")
    if (!channelId) return { ok: false, code: "BAD_PAYLOAD", message: "A channel is required." }
    socket.leave(`channel:${channelId}`)
    socket.data.channelRooms.delete(channelId)
    return { ok: true }
  }))
}

// Walks this instance's own sockets. Every instance runs its own sweep, so all
// connections are covered without coordinating through Redis — deliberately, so
// the backstop does not share a failure mode with the mechanism it backs up.
async function sweep(server: MessagingServer) {
  const sockets = [...server.sockets.sockets.values()]
  if (sockets.length === 0) return

  // One query per sweep rather than per socket: several tabs share a session,
  // and a session belongs to one user.
  const sessionIds = [...new Set(sockets.map(s => s.data.sessionId))]
  const userIds = [...new Set(sockets.map(s => s.data.userId))]

  try {
    const now = new Date()
    const [liveSessions, activeBans] = await Promise.all([
      db.session.findMany({
        where: { id: { in: sessionIds }, expiresAt: { gt: now } },
        select: { id: true },
      }),
      db.banRecord.findMany({ where: activeBansFilter(userIds, now), select: { userId: true } }),
    ])

    const live = new Set(liveSessions.map(s => s.id))
    const banned = new Set(activeBans.map(b => b.userId))

    for (const socket of sockets) {
      if (!live.has(socket.data.sessionId) || banned.has(socket.data.userId)) socket.disconnect(true)
    }
  } catch (error) {
    // Unlike the handshake and the per-event check, this one fails open. A
    // transient database error is not grounds for disconnecting everybody, and
    // writes are still gated by the per-event check in the meantime.
    console.error("[socket] revalidation sweep failed:", error)
  }
}

export function initSocket(httpServer: HttpServer) {
  const server: MessagingServer = new Server(httpServer, {
    cors: {
      origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
      credentials: true,
    },
  })

  const pubClient = new Redis(process.env["REDIS_URL"]!)
  const subClient = pubClient.duplicate()
  server.adapter(createAdapter(pubClient, subClient))

  server.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie
      if (!cookieHeader) return next(new Error("Unauthorized"))

      const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) })
      if (!session) return next(new Error("Unauthorized"))
      if (await hasActiveBan(session.user.id)) return next(new Error("Unauthorized"))

      socket.data.userId = session.user.id
      socket.data.sessionId = session.session.id
      socket.data.sessionExpiresAt = new Date(session.session.expiresAt)
      socket.data.actor = null
      socket.data.channelRooms = new Set()
      socket.data.expiryTimer = null
      next()
    } catch (error) {
      // Fail closed. If the session or ban lookup cannot complete, refuse the
      // connection rather than admit one nobody could verify. The client is
      // told to retry rather than to re-authenticate.
      console.error("[socket] handshake validation failed:", error)
      next(new Error("AuthUnavailable"))
    }
  })

  server.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`)

    // The handshake is a moment, not a lease. Without this, a socket that
    // connected just before its session expired would stay connected for as
    // long as it liked. When a session outlives the timer ceiling the sweep
    // still catches it, so the clamp costs nothing.
    const untilExpiry = socket.data.sessionExpiresAt.getTime() - Date.now()
    socket.data.expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.min(Math.max(untilExpiry, 0), MAX_TIMEOUT_MS)
    )

    registerHandlers(socket)

    socket.on("disconnect", () => {
      if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer)
      socket.data.expiryTimer = null
    })
  })

  const sweepTimer = setInterval(() => { void sweep(server) }, REVALIDATE_INTERVAL_MS)
  // Does not hold the process open on shutdown.
  sweepTimer.unref()

  io = server
  return server
}

export function getIo(): MessagingServer {
  if (!io) throw new Error("Socket.io is not initialized")
  return io
}

// For the realtime control interface, which must not throw into a mutation that
// has already committed just because the socket server is not up.
export function tryGetIo(): MessagingServer | null {
  return io
}
