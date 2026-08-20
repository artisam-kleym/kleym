import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 moved the datasource URL out of schema.prisma. SPEC.md §4 shows it
 * inside the `datasource` block, which that version rejects outright.
 *
 * DATABASE_URL is read straight from the environment rather than through
 * src/lib/config/env.ts on purpose: the Prisma CLI runs outside the app, and
 * pulling in the full Zod schema would make `prisma migrate` require every
 * unrelated key — including SPONSOR_SECRET_KEY — to run a migration.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
