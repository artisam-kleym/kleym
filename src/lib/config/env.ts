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

  // Stellar
  STELLAR_NETWORK: z.enum(['testnet', 'public']).default('testnet'),
  HORIZON_URL: z.url(),
  NETWORK_PASSPHRASE: z.string().min(1),
  SPONSOR_PUBLIC_KEY: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
  SPONSOR_SECRET_KEY: z.string().regex(SECRET_SEED, 'must be a Stellar secret seed (S…)'),
  SPONSOR_MIN_BALANCE_ALERT: z.coerce.number().nonnegative().default(100),

  // Batching
  MAX_OPS_PER_BATCH: z.coerce.number().int().positive().max(100).default(90),
  MAX_LINKS_PER_CAMPAIGN: z.coerce.number().int().positive().default(10_000),

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
