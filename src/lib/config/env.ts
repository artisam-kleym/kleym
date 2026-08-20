/**
 * Startup configuration. SPEC.md §9.1.
 *
 * Every key is validated here, once, at import time. A missing or malformed
 * value fails the process with a readable list rather than surfacing as an
 * undefined deep inside a request.
 */
import { z } from 'zod'

/** Stellar secret seeds are 56 characters and begin with S. */
const SECRET_SEED = /^S[A-Z2-7]{55}$/
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
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 bytes of base64-encoded randomness'),
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
    .filter(([key, value]) => key.startsWith('NEXT_PUBLIC_') && value && SECRET_SEED.test(value))
    .map(([key]) => `${key}: holds a Stellar secret seed and would be inlined into the client bundle`)
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

export const env: Env = load(process.env)
