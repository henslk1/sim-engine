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
  | "messaging:activity"
  | "messaging:permissions"
  | "notification:created"

export type MessagingActivityAudience = {
  gameId: string
  channelId: string
  // DMs address their two participants directly. Server channels leave this
  // absent and use either the whole game or the minimum staff audience below.
  playerAccountIds?: string[]
  minimumStaffRole?: "MODERATOR" | "ADMIN" | "OWNER" | null
}

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
  // Game-wide delivery, for things every player in the game can see regardless
  // of which conversation they have open: a channel appearing, being renamed,
  // being archived. A channel room is the wrong address for those — nobody has
  // joined a channel that was created a moment ago, and the players who need to
  // hear that one was archived are precisely the ones not looking at it.
  emitToGame(gameId: string, event: ServerToClientEvent, payload: unknown): void
  // Tells every eligible socket *except those already watching the channel*
  // that its persisted messaging overview changed. This is the unread-badge
  // path: open conversations receive the full message event in their channel
  // room, while closed widgets receive this lightweight invalidation.
  emitMessagingActivity(
    audience: MessagingActivityAudience,
    payload: { channelId: string; kind: "created" | "deleted" }
  ): void
  // Account-level revocation. Called after a ban or session revocation commits,
  // never before — a rolled back transaction must not have kicked anyone.
  disconnectUser(userId: string, reason: string): void
  // Used when a channel's read visibility changes. Existing room membership
  // was authorized under the old rule, so every socket in the game reconnects
  // and resolves its role before it can join the room again.
  disconnectGame(gameId: string, reason: string): void
}

// For anywhere a realtime server is not attached: tests, scripts, background
// jobs. Dropping a live event there is correct — PostgreSQL holds the truth and
// clients reconcile against it on reconnect.
export const noopRealtime: RealtimeControl = {
  emitToPlayer: () => {},
  emitToChannel: () => {},
  emitToGame: () => {},
  emitMessagingActivity: () => {},
  disconnectUser: () => {},
  disconnectGame: () => {},
}
