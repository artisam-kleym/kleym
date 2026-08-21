/**
 * Prisma client singleton.
 *
 * Constructed LAZILY. Building it at module scope would read env.DATABASE_URL
 * on import, and route handlers are evaluated during `next build` — which would
 * make the build require the full environment again, the coupling #20 removed
 * and #22's CI step exists to detect.
 *
 * The global cache handles Next's dev-server hot reload: a plain
 * `new PrismaClient()` per reload leaks a connection pool until Postgres
 * refuses new connections.
 */
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '@/lib/config/env'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function create(): PrismaClient {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, key) {
    const client = (globalForPrisma.prisma ??= create())
    const value = Reflect.get(client, key)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
