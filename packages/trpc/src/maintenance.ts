/**
 * The nightly maintenance window: who is in one, and what it stops.
 *
 * A game is in maintenance while its nightly update is running. Two things
 * depend on knowing that — the countdown and banner the players see, and the
 * server-side block that stops gameplay mutations landing halfway through an
 * animal being aged — and both read from here.
 *
 * Held in memory rather than queried per request. A mutation guard that cost a
 * database round trip on every single mutation would be a permanent tax for a
 * state that is false almost all of the time. The map is kept current by the
 * scheduler: it is written the moment a nightly starts and cleared when it
 * ends, and refreshed from the database every tick so that a nightly running on
 * another instance — or one already in flight when this process started — blocks
 * here too.
 *
 * Losing the map costs nothing permanent. A restarted process has no entries,
 * and the next tick repopulates it from the runs that are actually RUNNING.
 */

import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"

export type MaintenanceWindow = {
  runId: string
  startedAt: Date
  /**
   * When this entry stops being believed without a refresh.
   *
   * A backstop, not a schedule. The scheduler refreshes every tick, so this
   * only matters if the thing doing the refreshing stops — and a block that
   * outlived the nightly would lock players out of a game that was running
   * perfectly well. Expiring errs towards letting people play.
   */
  expiresAt: number
}

const windows = new Map<string, MaintenanceWindow>()

/** How long a maintenance entry survives without being refreshed. */
const STALE_AFTER_MS = 5 * 60_000

/** Mark a game as updating, or clear it. Called by the scheduler. */
export function setGameMaintenance(gameId: string, window: { runId: string; startedAt: Date } | null): void {
  if (!window) {
    windows.delete(gameId)
    return
  }
  windows.set(gameId, { ...window, expiresAt: Date.now() + STALE_AFTER_MS })
}

/**
 * Replace the whole map with what the database says is running.
 *
 * Called every tick. Takes the full set rather than individual updates so a
 * nightly that ended without anything clearing it — a crash, a reclaim by
 * another instance — stops blocking as soon as it stops running.
 */
export function syncGameMaintenance(running: Array<{ gameId: string; runId: string; startedAt: Date }>): void {
  const seen = new Set<string>()
  for (const run of running) {
    seen.add(run.gameId)
    windows.set(run.gameId, { runId: run.runId, startedAt: run.startedAt, expiresAt: Date.now() + STALE_AFTER_MS })
  }
  for (const gameId of [...windows.keys()]) {
    if (!seen.has(gameId)) windows.delete(gameId)
  }
}

/** Whether a game is mid-update right now. */
export function gameMaintenance(gameId: string): MaintenanceWindow | null {
  const window = windows.get(gameId)
  if (!window) return null
  if (window.expiresAt <= Date.now()) {
    windows.delete(gameId)
    return null
  }
  return window
}

/** True when no game is updating — the common case, and the cheap one. */
function nothingInMaintenance(): boolean {
  if (windows.size === 0) return true
  // Expire as we go, so a stale entry does not keep the slow path alive.
  for (const [gameId, window] of windows) {
    if (window.expiresAt <= Date.now()) windows.delete(gameId)
  }
  return windows.size === 0
}

/**
 * Paths that keep working while a game updates.
 *
 * Signing out is not here because it never reaches tRPC — better-auth serves
 * `/api/auth/**` directly, so it is unaffected by anything in this file.
 * Queries are not here either: the guard runs on mutations only, so reading
 * the game's state, including the maintenance status itself, always works.
 */
function isExempt(path: string): boolean {
  // Staff need their recovery controls precisely when an update is stuck.
  if (path.startsWith("admin.")) return true
  // Chat stays up. It is not gameplay, it cannot touch an animal, and an
  // update in progress is exactly when players want to ask about it. The
  // tutorial guard exempts messaging for the same reason.
  if (path.startsWith("messaging.")) return true
  if (path.startsWith("bugReport.") || path.startsWith("supportTicket.")) return true
  return false
}

function blocked(): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: "GAME_UPDATE_IN_PROGRESS",
  })
}

/**
 * Refuse a gameplay mutation while its game is updating.
 *
 * The plan is explicit that disabled buttons are not a block: this is the
 * enforcement, and the client's redirect is only the courtesy that stops a
 * player meeting it as an error.
 *
 * Returns immediately when nothing is in maintenance, which is almost always.
 * Only once a game is actually updating does it spend a query working out
 * which game a mutation belongs to.
 */
export async function guardGameMaintenance(
  userId: string | null,
  path: string,
  raw: unknown
): Promise<void> {
  if (nothingInMaintenance()) return
  if (isExempt(path)) return

  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  // The common shape: a mutation that names its game.
  if (typeof input["gameId"] === "string") {
    if (gameMaintenance(input["gameId"])) throw blocked()
    return
  }

  // Otherwise work out which games this caller acts in. A player with an
  // account in an updating game is blocked for the duration, whichever of
  // their animals the mutation names.
  if (!userId) return

  const players = await db.playerAccount.findMany({
    where: { userId },
    select: { gameId: true },
  })

  if (players.some((p) => gameMaintenance(p.gameId))) throw blocked()
}
