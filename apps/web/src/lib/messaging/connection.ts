/**
 * One socket, one game, however many components are watching.
 *
 * This used to live inside `useMessagingSocket`, which was fine while the chat
 * widget was its only caller. It is not any more: the nightly banner needs the
 * same epoch, to know when to re-read the maintenance window after a
 * reconnect. Two components running that effect would each send their own
 * `game:enter`, and the server answers one by leaving the game's rooms and
 * rejoining them — so the second would briefly evict the first from exactly
 * the rooms it is for.
 *
 * Separated from the hook, and from the socket, because what is left is a
 * small state machine with three inputs that arrive in any order — mount,
 * connect, disconnect — and it is worth being able to drive those directly.
 * See `connection.test.ts`, which does.
 */

export type ConnectionStatus = "connecting" | "online" | "offline"

export type MessagingConnection = {
  status: ConnectionStatus
  // Increments every time the socket (re)enters the game. Views watch it to
  // know they should reconcile against the database: Socket.IO's own recovery
  // is best-effort, so anything that happened while the connection was down has
  // to be refetched rather than assumed to have arrived.
  epoch: number
}

/** The part of Socket.IO this needs, which is not much of it. */
export type ConnectionSocket = {
  readonly connected: boolean
  connect(): void
  on(event: "connect" | "disconnect" | "connect_error", handler: () => void): void
}

/** Sends `game:enter` and reports whether the server accepted it. */
export type EnterGame = (gameId: string) => Promise<{ ok: boolean }>

export type GameSession = {
  /** Connect if needed, and claim this game on the connection. */
  ensure(gameId: string): void
  /** Subscribe to status and epoch. Returns the unsubscribe. */
  watch(onChange: () => void): () => void
  snapshot(): MessagingConnection
}

export function createGameSession(socket: ConnectionSocket, enter: EnterGame): GameSession {
  let connection: MessagingConnection = { status: "connecting", epoch: 0 }
  const watchers = new Set<() => void>()

  /** The game the socket should be in. Null until something asks for one. */
  let activeGameId: string | null = null

  /**
   * Bumped whenever an in-flight `game:enter` stops being about anything.
   *
   * Both reasons are real: the connection it was sent on dropped, or the game
   * it named is no longer the game we want. Without it, an enter still waiting
   * for its acknowledgement when the socket went down resolves late — as a
   * timeout — and publishes "offline" over the state a *successful* re-entry
   * has already set, leaving a connected socket that has entered no game and
   * nothing left to notice.
   */
  let generation = 0
  /** The generation whose enter is in flight, so callers do not pile up. */
  let entering: number | null = null
  let wired = false

  function publish(next: Partial<MessagingConnection>): void {
    connection = { ...connection, ...next }
    for (const watcher of watchers) watcher()
  }

  // Entering a game is what resolves the acting player on the server, and every
  // other event refuses to run until it has happened — so it is re-sent on every
  // connect, including the automatic reconnects Socket.IO makes on its own.
  async function enterGame(): Promise<void> {
    const gameId = activeGameId
    const mine = generation
    if (!gameId || entering === mine) return

    entering = mine
    publish({ status: "connecting" })
    const result = await enter(gameId)

    // Superseded while this was in flight: the answer is about a connection we
    // no longer hold, or a game we have already left, and something newer has
    // been sent in its place. Leaving `entering` alone matters as much as not
    // publishing — it belongs to whatever replaced this.
    if (mine !== generation) return
    entering = null

    // A refusal here is a real answer — banned, or no character in this game.
    // Treating it as offline would hide it behind "Reconnecting…" forever.
    if (result.ok) publish({ status: "online", epoch: connection.epoch + 1 })
    else publish({ status: "offline" })
  }

  function ensure(gameId: string): void {
    if (!wired) {
      // Bumped here and on a game switch, which are the two moments something
      // new begins. Bumping on `disconnect` instead would look equivalent and
      // is not: a `connect` that arrived without one - the first one, or any
      // Socket.IO decides not to announce - would find the old enter still
      // marked in flight and skip sending a new one, leaving the socket in no
      // game at all.
      socket.on("connect", () => {
        generation += 1
        void enterGame()
      })
      socket.on("disconnect", () => publish({ status: "offline" }))
      socket.on("connect_error", () => publish({ status: "offline" }))
      wired = true
    }

    const switching = activeGameId !== gameId
    activeGameId = gameId
    if (switching) generation += 1

    if (!socket.connected) {
      publish({ status: "connecting" })
      // `connect` fires enterGame; doing it here as well would race it.
      socket.connect()
      return
    }

    if (switching || connection.status !== "online") void enterGame()
  }

  return {
    ensure,
    watch(onChange) {
      watchers.add(onChange)
      return () => {
        watchers.delete(onChange)
        // Deliberately not disconnecting. The socket is a module-level
        // singleton shared by everything on the page, and signing out is what
        // closes it — see lib/session-cleanup.ts. Dropping it here would also
        // mean a remount costs a fresh handshake for nothing.
      }
    },
    snapshot: () => connection,
  }
}
