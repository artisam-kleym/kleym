/**
 * API keys for the public read-only API. SPEC.md §6.6, AGENT.md §5.1.
 *
 * A key is shown to its owner exactly once, at creation. Only an argon2id hash
 * is stored — the same treatment as a password, because a key IS a credential
 * and a database dump must not yield working ones.
 *
 * The prefix is a lookup handle, not a secret: it narrows the verification to
 * one row so a request costs one argon2 verify rather than one per key in the
 * system.
 */
import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { prisma } from '@/lib/db/client'

/** Namespaces the token so a leaked one is recognisable in a log or a repo. */
const KEY_PREFIX = 'klm'

/*
 * The prefix is HEX, not base64url, and the key is parsed by a fixed-width
 * pattern rather than by splitting on the separator.
 *
 * base64url's alphabet contains `_`. With a base64url prefix and a
 * `split('_')` parse, any key whose random half happened to contain an
 * underscore — around half of them, over 43 characters — was rejected as
 * malformed. It resolved correctly the rest of the time, which is exactly how
 * a bug like that reaches production. Hex has no separator characters, and
 * the regex below takes the secret as "everything after the second
 * underscore" so the secret's alphabet cannot matter either.
 */
const PREFIX_BYTES = 4 // 8 hex characters
const SECRET_BYTES = 32
const KEY_PATTERN = new RegExp(`^${KEY_PREFIX}_([0-9a-f]{${PREFIX_BYTES * 2}})_(.+)$`)

/** Matches lib/auth/password.ts. Change both together. */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * A hash of a throwaway value, for the unknown-prefix path.
 *
 * Without it, an unrecognised prefix returns in microseconds while a real one
 * costs an argon2 verify — which tells an attacker when they have guessed a
 * live prefix. Same reasoning as verifyDummyPassword.
 */
const dummyHash: Promise<string> = argon2.hash('kleym-api-key-timing-equaliser', OPTIONS)
dummyHash.catch(() => undefined)

export interface IssuedKey {
  id: string
  prefix: string
  /** The full key. Returned once, never stored, never recoverable. */
  key: string
}

/**
 * Issues a key for a user.
 *
 * The prefix is unique in the schema, so a collision is retried rather than
 * surfacing as a 500. Six random bytes make one vanishingly unlikely; handling
 * it is cheaper than reasoning about how unlikely.
 */
export async function issueApiKey(userId: string, name: string): Promise<IssuedKey> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const prefix = randomBytes(PREFIX_BYTES).toString('hex')
    const secret = randomBytes(SECRET_BYTES).toString('base64url')
    const key = `${KEY_PREFIX}_${prefix}_${secret}`

    try {
      const row = await prisma.apiKey.create({
        data: { userId, name, prefix, keyHash: await argon2.hash(key, OPTIONS) },
        select: { id: true, prefix: true },
      })
      return { id: row.id, prefix: row.prefix, key }
    } catch (error) {
      if (!isPrefixCollision(error)) throw error
    }
  }
  throw new Error('could not allocate a unique API key prefix')
}

function isPrefixCollision(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: string[] | string } }
  if (e?.code !== 'P2002') return false
  const target = e.meta?.target
  return Array.isArray(target) ? target.includes('prefix') : target === 'prefix'
}

export interface ApiKeyCaller {
  keyId: string
  userId: string
}

export type ApiKeyResolution =
  | { ok: true; caller: ApiKeyCaller }
  | { ok: false; reason: 'missing' | 'malformed' | 'invalid' }

/**
 * Resolves `Authorization: Bearer <key>` to its owner.
 *
 * A revoked key is indistinguishable from a wrong one, deliberately: telling a
 * caller "this key existed but was revoked" confirms a guess. Revocation takes
 * effect on the next request because the check is here, not in a cache.
 */
export async function resolveApiKey(request: Request): Promise<ApiKeyResolution> {
  const header = request.headers.get('authorization')
  if (!header) return { ok: false, reason: 'missing' }

  const match = /^Bearer (.+)$/.exec(header.trim())
  if (!match) return { ok: false, reason: 'malformed' }

  const key = match[1]!
  const parsed = KEY_PATTERN.exec(key)
  if (!parsed) {
    // Still pay for a verify: the shape of a key must not be an oracle either.
    await argon2.verify(await dummyHash, key).catch(() => false)
    return { ok: false, reason: 'invalid' }
  }

  const row = await prisma.apiKey.findUnique({
    where: { prefix: parsed[1]! },
    select: { id: true, userId: true, keyHash: true, revokedAt: true },
  })

  if (!row) {
    await argon2.verify(await dummyHash, key).catch(() => false)
    return { ok: false, reason: 'invalid' }
  }

  const matches = await argon2.verify(row.keyHash, key).catch(() => false)

  /*
   * Verified BEFORE the revocation check, and the two are combined without
   * branching between them. Returning early on `revokedAt` would make a
   * revoked key answer faster than a live one, which leaks that the prefix is
   * real to anyone holding a stopwatch.
   */
  const live = row.revokedAt === null
  if (!(matches && live)) return { ok: false, reason: 'invalid' }

  return { ok: true, caller: { keyId: row.id, userId: row.userId } }
}

/**
 * Records use. Best-effort: `lastUsedAt` is an audit convenience, and failing
 * a request the caller was entitled to because a bookkeeping write failed
 * would be the wrong trade.
 */
export async function touchApiKey(keyId: string): Promise<void> {
  await prisma.apiKey.updateMany({
    where: { id: keyId, revokedAt: null },
    data: { lastUsedAt: new Date() },
  })
}

/** Revokes a key. Scoped by owner, per AGENT.md §5.4. */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id: keyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count > 0
}

/** What the settings page lists. Never includes the hash or the key. */
export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    // Ties are far less likely here — keys are created one at a time — but the
    // ordering costs nothing to make total, and this list is not paginated only
    // because it is short today.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  })
}

/** Exported for the tests that assert the token shape. */
export const API_KEY_FORMAT = {
  namespace: KEY_PREFIX,
  prefixChars: PREFIX_BYTES * 2,
  secretBytes: SECRET_BYTES,
  pattern: KEY_PATTERN,
} as const
