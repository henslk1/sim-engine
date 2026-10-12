/**
 * Doing a list of things a few at a time.
 *
 * Both work queues had the same shape and the same ceiling: a `for` loop
 * awaiting one item at a time. The first benchmark put the nightly at 25.7
 * animals a second against a 50/s floor, and the whole of the gap was that
 * each animal's transaction waited for the previous animal's transaction —
 * about 39ms each, almost all of it the database thinking rather than this
 * process working.
 *
 * Bounded rather than `Promise.all` over the chunk. Every item here opens a
 * transaction and holds a connection for its life, so unbounded fan-out does
 * not go faster, it exhausts the pool and makes everything behind it wait,
 * including the HTTP requests the same process is serving. A worker takes the
 * next item off a shared cursor as it finishes, so one slow item occupies one
 * slot instead of stalling a batch — the same arrangement `drain` uses for
 * games, one level down.
 *
 * Errors belong to `fn`. A rejection here would abandon the rest of the batch,
 * so both callers catch their own and record the failure on the work item,
 * which is where a failure has to end up anyway.
 */
export async function forEachBounded<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const width = Math.max(1, Math.min(limit, items.length))
  if (width === 1) {
    for (const item of items) await fn(item)
    return
  }

  let cursor = 0

  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        await fn(items[index]!)
      }
    })
  )
}

/**
 * Renew a lease on a timer for as long as `work` is running.
 *
 * Tied to elapsed time rather than to progress through a loop, for the reason
 * `execute` gives about the run lease: a chunk with fewer items than the
 * renewal interval never renews at all, and one slow item at the end outlives
 * the lease however many items there were. Concurrency makes it worse — "after
 * each item" has no single meaning once several are in flight.
 *
 * A renewal that throws is logged and ignored. The lease lapsing is recoverable
 * (the work is reclaimed) and the fencing token stops a lapsed worker writing
 * over its successor, so failing the batch over it would be the worse outcome.
 */
export async function withLeaseRenewal<T>(
  renew: () => Promise<unknown>,
  everyMs: number,
  work: () => Promise<T>
): Promise<T> {
  const timer = setInterval(() => {
    void renew().catch((err) => console.error("[scheduler] lease renewal failed:", err))
  }, Math.max(1_000, everyMs))
  timer.unref()

  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}
