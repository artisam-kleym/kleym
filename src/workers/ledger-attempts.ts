import { prisma } from '@/lib/db/client'
import { submitClaim } from '@/lib/api/claims'
import { submitReclaim } from '@/lib/api/reclaim'
import { parseAttempt } from '@/lib/stellar/attempts'
import { logger } from '@/lib/config/logger'

/** Recover the original signed transaction before general reconciliation. */
export async function recoverLedgerAttempts(campaignId?: string): Promise<void> {
  const attempts = await prisma.ledgerAttempt.findMany({
    where: { ...(campaignId ? { campaignId } : {}), status: { in: ['SUBMITTED', 'CONFIRMED'] }, submittedXdr: { not: null } },
    include: { campaign: { select: { organizationId: true } } },
  })
  for (const attempt of attempts) {
    try {
      if (attempt.kind === 'RECLAIM') {
        await submitReclaim(attempt.campaignId, attempt.campaign.organizationId, { signedXdr: attempt.submittedXdr! })
      } else {
        const transaction = parseAttempt(attempt.preparedXdr)
        const key = attempt.kind === 'MATERIALISE'
          ? transaction.operations.find((operation) => operation.type === 'createAccount')?.destination
          : transaction.operations.find((operation) => operation.type === 'claimClaimableBalance')?.source
        // A WALLET claim's operation source is the recipient, not its link key.
        // Resolve the durable link identity from the prepared scope instead.
        const linkId = attempt.scope.slice(attempt.scope.indexOf(':') + 1)
        const link = await prisma.claimLink.findFirst({ where: { id: linkId, campaignId: attempt.campaignId }, select: { ephemeralPublicKey: true } })
        if (link) await submitClaim(link.ephemeralPublicKey, attempt.submittedXdr!, attempt.kind === 'MATERIALISE' ? 'materialise' : 'claim')
        else if (key) logger.warn({ scope: attempt.scope }, 'ledger attempt has no matching link')
      }
    } catch {
      logger.warn({ scope: attempt.scope, hash: attempt.transactionHash }, 'ledger attempt recovery deferred')
    }
  }
}
