import type { RealtimeControl } from "@sim-engine/trpc/messaging"
import { tryGetIo } from "./socket.js"

// The Socket.IO implementation of the interface the tRPC context carries.
//
// Every method tolerates the socket server being absent. A mutation that has
// already committed must not fail because a live notification could not be
// delivered — clients reconcile against PostgreSQL on reconnect, which is the
// whole reason live events are allowed to be best-effort.
export const realtimeControl: RealtimeControl = {
  emitToPlayer(gameId, playerAccountId, event, payload) {
    tryGetIo()?.to(`player:${gameId}:${playerAccountId}`).emit(event, payload)
  },

  emitToChannel(channelId, event, payload) {
    tryGetIo()?.to(`channel:${channelId}`).emit(event, payload)
  },

  disconnectUser(userId, reason) {
    const io = tryGetIo()
    if (!io) return
    console.log(`[socket] disconnecting user ${userId}: ${reason}`)

    // Two calls, deliberately. @socket.io/redis-adapter takes the local path
    // only when the local flag is set; otherwise disconnectSockets merely
    // publishes to Redis and relies on this instance receiving its own message
    // back. A Redis outage would then break ban disconnection even on a single
    // server. Together they are idempotent, and the local one cannot be lost.
    io.local.in(`user:${userId}`).disconnectSockets(true)
    io.in(`user:${userId}`).disconnectSockets(true)
  },
}
