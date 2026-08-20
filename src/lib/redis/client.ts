/**
 * Redis singleton, constructed lazily for the same reason as the Prisma client:
 * reading env at module scope would drag the whole environment into `next build`.
 *
 * Used for rate limiting and, later, the OTP store and BullMQ queues.
 */
import Redis from 'ioredis'
import { env } from '@/lib/config/env'

const globalForRedis = globalThis as unknown as { redis?: Redis }

function create(): Redis {
  const client = new Redis(env.REDIS_URL, {
    /*
     * The offline queue stays ENABLED, deliberately.
     *
     * Disabling it looks right — "a rate limiter that queues during an outage
     * is not a rate limiter" — but it conflates two different states. ioredis
     * uses the same queue for commands issued before the initial connection
     * completes, so with it off, the first request after a cold start throws
     * "Stream isn't writeable" and the limiter fails closed on a healthy
     * system. That denies real logins.
     *
     * The timeouts below are what actually bound an outage: a genuinely
     * unreachable Redis fails within commandTimeout rather than queueing
     * indefinitely, and the limiter then fails closed for the right reason.
     */
    enableOfflineQueue: true,
    connectTimeout: 5_000,
    commandTimeout: 2_000,
    maxRetriesPerRequest: 2,
  })
  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = client
  return client
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, key) {
    const client = (globalForRedis.redis ??= create())
    const value = Reflect.get(client, key)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
