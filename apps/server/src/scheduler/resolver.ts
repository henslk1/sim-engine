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
import { runCompetition, type Clock } from "@sim-engine/engine"
import {
  claimResolutions,
  finishResolution,
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

/** Attempts before a competition is given up on and recorded as failed. */
const MAX_ATTEMPTS = 3

/** A stop on the drain loop, so a queue that keeps refilling cannot spin. */
const MAX_PASSES = 1_000

/**
 * The recovery sweep's interval.
 *
 * A wake is the fast path and this is the net under it: work enqueued by
 * another instance, or a signal that arrived while this process was starting,
 * is found within a minute without anything having to notice it was missed.
 */
const FALLBACK_INTERVAL_MS = 60_000

export type Resolver = {
  /** Tell the resolver there may be work. Returns immediately. */
  wake(): void
  /** Drain until the queue is empty. Used by the fallback timer and by tests. */
  drain(): Promise<{ resolved: number; reconciled: number; failed: number }>
  /** Begin the recovery sweep. */
  start(): void
  stop(): Promise<void>
}

export function createResolver(options: { instanceId: string; clock: Clock }): Resolver {
  const { instanceId, clock } = options

  let draining: Promise<{ resolved: number; reconciled: number; failed: number }> | null = null
  // A wake that arrives mid-drain must not be lost — the item it was about may
  // have been enqueued after this drain's last claim. Rather than queue up
  // overlapping drains, remember that one more pass is owed.
  let again = false
  let stopped = false

  async function resolveOne(
    work: ClaimedResolution,
    token: string
  ): Promise<"resolved" | "reconciled" | "failed"> {
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

  async function runDrain(): Promise<{ resolved: number; reconciled: number; failed: number }> {
    const token = `${instanceId}#resolver`
    let resolved = 0
    let reconciled = 0
    let failed = 0

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      if (stopped) break

      const chunk = await claimResolutions(token, clock.now(), LEASE_MS, CHUNK_SIZE)
      if (chunk.length === 0) break

      for (const work of chunk) {
        const outcome = await resolveOne(work, token)
        if (outcome === "resolved") resolved++
        else if (outcome === "reconciled") reconciled++
        else failed++
      }

      await heartbeatResolutions(token, clock.now(), LEASE_MS)
    }

    return { resolved, reconciled, failed }
  }

  async function drain(): Promise<{ resolved: number; reconciled: number; failed: number }> {
    // One drain at a time. A second caller joins the one already running rather
    // than starting a competing pass over the same queue.
    if (draining) {
      again = true
      return draining
    }

    const totals = { resolved: 0, reconciled: 0, failed: 0 }

    draining = (async () => {
      do {
        again = false
        const pass = await runDrain()
        totals.resolved += pass.resolved
        totals.reconciled += pass.reconciled
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
    void drain().catch((err) => console.error("[resolver] drain failed:", err))
  }

  let fallback: NodeJS.Timeout | null = null

  function start(): void {
    if (fallback) return
    fallback = setInterval(() => wake(), FALLBACK_INTERVAL_MS)
    fallback.unref()
    // One drain on startup, for anything left behind by the process before it.
    wake()
  }

  async function stop(): Promise<void> {
    stopped = true
    if (fallback) {
      clearInterval(fallback)
      fallback = null
    }
    // Let whatever is in flight finish its competition; the lease would recover
    // it either way, but a clean stop avoids a minute of looking crashed.
    if (draining) await draining.catch(() => {})
  }

  return { wake, drain, start, stop }
}
