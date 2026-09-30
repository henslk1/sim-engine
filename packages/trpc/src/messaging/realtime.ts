// The narrow slice of the realtime server that request-handling code may touch.
//
// `packages/trpc` must not import the application server's Socket.IO singleton:
// `apps/server` already depends on this package, so importing back would point
// the dependency both ways, and every live side effect would become impossible
// to test without standing up a socket server. Instead the tRPC context carries
// this interface, `apps/server` implements it with Socket.IO and the Redis
// adapter, and tests pass a recording double.
export type ServerToClientEvent =
  | "message:created"
  | "message:updated"
  | "message:deleted"
  | "channel:created"
  | "channel:updated"
  | "channel:archived"
  | "read:updated"
  | "notification:created"

export type RealtimeControl = {
  // Player-scoped delivery: notifications and DM badges. Addressed by game and
  // player account rather than by user, so one game's events cannot surface in
  // another game's context.
  emitToPlayer(
    gameId: string,
    playerAccountId: string,
    event: ServerToClientEvent,
    payload: unknown
  ): void
  emitToChannel(channelId: string, event: ServerToClientEvent, payload: unknown): void
  // Account-level revocation. Called after a ban or session revocation commits,
  // never before — a rolled back transaction must not have kicked anyone.
  disconnectUser(userId: string, reason: string): void
}

// For anywhere a realtime server is not attached: tests, scripts, background
// jobs. Dropping a live event there is correct — PostgreSQL holds the truth and
// clients reconcile against it on reconnect.
export const noopRealtime: RealtimeControl = {
  emitToPlayer: () => {},
  emitToChannel: () => {},
  disconnectUser: () => {},
}
