/** Per-sponsor float, binding and runway for /admin. Issue #48. */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { sponsorSpendable } from '@/lib/stellar/horizon'
import { runwayDays, sponsorPool, type SpendableReader, type SponsorStatus } from '@/lib/stellar/sponsors'

const WINDOW_DAYS = 7

export async function sponsorStatuses(read: SpendableReader = sponsorSpendable, now: Date = new Date()): Promise<SponsorStatus[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
  const pool = sponsorPool()
  const out: SponsorStatus[] = []
  for (const sponsor of pool) {
    // Rows older than the pool have a null sponsor and read as the primary.
    const bound = sponsor.index === 0 ? { OR: [{ sponsorPublicKey: sponsor.publicKey }, { sponsorPublicKey: null }] } : { sponsorPublicKey: sponsor.publicKey }
    const [campaigns, claims] = await Promise.all([
      prisma.campaign.count({ where: { ...bound, status: { in: ['ACTIVE', 'PARTIAL', 'CREATING'] } } }),
      prisma.claimLink.count({ where: { campaign: bound, status: 'CLAIMED', claimedAt: { gte: since } } }),
    ])
    let spendable: Decimal | null = null
    try {
      spendable = await read(sponsor.publicKey)
    } catch (error) {
      logger.warn({ sponsor: sponsor.publicKey, reason: error instanceof Error ? error.message : 'unknown' }, 'sponsor balance could not be read for /admin')
    }
    const claimsPerDay = new Decimal(claims).dividedBy(WINDOW_DAYS)
    const runway = spendable ? runwayDays(spendable, claimsPerDay, Number(env.BASE_FEE_STROOPS)) : null
    out.push({
      publicKey: sponsor.publicKey,
      index: sponsor.index,
      spendable: spendable?.toFixed() ?? null,
      campaigns,
      claimsPerDay: claimsPerDay.toDecimalPlaces(1).toFixed(),
      runwayDays: runway?.toFixed() ?? null,
      low: spendable !== null && spendable.lessThan(env.SPONSOR_MIN_BALANCE_ALERT),
    })
  }
  return out
}
