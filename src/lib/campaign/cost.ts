/**
 * What a campaign costs the sender, shown before they commit. SPEC.md §5.3.
 *
 * Decimal throughout. AGENT.md §4.1 forbids JS `Number` for an amount, and
 * this is the number the sender reads before signing away real funds — a float
 * artefact here is a number that does not match what leaves their account.
 */
import Decimal from 'decimal.js'
import { batchCount } from '@/lib/stellar/batch'

export interface CostInput {
  /** The default per link — and the whole answer for a uniform campaign. */
  amountPerLink: string
  /** Per-link amounts (#73), by index; null or missing entries take the default. */
  amounts?: (string | null)[]
  linkCount: number
  /** From GET /api/stellar/reserve — the LIVE protocol value, never a constant. */
  reservePerLink: string
  maxOpsPerBatch: number
  baseFeeStroops: string
}

export interface CostBreakdown {
  /** Asset moved into claimable balances. */
  totalAmount: string
  /** XLM locked as reserve until each link is claimed or reclaimed. */
  totalReserve: string
  /** XLM spent on fees. Not recoverable, unlike the reserve. */
  totalFee: string
  batches: number
  signatures: number
}

export function computeCost(input: CostInput): CostBreakdown {
  const links = new Decimal(input.linkCount)
  const batches = batchCount(input.linkCount, input.maxOpsPerBatch)

  return {
    totalAmount: totalAmount(input).toFixed(),
    totalReserve: new Decimal(input.reservePerLink).times(links).toFixed(),
    // One operation per link, whatever the batching; fees are per operation.
    totalFee: new Decimal(input.baseFeeStroops).times(links).div(1e7).toFixed(),
    batches,
    // One wallet prompt per batch — the number the sender actually experiences.
    signatures: batches,
  }
}

/**
 * The asset total: a SUM over the links, not a multiplication (#73). Each of
 * the `linkCount` links pays its own amount when one was given and the
 * default otherwise; entries past the count are not links and do not count.
 */
function totalAmount(input: CostInput): Decimal {
  const fallback = new Decimal(input.amountPerLink)
  if (!input.amounts) return fallback.times(input.linkCount)
  let total = new Decimal(0)
  for (let index = 0; index < input.linkCount; index += 1) {
    const own = input.amounts[index]
    total = total.plus(own ? new Decimal(own) : fallback)
  }
  return total
}

/**
 * Whether the sender holds enough of the asset.
 *
 * Reserve is always XLM; the asset may not be. When it is not, two separate
 * balances have to cover two separate costs, and reporting one total would
 * tell the sender they can afford something they cannot.
 */
export function affordability(
  cost: CostBreakdown,
  balances: { assetBalance: string | null; xlmBalance: string | null },
  assetIsNative: boolean,
): { asset: boolean; reserve: boolean } {
  const xlm = balances.xlmBalance === null ? null : new Decimal(balances.xlmBalance)
  const asset = balances.assetBalance === null ? null : new Decimal(balances.assetBalance)

  const xlmNeeded = assetIsNative
    ? new Decimal(cost.totalAmount).plus(cost.totalReserve).plus(cost.totalFee)
    : new Decimal(cost.totalReserve).plus(cost.totalFee)

  return {
    asset: assetIsNative ? true : asset !== null && asset.greaterThanOrEqualTo(cost.totalAmount),
    reserve: xlm !== null && xlm.greaterThanOrEqualTo(xlmNeeded),
  }
}
