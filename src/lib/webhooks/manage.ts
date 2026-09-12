/** Webhook endpoints, as an Owner manages them. Issue #51. */
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { recordAudit } from '@/lib/api/audit'
import type { OrgScope } from '@/lib/api/session-guard'
import { outboundUrl } from '@/lib/validation/outbound-url'
import { WEBHOOK_EVENTS } from './events'

export const createEndpointSchema = z
  .object({
    url: outboundUrl,
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
  })
  .strict()

export const ENDPOINT_SELECT = {
  id: true, url: true, events: true, disabledAt: true, failures: true, createdAt: true,
} as const

/** The signing key is returned ONCE, here, and never again. */
export async function createEndpoint(actorId: string, org: OrgScope, input: z.infer<typeof createEndpointSchema>, ip: string | null) {
  const signingKey = `whsec_${randomBytes(24).toString('base64url')}`
  const endpoint = await prisma.webhookEndpoint.create({
    data: { organizationId: org.id, url: input.url, events: input.events, signingKey },
    select: ENDPOINT_SELECT,
  })
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.webhook_add', entityType: 'webhook', entityId: endpoint.id,
    metadata: { host: hostOf(input.url), events: input.events.join(',') }, ip,
  })
  return { endpoint, signingKey }
}

export function listEndpoints(organizationId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { ...ENDPOINT_SELECT, _count: { select: { deliveries: { where: { status: 'PARKED' } } } } },
  })
}

/** Scoped in the query: an id from another organisation deletes nothing. */
export async function deleteEndpoint(actorId: string, org: OrgScope, id: string, ip: string | null): Promise<boolean> {
  const removed = await prisma.webhookEndpoint.deleteMany({ where: { id, organizationId: org.id } })
  if (removed.count === 0) return false
  await recordAudit({ userId: actorId, organizationId: org.id, action: 'org.webhook_remove', entityType: 'webhook', entityId: id, metadata: {}, ip })
  return true
}

/** Re-enable a parked endpoint; the failure count restarts. */
export async function enableEndpoint(actorId: string, org: OrgScope, id: string, ip: string | null): Promise<boolean> {
  const updated = await prisma.webhookEndpoint.updateMany({ where: { id, organizationId: org.id }, data: { disabledAt: null, failures: 0 } })
  if (updated.count === 0) return false
  await recordAudit({ userId: actorId, organizationId: org.id, action: 'org.webhook_enable', entityType: 'webhook', entityId: id, metadata: {}, ip })
  return true
}

/** The delivery log for one endpoint of THIS organisation. Payload included: it is the organisation's own data. */
export async function listDeliveries(organizationId: string, endpointId: string, limit = 50) {
  return prisma.webhookDelivery.findMany({
    where: { endpointId, endpoint: { organizationId } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, event: true, status: true, attempts: true, lastStatus: true, lastError: true, deliveredAt: true, createdAt: true },
  })
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
