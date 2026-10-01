import { useEffect, useRef, useState } from "react"
import { socket } from "@/lib/socket"

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
  authorPlayerId: string
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
  authorPlayerId: string
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

export type ConnectionStatus = "connecting" | "online" | "offline"

export type MessagingConnection = {
  status: ConnectionStatus
  // Increments every time the socket (re)enters the game. Views watch it to
  // know they should reconcile against the database: Socket.IO's own recovery
  // is best-effort, so anything that happened while the connection was down has
  // to be refetched rather than assumed to have arrived.
  epoch: number
}

// Opens the connection and claims a game on it.
//
// Entering a game is what resolves the acting player on the server, and every
// other event refuses to run until it has happened — so it is re-sent on every
// connect, including the automatic reconnects Socket.IO makes on its own.
export function useMessagingSocket(gameId: string | undefined): MessagingConnection {
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (!gameId) return

    let cancelled = false

    async function enterGame() {
      const result = await request<null>("game:enter", { gameId })
      if (cancelled) return
      // A refusal here is a real answer — banned, or no character in this game.
      // Treating it as offline would hide it behind "Reconnecting…" forever.
      setStatus(result.ok ? "online" : "offline")
      if (result.ok) setEpoch(current => current + 1)
    }

    function onConnect() {
      void enterGame()
    }
    function onDisconnect() {
      if (!cancelled) setStatus("offline")
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onDisconnect)

    if (socket.connected) void enterGame()
    else {
      setStatus("connecting")
      socket.connect()
    }

    return () => {
      cancelled = true
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onDisconnect)
      // Deliberately not disconnecting. The socket is a module-level singleton
      // shared by everything on the page, and signing out is what closes it —
      // see lib/session-cleanup.ts. Dropping it here would also mean a remount
      // costs a fresh handshake for nothing.
    }
  }, [gameId])

  return { status, epoch }
}

// Subscribes to one server event for the lifetime of a component.
//
// The handler goes through a ref so a listener is attached once per event
// rather than being torn down and rebuilt on every render — otherwise an inline
// arrow function, which is a new value each time, would resubscribe constantly
// and could miss an event in the gap.
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const listener = (payload: T) => latest.current(payload)
    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [event])
}
