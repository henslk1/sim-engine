import { useEffect } from "react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useMessagingSocket, useSocketEvent } from "@/lib/messaging/socket-events"

/**
 * What the client knows about the nightly update, kept fresh three ways.
 *
 * The three are deliberately unequal:
 *
 *   the query    the only thing that decides anything. It reads the run row,
 *                which is also what the server's own block reads, so the page
 *                and the mutation it would send can never disagree.
 *   the socket   a nudge. `maintenance:changed` carries no state - it means
 *                "ask again", and the asking is the query above. So a packet
 *                that is lost, duplicated, or sent for a run that went to
 *                RETRYING rather than finishing cannot open a game the server
 *                still has shut. It only decides how soon the truth arrives.
 *   the poll     the floor. A tab that was asleep, a socket that never
 *                connected, a scheduler on an instance with no socket server -
 *                all of them end with the client asking anyway.
 *
 * Which is the point the plan is explicit about: disabled buttons and
 * redirects are a courtesy, and `guardGameMaintenance` is the enforcement. The
 * worst a missed event can do here is leave somebody looking at a page that
 * says the game is open for a few more seconds, until the poll catches up - and
 * if they act in that window, the server refuses it.
 */

export type NightlyState = NonNullable<RouterOutputs["game"]["nightlyState"]>

export function useNightlyState(
  gameId: string | undefined,
  pollInterval: (state: NightlyState | undefined) => number
) {
  const utils = trpc.useUtils()
  const connection = useMessagingSocket(gameId)

  const query = trpc.game.nightlyState.useQuery(
    { gameId: gameId! },
    {
      enabled: !!gameId,
      refetchInterval: (q) => pollInterval(q.state.data ?? undefined),
      refetchIntervalInBackground: true,
    }
  )

  // Pushed by the scheduler as a nightly starts and as it ends. The payload is
  // only used to tell this game's window from another's.
  useSocketEvent<{ gameId?: string }>("maintenance:changed", (payload) => {
    if (!gameId || payload?.gameId !== gameId) return
    void utils.game.nightlyState.invalidate({ gameId })
  })

  // And on every (re)entry into the game, because whatever happened while the
  // socket was down arrives as nothing at all. A nightly can start and finish
  // inside one reconnect, so the answer being held is not merely late - it may
  // be about a window that has already closed.
  useEffect(() => {
    if (!gameId || connection.epoch === 0) return
    void utils.game.nightlyState.invalidate({ gameId })
  }, [connection.epoch, gameId, utils])

  return query
}
