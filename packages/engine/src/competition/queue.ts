/**
 * Enqueueing a competition for resolution, and the hook the server uses to be
 * told about it.
 *
 * Two things ask for a competition to be resolved — the sweep, when a deadline
 * passes, and a competition filling up as somebody enters it — and both go
 * through here so neither has to know how resolution actually happens.
 */

import type { Prisma } from "@sim-engine/db"

/**
 * Ask for a competition to be resolved.
 *
 * Idempotent by construction: `CompetitionResolutionWork.competitionId` is
 * unique, so the sweep and a filling competition can both ask for the same work
 * and one row results. A second call is a no-op rather than a reset — in
 * particular it does not revive an item that has already been given up on,
 * because an item the resolver stopped retrying should stay stopped until
 * somebody looks at it, not be resurrected by the next sweep.
 *
 * Takes a transaction client so the enqueue commits with whatever caused it. An
 * entry that rolls back must not leave work behind claiming the competition is
 * full.
 */
export async function enqueueCompetitionResolution(
  tx: Prisma.TransactionClient,
  gameId: string,
  competitionId: string
): Promise<void> {
  await tx.competitionResolutionWork.upsert({
    where: { competitionId },
    create: { competitionId, gameId, status: "PENDING" },
    update: {},
  })
}

/**
 * The server's resolver, if one is running.
 *
 * Same shape as `configureMessagingRateLimitBackend`: the engine declares what
 * it needs and the application supplies it at startup, so this package never
 * imports the server. With nothing registered — a script, a test — enqueued
 * work simply waits for the next tick, which is the fallback anyway.
 */
let wake: () => void = () => {}

export function configureCompetitionResolver(next: () => void): void {
  wake = next
}

/**
 * Tell the resolver there is work, after the transaction that created it has
 * committed.
 *
 * Deliberately not awaited and never throwing: this is an optimisation that
 * turns a wait-for-the-next-tick into a wait-for-a-moment. The durable record
 * is the work item, and the tick will find it regardless.
 */
export function signalCompetitionResolution(): void {
  try {
    wake()
  } catch (err) {
    console.error("[competition] resolver wake failed; the next tick will pick it up:", err)
  }
}
