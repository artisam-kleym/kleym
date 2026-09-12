/**
 * A personal organisation for a fixture user — the shape the #44 migration
 * gave every existing user: one organisation, one OWNER membership. The id
 * is derived from the user id the same way, so a script can predict it.
 *
 * `prisma` is passed in rather than imported: the verify scripts construct
 * their client after applying env placeholders, and this must not import
 * the app's singleton before that. The generated type is import-only.
 */
import type { PrismaClient } from '../../src/generated/prisma/client'

export async function personalOrg(
  prisma: PrismaClient,
  userId: string,
  name = `org for ${userId}`,
): Promise<string> {
  const id = `org_${userId}`
  await prisma.organization.upsert({ where: { id }, update: {}, create: { id, name } })
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: id, userId } },
    update: {},
    create: { organizationId: id, userId, role: 'OWNER' },
  })
  return id
}
