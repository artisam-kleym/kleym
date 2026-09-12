/**
 * Startup configuration. SPEC.md §9.1.
 *
 * Every key is validated here, once, at import time. A missing or malformed
 * value fails the process with a readable list rather than surfacing as an
 * undefined deep inside a request.
 */
import { z } from 'zod'

/**
 * Two regexes, deliberately. Do not collapse them.
 *
 * SECRET_SEED is anchored, for validating that SPONSOR_SECRET_KEY *is* a seed
 * and nothing else. SECRET_SEED_ANYWHERE is unanchored, for detecting a seed
 * *embedded* in some other value — a connection string, a callback URL, or a
 * value with a stray trailing newline from a paste into a secret-store field.
 *
 * The leak scan below must use the unanchored form. An anchored scan passes on
 * the most likely shape of the mistake, which is worse than no scan at all
 * because it records AGENT.md §5.5 as satisfied.
 */
const SECRET_SEED = /^S[A-Z2-7]{55}$/
const SECRET_SEED_ANYWHERE = /S[A-Z2-7]{55}/
const PUBLIC_KEY = /^G[A-Z2-7]{55}$/

const schema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // Sessions
  // Checked in DECODED BYTES, not characters. 32 base64 characters decode to
  // only 24 bytes, so a .min(32) on the string would pass a secret weaker than
  // the message promises.
  SESSION_SECRET: z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length >= 32
      } catch {
        return false
      }
    },
    { message: 'SESSION_SECRET must decode to at least 32 bytes (44+ base64 characters)' },
  ),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  // Audit export signing (#49): a 32-byte Ed25519 seed, base64. The public
  // key is derived from it and handed out with every export; the seed itself
  // is a secret in the same class as SESSION_SECRET.
  AUDIT_SIGNING_SEED: z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length === 32
      } catch {
        return false
      }
    },
    { message: 'AUDIT_SIGNING_SEED must decode to exactly 32 bytes (44 base64 characters)' },
  ),

  /**
   * Credentials Kleym holds for OTHER systems (#46): an OIDC client secret
   * is encrypted under this at rest. 32 bytes, base64. Not Stellar key
   * material — those are never stored — but never in a column in the clear.
   */
  CREDENTIAL_ENCRYPTION_KEY: z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length === 32
      } catch {
        return false
      }
    },
    { message: 'CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (44 base64 characters)' },
  ),

  // Stellar
  STELLAR_NETWORK: z.enum(['testnet', 'public']).default('testnet'),
  HORIZON_URL: z.url(),
  NETWORK_PASSPHRASE: z.string().min(1),
  SPONSOR_PUBLIC_KEY: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
  SPONSOR_SECRET_KEY: z.string().regex(SECRET_SEED, 'must be a Stellar secret seed (S…)'),
  /**
   * Further sponsor seeds, comma-separated, forming a pool with the primary
   * (#48). Their public keys are derived. Every one is a secret in the same
   * class as SPONSOR_SECRET_KEY, and the whole variable is redacted.
   */
  SPONSOR_SECRET_KEYS_EXTRA: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((k) => k.trim()).filter(Boolean))
    .refine((keys) => keys.every((k) => SECRET_SEED.test(k)), { message: 'every entry must be a Stellar secret seed (S…)' }),
  SPONSOR_MIN_BALANCE_ALERT: z.coerce.number().nonnegative().default(100),
  /** Below this spendable XLM a sponsor is not chosen for NEW campaigns. */
  SPONSOR_WORKING_THRESHOLD: z.coerce.number().nonnegative().default(50),
  /**
   * Outbound alert receiver (#48): a webhook URL that gets a JSON POST when a
   * sponsor crosses the alert threshold or the pool fails over. Optional;
   * unset means alerts go to the log only. May embed a token, so it is a
   * secret.
   */
  ALERT_WEBHOOK_URL: z.union([z.url(), z.literal('')]).default(''),

  /**
   * Compliance screening (#52). The callback URL itself is per organisation
   * (`Organization.screeningUrl`); these are deployment-wide. The secret, when
   * set, signs every callback request (HMAC-SHA256 over the body) so the
   * receiver can tell Kleym from anyone who found the URL. The timeout is the
   * whole budget for one screening call; past it the campaign is HELD.
   */
  SCREENING_WEBHOOK_SECRET: z.string().default(''),
  SCREENING_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),

  /**
   * OpenTelemetry (#53). Set the endpoint and both processes export traces and
   * metrics over OTLP/HTTP; unset, nothing is registered. Headers carry the
   * backend's token, so they are a secret.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.union([z.url(), z.literal('')]).default(''),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().default(''),
  OTEL_METRIC_EXPORT_INTERVAL_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),

  // Batching
  MAX_OPS_PER_BATCH: z.coerce.number().int().positive().max(100).default(90),
  MAX_LINKS_PER_CAMPAIGN: z.coerce.number().int().positive().default(10_000),

  /*
   * Per-operation fee, in stroops. The network minimum is 100; the default here
   * is 10x that so a batch still clears when the ledger is congested and
   * surge pricing lifts the floor. A batch of 90 costs 0.009 XLM at this rate,
   * which is not what makes a campaign expensive — the reserves are.
   */
  BASE_FEE_STROOPS: z.coerce.number().int().min(100).default(1_000).transform(String),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.email(),

  // Seed (dev only)
  SEED_ADMIN_USERNAME: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  ALLOW_PROD_SEED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

/**
 * Every environment key whose value must never reach a log line.
 *
 * SINGLE SOURCE OF TRUTH. `src/lib/config/logger.ts` derives its redaction
 * paths from this list, and CI fails if a secret-shaped key is added to the
 * schema above without being classified here (or explicitly marked non-secret
 * in the workflow). Adding a secret and forgetting to redact it was a real
 * leak, not a hypothetical one — see the DATABASE_URL entry.
 */
export const SECRET_ENV_KEYS = [
  'SPONSOR_SECRET_KEY',
  'SPONSOR_SECRET_KEYS_EXTRA',
  'ALERT_WEBHOOK_URL',
  'SCREENING_WEBHOOK_SECRET',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'SESSION_SECRET',
  'CREDENTIAL_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'SEED_ADMIN_PASSWORD',
  // Both embed credentials in the connection string.
  'DATABASE_URL',
  'REDIS_URL',
] as const

export type Env = z.infer<typeof schema>

/**
 * AGENT.md §5.5: a secret must never be exposed to the client bundle. Next.js
 * inlines every NEXT_PUBLIC_* variable, so a secret-shaped value under that
 * prefix would ship to every browser.
 */
function assertNoPublicSecrets(raw: NodeJS.ProcessEnv): string[] {
  return Object.entries(raw)
    .filter(([key, value]) => key.startsWith('NEXT_PUBLIC_') && value && SECRET_SEED_ANYWHERE.test(value))
    .map(([key]) => `${key}: contains a Stellar secret seed and would be inlined into the client bundle`)
}

function load(raw: NodeJS.ProcessEnv): Env {
  const leaks = assertNoPublicSecrets(raw)
  const parsed = schema.safeParse(raw)

  if (leaks.length > 0 || !parsed.success) {
    const problems = [
      ...leaks,
      ...(parsed.success
        ? []
        : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)),
    ]
    // Deliberately not thrown as a stack trace — this is the first thing an
    // operator sees on a bad deploy, so it reads as a checklist.
    console.error(
      ['', 'Invalid environment configuration:', ...problems.map((p) => `  • ${p}`), '', 'See .env.example for every key this application requires.', ''].join('\n'),
    )
    process.exit(1)
  }

  return parsed.data
}

/**
 * Validation is deferred to first access rather than run at module scope.
 *
 * Next evaluates route modules during "Collecting page data", so validating on
 * import made `pnpm build` require the full runtime environment — including
 * SPONSOR_SECRET_KEY. That widened the one key that matters most (AGENT.md
 * §5.5) from the running service's secret store to the build step, its logs,
 * and its cache, as a side effect rather than a decision.
 *
 * Startup still fails fast: the first real read of any key validates the whole
 * set and exits with the same checklist.
 */
let cached: Env | undefined

export const env: Env = new Proxy({} as Env, {
  get(_target, key: string | symbol) {
    cached ??= load(process.env)
    return cached[key as keyof Env]
  },
  has(_target, key: string | symbol) {
    cached ??= load(process.env)
    return key in cached
  },
  ownKeys() {
    cached ??= load(process.env)
    return Reflect.ownKeys(cached)
  },
  getOwnPropertyDescriptor(_target, key: string | symbol) {
    cached ??= load(process.env)
    return Reflect.getOwnPropertyDescriptor(cached, key)
  },
})
