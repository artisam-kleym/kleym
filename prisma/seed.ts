/**
 * Seed script — SPEC.md §4.2.
 *
 * Creates exactly one admin, from explicit credentials. Four rules, all of them
 * refusals:
 *
 *   1. Refuses to run if SEED_ADMIN_USERNAME or SEED_ADMIN_PASSWORD is unset.
 *      No hardcoded fallback, no admin/admin.
 *   2. Refuses to run in production unless ALLOW_PROD_SEED=true.
 *   3. Idempotent — upserts on username, so running twice yields one admin.
 *   4. Prints the username. NEVER the password.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import argon2 from 'argon2'

/** OWASP-aligned argon2id parameters. AGENT.md §5.1 — never bcrypt, never SHA. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

function fail(message: string): never {
  console.error(`\nSeed refused: ${message}\n`)
  process.exit(1)
}

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME
  const password = process.env.SEED_ADMIN_PASSWORD
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) fail('DATABASE_URL is not set.')

  // Rule 1 — explicit credentials, or nothing.
  if (!username || !password) {
    fail(
      'SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must both be set.\n' +
        'There is deliberately no default: a seeded admin/admin in an environment ' +
        'someone forgot about is a live credential.',
    )
  }

  // Rule 2 — production needs an explicit, separate act of intent.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    fail('NODE_ENV=production. Set ALLOW_PROD_SEED=true to seed a production database.')
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

  try {
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)

    // Rule 3 — idempotent. Re-running rotates the password rather than
    // creating a second admin or silently diverging from the environment.
    const admin = await prisma.user.upsert({
      where: { username },
      update: { passwordHash, role: 'ADMIN', isActive: true, failedLogins: 0, lockedUntil: null },
      create: { username, passwordHash, role: 'ADMIN' },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
    })

    // Rule 4 — the password is never printed, logged, or returned.
    const created = admin.createdAt.getTime() === admin.updatedAt.getTime()
    console.log(`Admin ${created ? 'created' : 'updated'}: ${admin.username} (${admin.role})`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Never surface the password, even in a stack trace.
  console.error('\nSeed failed:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
