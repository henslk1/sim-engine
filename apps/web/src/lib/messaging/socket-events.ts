import { useEffect, useRef, useSyncExternalStore } from "react"
import { socket } from "@/lib/socket"
import { createGameSession, type MessagingConnection } from "./connection"
// Re-exported so callers keep importing the connection's shape from the module
// they already use for every other socket concern.
export type { ConnectionStatus, MessagingConnection } from "./connection"

// The client half of the socket contract. The server's side is in
// apps/server/src/socket.ts; the two files have to agree on event names and
// payload shapes, and nothing else connects them.

// Dates arrive as strings on both transports. Socket.IO serializes with JSON,
// and this app's tRPC client has no superjson transformer — so a `Date` the
// server returned is a string by the time it gets here, whatever the inferred
// type says. Everything is normalized through toChatMessage rather than trusted.
export type ChatMessage = {
  id: string
  channelId: string
  authorPlayerId: string | null
  authorUsername: string
  clientMessageId: string
  content: string
  createdAt: string
  editedAt: string | null
  removedBy: "author" | "staff" | null
  // Set only on a message this client is still sending. It has no server id
  // yet, so the list keys it by clientMessageId until the acknowledgement
  // arrives.
  pending?: boolean
  failed?: string
}

type RawMessage = {
  id: string
  channelId: string
  authorPlayerId: string | null
  authorUsername: string
  clientMessageId: string
  content: string
  createdAt: Date | string
  editedAt: Date | string | null
  removedBy: "author" | "staff" | null
}

function isoString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString()
}

export function toChatMessage(raw: RawMessage): ChatMessage {
  return {
    id: raw.id,
    channelId: raw.channelId,
    authorPlayerId: raw.authorPlayerId,
    authorUsername: raw.authorUsername,
    clientMessageId: raw.clientMessageId,
    content: raw.content,
    createdAt: isoString(raw.createdAt),
    editedAt: raw.editedAt === null ? null : isoString(raw.editedAt),
    removedBy: raw.removedBy,
  }
}

export type ChannelBroadcast = {
  channelId: string
  name: string
  description: string | null
  displayOrder: number | null
  defaultCanPost: boolean
  isArchived: boolean
}

type Ack<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

const ACK_TIMEOUT_MS = 10_000

// Promise-wraps an emit so callers can await the server's answer.
//
// The timeout is not optional. Socket.IO will happily hold a callback forever
// if the connection drops between sending and acknowledging, and a composer
// stuck in "sending" with no explanation is worse than one that says it failed.
function request<T>(event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise(resolve => {
    if (!socket.connected) {
      resolve({ ok: false, code: "OFFLINE", message: "Not connected." })
      return
    }
    const timer = setTimeout(
      () => resolve({ ok: false, code: "TIMEOUT", message: "That took too long. Try again." }),
      ACK_TIMEOUT_MS
    )
    socket.emit(event, payload, (result: Ack<T>) => {
      clearTimeout(timer)
      // A disconnect mid-flight can deliver nothing at all.
      resolve(result ?? { ok: false, code: "NO_ACK", message: "That message could not be sent." })
    })
  })
}

export function sendMessage(input: { channelId: string; clientMessageId: string; content: string }) {
  return request<RawMessage>("message:send", input)
}

export function joinChannel(channelId: string) {
  return request<null>("channel:join", { channelId })
}

export function leaveChannel(channelId: string) {
  return request<null>("channel:leave", { channelId })
}

// The shared connection, bound to this page's one socket. The state machine
// itself is in connection.ts, where it can be driven without a socket or a
// React tree; this hook is a view onto it.
const session = createGameSession(socket, gameId => request<null>("game:enter", { gameId }))

/** Opens the connection, claims a game on it, and reports both. */
export function useMessagingSocket(gameId: string | undefined): MessagingConnection {
  const current = useSyncExternalStore(session.watch, session.snapshot)

  useEffect(() => {
    if (gameId) session.ensure(gameId)
  }, [gameId])

  return current
}

// Subscribes to one server event for the lifetime of a component.
//
// The handler goes through a ref so a listener is attached once per event
// rather than being torn down and rebuilt on every render — otherwise an inline
// arrow function, which is a new value each time, would resubscribe constantly
// and could miss an event in the gap.
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const latest = useRef(handler)

  useEffect(() => {
    latest.current = handler
  }, [handler])

  useEffect(() => {
    const listener = (payload: T) => latest.current(payload)
    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [event])
}
