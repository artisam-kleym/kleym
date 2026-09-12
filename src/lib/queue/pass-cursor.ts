/**
 * Where a bounded scheduled pass stopped, so the next one continues from there.
 *
 * Redis, not a column: advancing a per-row column would write every row on
 * every run, which is exactly the noise SPEC.md §10.13 asks a second run not
 * to add. Losing the cursor costs one pass restarting from the top, which is
 * harmless — every pass is idempotent.
 *
 * Shared by the maintenance jobs that walk the link table with one Horizon
 * read per link (reconcile, ephemeral-watch), each under its own key.
 */
import { redis } from '@/lib/redis/client'

export interface PassCursor {
  get(): Promise<string | null>
  /** `null` means the pass reached the end; the next one starts from the top. */
  set(afterId: string | null): Promise<void>
}

export function redisPassCursor(key: string): PassCursor {
  return {
    get: () => redis.get(key),
    set: async (id) => {
      if (id === null) await redis.del(key)
      else await redis.set(key, id)
    },
  }
}

/** For verification scripts: a cursor that lives in one variable. */
export function memoryPassCursor(): PassCursor & { value: string | null } {
  const cursor = {
    value: null as string | null,
    get: async () => cursor.value,
    set: async (id: string | null) => {
      cursor.value = id
    },
  }
  return cursor
}
