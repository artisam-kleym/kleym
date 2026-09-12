/**
 * The regulator export (#52): who sent what, to whom, when, and the on-chain
 * transaction — for ONE organisation, signed with the same key and in the
 * same envelope discipline as the audit export (#49), so one verification
 * story covers both. `pnpm audit:verify-export` checks the signature of a
 * saved file with the public key alone.
 *
 * A reporting read over rows that already exist. "To whom" is what the
 * sender recorded — label and attestation fields — plus the address that
 * claimed, which is the only recipient identity the chain has. Delivery
 * email is deliberately absent: it is PII with its own retention (#50) and
 * a compliance file should not extend it.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { canonicalJson, signBytes, signingPublicKey } from './audit-chain'
import { LINK_ORDER } from './link-order'

export interface RegulatorQuery {
  organizationId: string
  from?: Date
  to?: Date
}

export const REGULATOR_COLUMNS = [
  'campaignId', 'campaignName', 'campaignStatus', 'campaignCreatedAt', 'createdBy', 'network', 'assetCode', 'assetIssuer',
  'amountPerLink', 'senderPublicKey', 'sponsorPublicKey', 'expiresAt', 'screeningDecision', 'screenedAt',
  'linkId', 'label', 'reference', 'category', 'note', 'linkStatus', 'ephemeralPublicKey', 'balanceId',
  'fundingTxHash', 'claimedBy', 'claimedAt', 'claimTxHash',
] as const

export type RegulatorRow = Record<(typeof REGULATOR_COLUMNS)[number], string | null>

/** Campaigns created in the window, every link of each. Scoped by organisation in the query, never after. */
export async function regulatorRows(query: RegulatorQuery): Promise<RegulatorRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: query.organizationId,
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, name: true, status: true, createdAt: true, network: true, assetCode: true, assetIssuer: true, amountPerLink: true,
      senderPublicKey: true, sponsorPublicKey: true, expiresAt: true, screeningDecision: true, screenedAt: true,
      user: { select: { username: true } },
      links: {
        orderBy: LINK_ORDER,
        select: {
          id: true, label: true, reference: true, category: true, note: true, status: true, ephemeralPublicKey: true, balanceId: true,
          claimedBy: true, claimedAt: true, claimTxHash: true, batch: { select: { transactionHash: true } },
        },
      },
    },
  })
  const rows: RegulatorRow[] = []
  for (const c of campaigns) {
    for (const l of c.links) {
      rows.push({
        campaignId: c.id, campaignName: c.name, campaignStatus: c.status, campaignCreatedAt: c.createdAt.toISOString(), createdBy: c.user.username,
        network: c.network, assetCode: c.assetCode, assetIssuer: c.assetIssuer, amountPerLink: new Decimal(c.amountPerLink.toString()).toFixed(),
        senderPublicKey: c.senderPublicKey, sponsorPublicKey: c.sponsorPublicKey ?? null, expiresAt: c.expiresAt.toISOString(),
        screeningDecision: c.screeningDecision ?? null, screenedAt: c.screenedAt?.toISOString() ?? null,
        linkId: l.id, label: l.label, reference: l.reference, category: l.category, note: l.note, linkStatus: l.status,
        ephemeralPublicKey: l.ephemeralPublicKey, balanceId: l.balanceId, fundingTxHash: l.batch?.transactionHash ?? null,
        claimedBy: l.claimedBy, claimedAt: l.claimedAt?.toISOString() ?? null, claimTxHash: l.claimTxHash,
      })
    }
  }
  return rows
}

function csvCell(value: string | null): string {
  const text = value ?? ''
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The body and a detached signature over exactly those bytes — as `buildExport` does for the audit log. */
export function buildRegulatorExport(
  rows: RegulatorRow[],
  query: RegulatorQuery & { organizationName: string },
  format: 'csv' | 'json',
  generatedAt: Date = new Date(),
): { body: Buffer; contentType: string; signature: string; publicKey: string } {
  let body: Buffer
  let contentType: string
  if (format === 'json') {
    body = Buffer.from(canonicalJson({
      format: 'kleym-regulator-export', version: 1,
      organization: { id: query.organizationId, name: query.organizationName },
      from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString(), count: rows.length, rows,
    }))
    contentType = 'application/json'
  } else {
    const lines = [REGULATOR_COLUMNS.join(',')]
    for (const r of rows) lines.push(REGULATOR_COLUMNS.map((c) => csvCell(r[c])).join(','))
    body = Buffer.from(lines.join('\n') + '\n')
    contentType = 'text/csv; charset=utf-8'
  }
  return { body, contentType, signature: signBytes(body), publicKey: signingPublicKey() }
}
