/**
 * GET /api/campaigns/[id]/links/[linkId]/receipt — one signed claim receipt (#81).
 *
 * The body is the receipt's exact signed bytes, and the signature and public
 * key travel in the same headers the audit and regulator exports use, so the
 * file a sender saves is what was signed and one verifier reads all three.
 * Organisation-scoped in the query. A link that is not settled has no
 * receipt and answers 404, like an unknown one.
 */
import { requireUser } from '@/lib/api/session-guard'
import { notFound, serverError } from '@/lib/api/problems'
import { logger } from '@/lib/config/logger'
import { issueReceipt, receiptFor, receiptResponse } from '@/lib/api/receipts'
import { prisma } from '@/lib/db/client'
import { owned } from '@/lib/api/session-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; linkId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id, linkId } = await params

  try {
    let receipt = await receiptFor(org.id, id, linkId)
    if (!receipt) {
      // Issued at claim time as a rule; issued here only if that write failed
      // then — the inputs are the same frozen row either way.
      const settled = await prisma.claimLink.findFirst({
        where: { id: linkId, campaignId: id, status: 'CLAIMED', campaign: owned(id, org.id) },
        select: { id: true },
      })
      if (settled) receipt = await issueReceipt(settled.id)
    }
    if (!receipt) return notFound()
    return receiptResponse(Buffer.from(receipt.canonical), 'application/json', receipt.signature, receipt.publicKey, `kleym-receipt-${receipt.receiptId}.json`)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'receipt fetch failed')
    return serverError()
  }
}
