/**
 * Receive-as (#74): the recipient chooses what they receive.
 *
 * Kleym builds and sponsor-signs TX2, so a conversion inserted there happens
 * atomically with the claim or not at all — a `pathPaymentStrictSend` from
 * the ephemeral account replaces the plain payment (lib/stellar/claim.ts).
 *
 * `destMin` is the whole risk control. A path payment without it fills at
 * any price the book happens to offer; with it, a market that moved makes
 * the transaction FAIL, which leaves the balance claimable and the recipient
 * offered the asset the sender actually sent. So the quote is Kleym's own
 * Horizon client's `strictSendPaths`, the bound is applied here and never
 * supplied by the page, and `/claim` still makes zero third-party requests
 * (SPEC.md §3.6).
 */
import { Asset, StrKey } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { horizon } from './horizon'

/**
 * How far below the quote the fill may land, in basis points. 1%: wide
 * enough that a normal book between quote and ledger clears, tight enough
 * that a thin one refuses rather than fills at whatever is there.
 */
export const SLIPPAGE_BPS = 100

/** `"XLM"` or `"CODE:GISSUER…"` — how an allowed asset is stored on the campaign. */
export type AssetRef = string

const CODE = /^[A-Za-z0-9]{1,12}$/

/** Parses a stored ref. Null for anything malformed — a stored value is not trusted either. */
export function parseAssetRef(ref: string): Asset | null {
  if (ref === 'XLM' || ref === 'native') return Asset.native()
  const [code, issuer, ...rest] = ref.split(':')
  if (!code || !issuer || rest.length > 0) return null
  if (!CODE.test(code) || !StrKey.isValidEd25519PublicKey(issuer)) return null
  try {
    return new Asset(code, issuer)
  } catch {
    return null
  }
}

export function assetRef(asset: Asset): AssetRef {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`
}

/** The wire shape the claim page sees. */
export function assetFields(asset: Asset): { assetCode: string; assetIssuer: string | null } {
  return asset.isNative()
    ? { assetCode: 'XLM', assetIssuer: null }
    : { assetCode: asset.getCode(), assetIssuer: asset.getIssuer() ?? null }
}

/**
 * The quote minus tolerance, rounded DOWN to Stellar's seven places
 * (AGENT.md §4.1: never round a user-facing amount up). One stroop is the
 * floor — a `destMin` of zero would be no bound at all.
 */
export function boundDestMin(destAmount: string, slippageBps = SLIPPAGE_BPS): string {
  const bounded = new Decimal(destAmount).times(new Decimal(10_000 - slippageBps)).div(10_000).toDecimalPlaces(7, Decimal.ROUND_DOWN)
  return (bounded.lessThan('0.0000001') ? new Decimal('0.0000001') : bounded).toFixed(7)
}

export interface Quote {
  /** What the best path delivers right now, at the quoted ledger. */
  destAmount: string
  /** `destAmount` less `SLIPPAGE_BPS`; what TX2 is bound to. */
  destMin: string
  /** Intermediate assets of the path that was priced. */
  path: Asset[]
}

export type QuoteReader = (sendAsset: Asset, sendAmount: string, destAsset: Asset) => Promise<Quote | null>

/**
 * Prices `sendAmount` of `sendAsset` into `destAsset` on Kleym's own Horizon.
 * Null when no path exists — thin books are the ordinary failure, not the
 * exotic one, and the caller offers the original asset.
 */
export const quoteStrictSend: QuoteReader = async (sendAsset, sendAmount, destAsset) => {
  const page = await horizon().strictSendPaths(sendAsset, sendAmount, [destAsset]).call()
  let best: { destAmount: Decimal; path: Asset[] } | null = null
  for (const record of page.records) {
    const destAmount = new Decimal(record.destination_amount)
    if (best && !destAmount.greaterThan(best.destAmount)) continue
    best = {
      destAmount,
      path: record.path.map((hop) => (hop.asset_type === 'native' ? Asset.native() : new Asset(hop.asset_code, hop.asset_issuer))),
    }
  }
  if (!best || best.destAmount.lessThanOrEqualTo(0)) return null
  const destAmount = best.destAmount.toFixed(7)
  return { destAmount, destMin: boundDestMin(destAmount), path: best.path }
}

/** Result codes that mean "the quote could no longer be met" rather than "something is wrong". */
export const QUOTE_MISSED_CODES = new Set(['op_under_dest_min', 'op_too_few_offers', 'op_over_source_max'])
