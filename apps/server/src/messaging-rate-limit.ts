import { randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import type { MessagingRateLimitBackend, RateLimitVerdict } from "@sim-engine/trpc/messaging"

const redis = new Redis(process.env["REDIS_URL"]!, {
  // A request should receive the explicit fail-closed answer promptly instead
  // of waiting through ioredis's default retry queue while Redis is down.
  maxRetriesPerRequest: 1,
  commandTimeout: 2_000,
})

const SLIDING_WINDOW = `
local clock = redis.call('TIME')
local now = (clock[1] * 1000) + math.floor(clock[2] / 1000)
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[1]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = window - (now - tonumber(oldest[2]))
  if retry < 1 then retry = 1 end
  return {0, retry}
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window + 1000)
return {1, 0}
`

export const redisMessagingRateLimitBackend: MessagingRateLimitBackend = {
  async check(bucket, key, limit, windowMs): Promise<RateLimitVerdict> {
    const result = await redis.eval(
      SLIDING_WINDOW,
      1,
      `messaging:rate:${bucket}:${key}`,
      limit,
      windowMs,
      randomUUID()
    )
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("Redis returned an invalid messaging rate-limit result")
    }
    return Number(result[0]) === 1
      ? { ok: true }
      : { ok: false, retryAfterMs: Math.max(Number(result[1]), 1) }
  },
}

export async function closeMessagingRateLimitBackend() {
  await redis.quit()
}
