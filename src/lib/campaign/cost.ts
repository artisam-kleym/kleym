/**
 * What a campaign costs the sender, shown before they commit. SPEC.md §5.3.
 *
 * Decimal throughout. AGENT.md §4.1 forbids JS `Number` for an amount, and
 * this is the number the sender reads before signing away real funds — a float
 * artefact here is a number that does not match what leaves their account.
 */
import Decimal from 'decimal.js'
import { batchCount } from '@/lib/stellar/batch'
import { isStellarAmount } from '@/lib/stellar/amount'

const ExactAmount = Decimal.clone({ precision: 40 })

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
  sponsored?: boolean
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
  sponsored?: boolean
}

export function computeCost(input: CostInput): CostBreakdown {
  if (!isStellarAmount(input.amountPerLink) || input.amounts?.slice(0, input.linkCount).some((amount) => amount !== null && !isStellarAmount(amount))) {
    throw new Error('Use a positive amount within the Stellar limit, with at most seven decimal places.')
  }
  const links = new Decimal(input.linkCount)
  const capacity = input.maxOpsPerBatch - (input.sponsored ? 2 : 0)
  const batches = batchCount(input.linkCount, capacity)

  return {
    totalAmount: totalAmount(input).toFixed(),
    totalReserve: new Decimal(input.reservePerLink).times(links).toFixed(),
    // One operation per link, whatever the batching; fees are per operation.
    totalFee: new Decimal(input.baseFeeStroops).times(links.plus(input.sponsored ? batches * 2 : 0)).div(1e7).toFixed(),
    batches,
    // One wallet prompt per batch — the number the sender actually experiences.
    signatures: batches,
    ...(input.sponsored ? { sponsored: true } : {}),
  }
}

/**
 * The asset total: a SUM over the links, not a multiplication (#73). Each of
 * the `linkCount` links pays its own amount when one was given and the
 * default otherwise; entries past the count are not links and do not count.
 */
function totalAmount(input: CostInput): Decimal {
  const fallback = new ExactAmount(input.amountPerLink)
  if (!input.amounts) return fallback.times(input.linkCount)
  let total = new ExactAmount(0)
  for (let index = 0; index < input.linkCount; index += 1) {
    const own = input.amounts[index]
    total = total.plus(own ? new ExactAmount(own) : fallback)
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
    reserve: cost.sponsored === true || (xlm !== null && xlm.greaterThanOrEqualTo(xlmNeeded)),
  }
}
