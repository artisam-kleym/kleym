/**
 * The ONLY way an attribute reaches a span or a metric label. Issue #53.
 *
 * Span attributes and metric labels are a log by another name, and the
 * logger's redaction (lib/config/logger.ts) does not see them. So this is
 * the tracing side's equivalent, written as an allowlist rather than a
 * denylist: a key that is not named here is dropped, and a value that
 * looks like key material, a claim fragment or a claim-path identifier is
 * dropped whatever its key. CI greps that nothing else in src/ sets an
 * attribute directly.
 */
import { containsSecretSeed } from '@/lib/validation/stellar'
import { isForbiddenKey } from '@/lib/api/audit'

export type AttributeValue = string | number | boolean

/**
 * Every key any span or metric may carry. Adding one is a deliberate act —
 * the test in tests/lib/observability pins this list, and the CI secrets
 * job runs that test.
 */
export const ALLOWED_ATTRIBUTE_KEYS = [
  'phase', 'outcome', 'route', 'queue', 'state', 'network', 'dependency', 'reason', 'job',
  'campaignId', 'batchId', 'sequence', 'jobId', 'attempt', 'remaining', 'checked', 'sponsor', 'index',
  'error.type', 'service', 'links',
] as const

const ALLOWED = new Set<string>(ALLOWED_ATTRIBUTE_KEYS)

/** Attributes whose value may be a Stellar PUBLIC key (a sponsor's is public and operational). */
const PUBLIC_KEY_ALLOWED = new Set(['sponsor'])

const PUBLIC_KEY = /G[A-Z2-7]{55}/
const FRAGMENT = /#s=|[?&]s=/i
/** A signed envelope or claim body: base64 that is far too long to be a label. */
const LONG_OPAQUE = /^[A-Za-z0-9+/=_-]{120,}$/

export function isSafeAttributeValue(key: string, value: unknown): value is AttributeValue {
  if (typeof value === 'number' || typeof value === 'boolean') return Number.isFinite(value) || typeof value === 'boolean'
  if (typeof value !== 'string') return false
  if (value.length > 200) return false
  if (containsSecretSeed(value)) return false
  if (FRAGMENT.test(value)) return false
  if (LONG_OPAQUE.test(value)) return false
  if (PUBLIC_KEY.test(value) && !PUBLIC_KEY_ALLOWED.has(key)) return false
  return true
}

export interface Scrubbed {
  attributes: Record<string, AttributeValue>
  /** Keys that were dropped, for a warning line — the names, never the values. */
  dropped: string[]
}

export function safeAttributes(input: Record<string, unknown> | undefined): Scrubbed {
  const attributes: Record<string, AttributeValue> = {}
  const dropped: string[] = []
  if (!input) return { attributes, dropped }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (!ALLOWED.has(key) || isForbiddenKey(key) || !isSafeAttributeValue(key, value)) {
      dropped.push(key)
      continue
    }
    attributes[key] = value
  }
  return { attributes, dropped }
}
