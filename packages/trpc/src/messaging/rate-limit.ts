// Rate limits for the two messaging actions that can be used to flood someone:
// sending a message, and opening a new conversation.
//
// The transport-neutral package defines the policy and a local test backend.
// Production installs the Redis backend during server startup, so every app
// instance spends from the same allowance.

export type RateLimitVerdict =
  | { ok: true }
  | { ok: false; retryAfterMs: number; unavailable?: false }
  | { ok: false; retryAfterMs: 0; unavailable: true }

export type MessagingRateLimitBackend = {
  check(bucket: string, key: string, limit: number, windowMs: number): Promise<RateLimitVerdict>
  reset?(): void | Promise<void>
}

// Above this many tracked keys, a check also sweeps out the expired ones.
// Without it, every player who ever sent a message would stay in the map for
// the life of the process.
const SWEEP_AFTER_KEYS = 500

export type SlidingWindow = {
  check(key: string, now?: number): RateLimitVerdict
  reset(): void
}

// A sliding window rather than a fixed one: a fixed window lets someone send
// `limit` messages at the end of one bucket and `limit` more at the start of
// the next, which is twice the intended rate at exactly the moment it matters.
export function createSlidingWindow(limit: number, windowMs: number): SlidingWindow {
  const hits = new Map<string, number[]>()

  function sweep(now: number) {
    for (const [key, times] of hits) {
      const newest = times[times.length - 1]
      if (newest === undefined || now - newest >= windowMs) hits.delete(key)
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitVerdict {
      if (hits.size > SWEEP_AFTER_KEYS) sweep(now)

      const recent = (hits.get(key) ?? []).filter(time => now - time < windowMs)
      if (recent.length >= limit) {
        // Over the limit, so this attempt is not recorded. Otherwise a client
        // retrying in a tight loop would keep pushing the window forward and
        // never be let back in.
        hits.set(key, recent)
        const oldest = recent[0] as number
        return { ok: false, retryAfterMs: Math.max(windowMs - (now - oldest), 1) }
      }

      recent.push(now)
      hits.set(key, recent)
      return { ok: true }
    },

    reset() {
      hits.clear()
    },
  }
}

// Five in five seconds, from the design doc. Chosen so that the limit clears
// before most people finish reading why they hit it — which is also why the
// composer stays enabled rather than disabling on a rate limit.
const localMessageWindow = createSlidingWindow(5, 5_000)

// Opening conversations is the spam vector DMs actually have: one message to
// fifty strangers. Five new conversations in five minutes still allows a new
// player to go round the stud market asking about bookings.
//
// Only charged when a conversation is really created — getOrCreateDirectMessage
// returns `created: false` for one that already exists, and reopening an old
// conversation is not an act worth limiting.
const localConversationWindow = createSlidingWindow(5, 5 * 60_000)

// Tests and standalone scripts have no Redis process, so the transport-neutral
// package starts with the local implementation. apps/server replaces it during
// startup with one atomic Redis backend shared by every instance.
const localBackend: MessagingRateLimitBackend = {
  async check(bucket, key) {
    return bucket === "message"
      ? localMessageWindow.check(key)
      : localConversationWindow.check(key)
  },
  reset() {
    localMessageWindow.reset()
    localConversationWindow.reset()
  },
}

let backend: MessagingRateLimitBackend = localBackend

export function configureMessagingRateLimitBackend(next: MessagingRateLimitBackend) {
  backend = next
}

function distributedWindow(bucket: string, limit: number, windowMs: number) {
  return {
    async check(key: string): Promise<RateLimitVerdict> {
      try {
        return await backend.check(bucket, key, limit, windowMs)
      } catch (error) {
        // Explicitly fail closed. A Redis outage must not silently turn off the
        // abuse boundary on every server; callers show a temporary-unavailable
        // message and no durable messaging action runs.
        console.error(`[messaging] ${bucket} rate limiter unavailable:`, error)
        return { ok: false, retryAfterMs: 0, unavailable: true }
      }
    },
  }
}

export const messageRateLimit = distributedWindow("message", 5, 5_000)
export const conversationRateLimit = distributedWindow("conversation", 5, 5 * 60_000)

export function resetMessagingRateLimits() {
  backend = localBackend
  localMessageWindow.reset()
  localConversationWindow.reset()
}

// Shared wording so the two limits read the same way. Rounds up, because
// "try again in 0 seconds" is worse than being slightly pessimistic.
export function retryWording(retryAfterMs: number): string {
  const seconds = Math.max(Math.ceil(retryAfterMs / 1000), 1)
  if (seconds < 60) return `Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`
  const minutes = Math.ceil(seconds / 60)
  return `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}
