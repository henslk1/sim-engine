/**
 * The competition resolver.
 *
 * Resolution is already crash-safe without any of this: `runCompetition` does
 * the whole thing in one transaction, so a process that dies mid-resolution
 * rolls back and the competition is OPEN again. What the resolver adds is
 * everything around that — work taken off the entering player's request, done a
 * chunk at a time instead of in one serial loop holding the sweep's lease, with
 * failures counted and kept rather than logged and forgotten.
 *
 * It is woken rather than polled. A competition filling up signals it and it
 * drains immediately; the scheduler's tick signals it too, which is the
 * recovery path for anything a signal missed — a wake that arrived while the
 * process was starting, or work enqueued by a different instance.
 */

import { db } from "@sim-engine/db"
import { db as database } from "@sim-engine/db"
import { replenishOpenSet, runCompetition, type Clock } from "@sim-engine/engine"
import { forEachBounded, withLeaseRenewal } from "./bounded.js"
import {
  abandonExhaustedResolutions,
  claimResolutions,
  finishResolution,
  gamesInNightly,
  heartbeatResolutions,
  type ClaimedResolution,
} from "./competition-work.js"

/** How many competitions one claim covers. */
const CHUNK_SIZE = 50

/**
 * How long a claimed chunk is owned for without a renewal.
 *
 * Comfortably longer than the chunk can take: one competition is allowed two
 * minutes of transaction, so a chunk of fifty slow ones must not have its lease
 * lapse underneath it. The heartbeat renews every third of this anyway.
 */
const LEASE_MS = 300_000

/**
 * How often the lease is renewed while a chunk is being worked.
 *
 * A third of the lease, so two renewals can be missed before ownership is
 * genuinely at risk — the same ratio the run lease uses.
 */
const RENEW_EVERY_MS = Math.floor(LEASE_MS / 3)

/**
 * How many competitions are resolved at once.
 *
 * The benchmark put resolution at 13.6 a second, which was the same serial-loop
 * ceiling the nightly had: each competition's transaction waited for the one
 * before it. Kept in step with `ANIMAL_CONCURRENCY` because they draw on the
 * same connection pool, and the resolver no longer runs during a game's nightly
 * — but it does still run alongside every other game's.
 */
const RESOLUTION_CONCURRENCY = 4

/** Attempts before a competition is given up on and recorded as failed. */
const MAX_ATTEMPTS = 3

/** A stop on the drain loop, so a queue that keeps refilling cannot spin. */
const MAX_PASSES = 1_000

/**
 * The recovery sweep's interval when there is work about.
 *
 * A wake is the fast path and this is the net under it: work enqueued by
 * another instance, or a signal that arrived while this process was starting,
 * is found within a minute without anything having to notice it was missed.
 */
const FALLBACK_INTERVAL_MS = 60_000

/**
 * How long the recovery sweep backs off to when it keeps finding nothing.
 *
 * The same reasoning as the scheduler's own sleep: a net cast every minute
 * forever is a database that never gets to be idle, and on a host that bills
 * for being awake that is the whole bill. Backing off costs nothing a signal
 * does not already cover — this timer exists for work *another* process
 * enqueued, which a single-instance game never has.
 *
 * Doubling from a minute: 1, 2, 4, 8, 15.
 */
const MAX_FALLBACK_INTERVAL_MS = 15 * 60_000

export type DrainTotals = {
  resolved: number
  reconciled: number
  cancelled: number
  failed: number
}

export type Resolver = {
  /** Tell the resolver there may be work. Returns immediately. */
  wake(): void
  /** Drain until the queue is empty. Used by the fallback timer and by tests. */
  drain(): Promise<DrainTotals>
  /** Begin the recovery sweep. */
  start(): void
  stop(): Promise<void>
}

export function createResolver(options: { instanceId: string; clock: Clock }): Resolver {
  const { instanceId, clock } = options

  let draining: Promise<DrainTotals> | null = null
  // A wake that arrives mid-drain must not be lost — the item it was about may
  // have been enqueued after this drain's last claim. Rather than queue up
  // overlapping drains, remember that one more pass is owed.
  let again = false
  let stopped = false

  async function resolveOne(
    work: ClaimedResolution,
    token: string
  ): Promise<"resolved" | "reconciled" | "cancelled" | "failed"> {
    try {
      await runCompetition(db, { competitionId: work.competitionId })
      await finishResolution(work.id, token, clock.now(), { status: "COMPLETED" })
      return "resolved"
    } catch (err) {
      // The competition may simply have been resolved already — by the tutorial,
      // which runs its own synchronously, or by an earlier attempt of this item
      // whose result committed before it could be closed out. `runCompetition`
      // reports that the same way it reports a genuine refusal, so the status
      // is what distinguishes them: anything no longer OPEN has had its turn.
      //
      // Reconciling it as success rather than failure is the whole point. The
      // work item exists to answer "has this competition been resolved", and
      // the answer is yes.
      const competition = await db.competition
        .findUnique({ where: { id: work.competitionId }, select: { status: true } })
        .catch(() => null)

      // Cancelled is not resolved. Recording it as a success said a field had
      // been judged when in fact it never will be, and the two are worth
      // telling apart when somebody asks what became of a competition. Closing
      // the item out either way is the point: there is nothing left to do, so
      // it has to stop being claimed.
      if (competition && competition.status === "CANCELLED") {
        await finishResolution(work.id, token, clock.now(), { status: "CANCELLED" })
        return "cancelled"
      }

      if (competition && competition.status !== "OPEN") {
        await finishResolution(work.id, token, clock.now(), { status: "COMPLETED" })
        return "reconciled"
      }

      const giveUp = work.attempt >= MAX_ATTEMPTS
      console.error(
        `[resolver] competition ${work.competitionId} failed on attempt ${work.attempt}${giveUp ? " — giving up" : ""}:`,
        err
      )
      await finishResolution(work.id, token, clock.now(), {
        status: giveUp ? "FAILED" : "RETRYING",
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      return "failed"
    }
  }

  /**
   * Put back what a chunk took out.
   *
   * Failures are not in `touched`: a competition that could not be resolved is
   * still open and still occupying its slot, so there is nothing to replace.
   */
  async function replaceResolved(touched: Set<string>): Promise<void> {
    for (const gameId of touched) {
      try {
        const created = await replenishOpenSet(database, gameId)
        if (created > 0) console.log(`[resolver] gameId=${gameId} replaced ${created} competition(s)`)
      } catch (err) {
        // The next chunk and the next sweep both replenish too, so this is a
        // delay rather than a loss, and it must not fail the drain.
        console.error(`[resolver] could not replace competitions for game ${gameId}:`, err)
      }
    }
  }

  async function runDrain(): Promise<DrainTotals> {
    const token = `${instanceId}#resolver`
    let resolved = 0
    let reconciled = 0
    let cancelled = 0
    let failed = 0

    // Before claiming anything: items a dead worker left behind that have used
    // up their attempts. The clean failure path gives up after `MAX_ATTEMPTS`
    // and the crash path did not — it reclaimed the same item forever, with
    // nothing anywhere saying how many times it had been tried.
    await abandonExhaustedResolutions(clock.now(), MAX_ATTEMPTS).catch((err) =>
      console.error("[resolver] could not retire abandoned work:", err)
    )

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      if (stopped) break

      // Re-read every pass rather than once per drain. A nightly that starts
      // mid-drain should stop this taking any more of that game's work, and
      // one that finishes should let it resume without waiting for the
      // fallback tick.
      const busy = await gamesInNightly(clock.now())

      const chunk = await claimResolutions(token, clock.now(), LEASE_MS, CHUNK_SIZE, busy)
      if (chunk.length === 0) break

      // Which games had a competition finish in this chunk, and so have a slot
      // to refill. Per chunk rather than per drain — see below.
      const touched = new Set<string>()

      // The lease is renewed while the chunk is being worked, not once after
      // it. A chunk is fifty competitions and a competition is allowed two
      // minutes, so the worst case is well over an hour against a five-minute
      // lease — the work would be reclaimed out from under a worker still doing
      // it, and `finishResolution`'s fencing would then discard the result it
      // came back with.
      await withLeaseRenewal(
        () => heartbeatResolutions(token, clock.now(), LEASE_MS),
        RENEW_EVERY_MS,
        () =>
          forEachBounded(chunk, RESOLUTION_CONCURRENCY, async (work) => {
            const outcome = await resolveOne(work, token)
            if (outcome === "resolved") resolved++
            else if (outcome === "reconciled") reconciled++
            else if (outcome === "cancelled") cancelled++
            else failed++
            if (outcome !== "failed") touched.add(work.gameId)
          })
      )

      await heartbeatResolutions(token, clock.now(), LEASE_MS)

      // Replace this chunk's competitions before claiming the next one.
      //
      // This used to run once, after the whole queue had drained. That is fine
      // when a handful of competitions come due, and wrong when a sweep brings
      // the entire open set down at once: resolving 1,078 of them took 37
      // seconds, and for those 37 seconds the venue pages emptied out — the
      // open set fell to 33 before everything came back. Per chunk, the hole is
      // never bigger than one chunk and never lasts longer than one chunk takes.
      await replaceResolved(touched)
    }

    return { resolved, reconciled, cancelled, failed }
  }

  async function drain(): Promise<DrainTotals> {
    // One drain at a time. A second caller joins the one already running rather
    // than starting a competing pass over the same queue.
    if (draining) {
      again = true
      return draining
    }

    const totals: DrainTotals = { resolved: 0, reconciled: 0, cancelled: 0, failed: 0 }

    draining = (async () => {
      do {
        again = false
        const pass = await runDrain()
        totals.resolved += pass.resolved
        totals.reconciled += pass.reconciled
        totals.cancelled += pass.cancelled
        totals.failed += pass.failed
      } while (again && !stopped)

      return totals
    })()

    try {
      return await draining
    } finally {
      draining = null
    }
  }

  function wake(): void {
    if (stopped) return
    // Somebody says there is work, so the backed-off net is no longer the right
    // one: whatever happens next, the queue is live again.
    fallbackMs = FALLBACK_INTERVAL_MS
    void drain().catch((err) => console.error("[resolver] drain failed:", err))
  }

  let fallback: NodeJS.Timeout | null = null
  let fallbackMs = FALLBACK_INTERVAL_MS

  /**
   * Re-arm the recovery sweep, backing off while the queue stays empty.
   *
   * Reset to the fast interval the moment a drain finds anything, so a game
   * that goes quiet overnight and busy in the morning is back to a one-minute
   * net after the first competition runs.
   */
  function armFallback(): void {
    if (stopped) return
    fallback = setTimeout(() => {
      void drain()
        .then((totals) => {
          const did = totals.resolved + totals.reconciled + totals.cancelled + totals.failed
          fallbackMs = did > 0
            ? FALLBACK_INTERVAL_MS
            : Math.min(fallbackMs * 2, MAX_FALLBACK_INTERVAL_MS)
        })
        .catch((err) => console.error("[resolver] drain failed:", err))
        .finally(() => armFallback())
    }, fallbackMs)
    fallback.unref()
  }

  function start(): void {
    if (fallback) return
    fallbackMs = FALLBACK_INTERVAL_MS
    armFallback()
    // One drain on startup, for anything left behind by the process before it.
    wake()
  }

  async function stop(): Promise<void> {
    stopped = true
    if (fallback) {
      clearTimeout(fallback)
      fallback = null
    }
    // Let whatever is in flight finish its competition; the lease would recover
    // it either way, but a clean stop avoids a minute of looking crashed.
    if (draining) await draining.catch(() => {})
  }

  return { wake, drain, start, stop }
}
