/**
 * Signed claim receipts (#81).
 *
 * A row in a table says a link was claimed. A receipt is an ARTIFACT: a
 * statement that a specific address received a specific amount at a specific
 * ledger time, which a sender can hand to a counterparty, an auditor or the
 * recipient — signed by Kleym and verifiable with the public key alone.
 *
 * Every input is ledger-derived or was recorded when the claim landed:
 * `claimedBy` is read off the submitted envelope (never from a client's
 * claim), `claimedAt`, `claimTxHash`, the memo TX2 carried (#75), and the
 * campaign's terms at that moment.
 *
 * Generated ON CLAIM, not on request. The receipt is a statement about a
 * moment, so its inputs are frozen then: `canonical` is the exact byte string
 * that was signed, stored beside the signature, and returned byte-for-byte.
 * Renaming the campaign or correcting a row later changes nothing a receipt
 * already says.
 *
 * Nothing here derives from the link (AGENT.md §4.5): no claim URL, no
 * fragment, no seed, no ephemeral secret. The claimant's `G…` address and the
 * transaction hash are what the ledger shows anyone.
 *
 * Same key, same envelope discipline as the audit (#49) and regulator (#52)
 * exports: one verification story. `pnpm receipts:verify` checks a saved
 * receipt or bundle with the public key alone.
 */
import Decimal from 'decimal.js'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { canonicalJson, signBytes, signingPublicKey, verifyBytes } from './audit-chain'
import { policyFromRow, type ClaimPolicy } from './claim-policy'

export const RECEIPT_FORMAT = 'kleym-claim-receipt'
export const RECEIPT_VERSION = 1

/** What a receipt attests. Field order is fixed by `canonicalJson`; the version names the shape. */
export interface ReceiptContents {
  format: typeof RECEIPT_FORMAT
  version: typeof RECEIPT_VERSION
  receiptId: string
  organization: { id: string; name: string }
  campaign: { id: string; name: string; network: string; assetCode: string; assetIssuer: string | null }
  link: { id: string; label: string | null; reference: string | null; category: string | null; note: string | null }
  claim: {
    /** The address the payment went to, read off the envelope. */
    recipient: string
    /** Fixed-point, what THIS link paid (#73). */
    amount: string
    assetCode: string
    /** The ledger time Kleym recorded the claim at, ISO 8601. */
    claimedAt: string
    transactionHash: string
    /** The deposit memo TX2 carried (#75), when claiming to an exchange; null otherwise. */
    memoType: string | null
    memo: string | null
    /** How the link reached the recipient: by Kleym email, or distributed by the sender. */
    deliveryChannel: 'email' | 'sender'
    /** The claim policy the gate held this claim to (#79). */
    claimPolicy: ClaimPolicy
  }
}

export interface SignedReceipt {
  receiptId: string
  contents: ReceiptContents
  /** The exact bytes that were signed, as a string. Verify THIS, not a re-serialisation. */
  canonical: string
  signature: string
  publicKey: string
}

export interface ReceiptInput {
  receiptId: string
  organization: { id: string; name: string }
  campaign: { id: string; name: string; network: string; assetCode: string; assetIssuer: string | null; claimPolicy: ClaimPolicy }
  link: { id: string; label: string | null; reference: string | null; category: string | null; note: string | null; amount: Decimal | string }
  claim: { recipient: string; claimedAt: Date; transactionHash: string; memoType: string | null; memo: string | null; emailed: boolean }
}

/** Builds and signs a receipt. Pure given its input: the same input gives the same bytes and the same signature check. */
export function buildReceipt(input: ReceiptInput): SignedReceipt {
  const contents: ReceiptContents = {
    format: RECEIPT_FORMAT,
    version: RECEIPT_VERSION,
    receiptId: input.receiptId,
    organization: { id: input.organization.id, name: input.organization.name },
    campaign: {
      id: input.campaign.id, name: input.campaign.name, network: input.campaign.network,
      assetCode: input.campaign.assetCode, assetIssuer: input.campaign.assetIssuer,
    },
    link: { id: input.link.id, label: input.link.label, reference: input.link.reference, category: input.link.category, note: input.link.note },
    claim: {
      recipient: input.claim.recipient,
      // Decimal → fixed-point (AGENT.md §4.1): never an exponent on a receipt.
      amount: new Decimal(input.link.amount.toString()).toFixed(),
      assetCode: input.campaign.assetCode,
      claimedAt: input.claim.claimedAt.toISOString(),
      transactionHash: input.claim.transactionHash,
      memoType: input.claim.memoType,
      memo: input.claim.memo,
      deliveryChannel: input.claim.emailed ? 'email' : 'sender',
      claimPolicy: input.campaign.claimPolicy,
    },
  }
  const canonical = canonicalJson(contents)
  return { receiptId: input.receiptId, contents, canonical, signature: signBytes(Buffer.from(canonical)), publicKey: signingPublicKey() }
}

/** The check an auditor runs: the bytes, the signature, the public key. No Kleym. */
export function verifyReceipt(canonical: string, signature: string, publicKey: string): boolean {
  try {
    return verifyBytes(Buffer.from(canonical), signature, publicKey)
  } catch {
    return false
  }
}

/**
 * Issues the receipt for a link that has just been claimed, exactly once:
 * the unique index on `linkId` makes a second call return the first receipt.
 * Called from the submit path with the claim already recorded.
 */
export async function issueReceipt(linkId: string): Promise<SignedReceipt | null> {
  const existing = await prisma.claimReceipt.findUnique({ where: { linkId } })
  if (existing) return fromRow(existing)

  const link = await prisma.claimLink.findUnique({
    where: { id: linkId },
    select: {
      id: true, label: true, reference: true, category: true, note: true, amount: true,
      status: true, claimedBy: true, claimedAt: true, claimTxHash: true, claimMemoType: true, claimMemo: true,
      delivery: { select: { id: true } },
      campaign: {
        select: {
          id: true, name: true, network: true, assetCode: true, assetIssuer: true, claimPolicy: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!link || link.status !== 'CLAIMED' || !link.claimedBy || !link.claimedAt || !link.claimTxHash) {
    logger.warn({ linkId }, 'receipt requested for a link that is not settled; none issued')
    return null
  }

  const receiptId = `rcpt_${link.id}`
  const receipt = buildReceipt({
    receiptId,
    organization: link.campaign.organization,
    campaign: { ...link.campaign, claimPolicy: policyFromRow(link.campaign.claimPolicy) },
    link,
    claim: {
      recipient: link.claimedBy, claimedAt: link.claimedAt, transactionHash: link.claimTxHash,
      memoType: link.claimMemoType, memo: link.claimMemo, emailed: link.delivery !== null,
    },
  })
  try {
    await prisma.claimReceipt.create({
      data: {
        id: receiptId, linkId: link.id, campaignId: link.campaign.id, organizationId: link.campaign.organization.id,
        version: RECEIPT_VERSION, canonical: receipt.canonical, signature: receipt.signature, publicKey: receipt.publicKey, claimedAt: link.claimedAt,
      },
    })
  } catch (error) {
    // Two submits racing on one claim: the unique index decides, and the first receipt is THE receipt.
    const again = await prisma.claimReceipt.findUnique({ where: { linkId } })
    if (again) return fromRow(again)
    throw error
  }
  logger.info({ linkId: link.id, campaignId: link.campaign.id, receiptId }, 'claim receipt issued')
  return receipt
}

type Row = Prisma.ClaimReceiptGetPayload<{ select: { id: true; canonical: true; signature: true; publicKey: true } }>

function fromRow(row: Row): SignedReceipt {
  return { receiptId: row.id, contents: JSON.parse(row.canonical) as ReceiptContents, canonical: row.canonical, signature: row.signature, publicKey: row.publicKey }
}

/** One receipt, for the organisation that owns the campaign — scoping in the query (AGENT.md §5.4). */
export async function receiptFor(organizationId: string, campaignId: string, linkId: string): Promise<SignedReceipt | null> {
  const row = await prisma.claimReceipt.findFirst({
    where: { linkId, campaignId, organizationId },
    select: { id: true, canonical: true, signature: true, publicKey: true },
  })
  return row ? fromRow(row) : null
}

export interface ReceiptsQuery {
  organizationId: string
  campaignId?: string
  from?: Date
  to?: Date
}

/** Every receipt in scope, one per settled claim and no others, in claim order. */
export async function receiptsFor(query: ReceiptsQuery): Promise<SignedReceipt[]> {
  const rows = await prisma.claimReceipt.findMany({
    where: {
      organizationId: query.organizationId,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.from || query.to ? { claimedAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    },
    orderBy: [{ claimedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, canonical: true, signature: true, publicKey: true },
  })
  return rows.map(fromRow)
}

export const RECEIPT_COLUMNS = [
  'receiptId', 'organizationId', 'organizationName', 'campaignId', 'campaignName', 'network', 'assetCode', 'assetIssuer',
  'linkId', 'label', 'reference', 'category', 'note',
  'recipient', 'amount', 'claimedAt', 'transactionHash', 'memoType', 'memo', 'deliveryChannel', 'claimPolicy',
  'signature', 'publicKey', 'canonical',
] as const

function csvCell(value: string | null): string {
  const text = value ?? ''
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A bundle of receipts, signed as a whole like the other exports — and each
 * receipt inside still carries its own signature over its own canonical
 * bytes, so one can be lifted out and verified alone. The CSV carries the
 * canonical string as its last column for the same reason.
 */
export function buildReceiptBundle(
  receipts: SignedReceipt[],
  query: ReceiptsQuery & { organizationName: string },
  format: 'csv' | 'json',
  generatedAt: Date = new Date(),
): { body: Buffer; contentType: string; signature: string; publicKey: string } {
  let body: Buffer
  let contentType: string
  if (format === 'json') {
    body = Buffer.from(canonicalJson({
      format: 'kleym-claim-receipts', version: 1,
      organization: { id: query.organizationId, name: query.organizationName },
      campaignId: query.campaignId ?? null,
      from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString(), count: receipts.length,
      receipts: receipts.map((r) => ({ receiptId: r.receiptId, canonical: r.canonical, signature: r.signature, publicKey: r.publicKey })),
    }))
    contentType = 'application/json'
  } else {
    const lines = [RECEIPT_COLUMNS.join(',')]
    for (const r of receipts) {
      const c = r.contents
      const row: Record<(typeof RECEIPT_COLUMNS)[number], string | null> = {
        receiptId: r.receiptId, organizationId: c.organization.id, organizationName: c.organization.name,
        campaignId: c.campaign.id, campaignName: c.campaign.name, network: c.campaign.network, assetCode: c.campaign.assetCode, assetIssuer: c.campaign.assetIssuer,
        linkId: c.link.id, label: c.link.label, reference: c.link.reference, category: c.link.category, note: c.link.note,
        recipient: c.claim.recipient, amount: c.claim.amount, claimedAt: c.claim.claimedAt, transactionHash: c.claim.transactionHash,
        memoType: c.claim.memoType, memo: c.claim.memo, deliveryChannel: c.claim.deliveryChannel, claimPolicy: c.claim.claimPolicy,
        signature: r.signature, publicKey: r.publicKey, canonical: r.canonical,
      }
      lines.push(RECEIPT_COLUMNS.map((col) => csvCell(row[col])).join(','))
    }
    body = Buffer.from(lines.join('\n') + '\n')
    contentType = 'text/csv; charset=utf-8'
  }
  return { body, contentType, signature: signBytes(body), publicKey: signingPublicKey() }
}

/** The export response envelope the audit and regulator exports use, so one verifier reads all three. */
export function receiptResponse(body: Buffer, contentType: string, signature: string, publicKey: string, filename: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'x-kleym-signature': signature,
      'x-kleym-signing-key': publicKey,
      'x-kleym-signature-alg': 'ed25519-over-body-bytes',
      'cache-control': 'no-store',
    },
  })
}
