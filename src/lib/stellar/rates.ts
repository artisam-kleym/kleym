/**
 * Asset → fiat rates at a ledger instant (#80).
 *
 * The valuation date is the whole point of the accounting export: a claim on
 * the 14th is an expense on the 14th at the 14th's rate. So a rate here is
 * always FOR AN INSTANT — the claim's or the reclaim's ledger time — read
 * from the Stellar DEX's own trade history for that hour (Horizon's
 * `trade_aggregations`), which is self-consistent, needs no vendor, and can
 * be re-read for the same instant later with the same answer.
 *
 * "Fiat" on Stellar is an anchor asset: USD is USDC, EUR is EURC. The map is
 * configuration (`RATE_ANCHORS`), so a deployment names the issuers it
 * trusts on its network. A pair the book did not trade in the hour is tried
 * over the day; past that the rate is `unavailable` and the line says so —
 * a thin pair is a fact the export must carry, not paper over.
 *
 * Every number is a Decimal or a string; `Number` never touches a rate
 * (AGENT.md §4.1).
 */
import { Asset } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { horizon } from './horizon'

export const RATE_SOURCE_DEX = 'stellar-dex'
export const RATE_SOURCE_IDENTITY = 'identity'
export const RATE_SOURCE_UNAVAILABLE = 'unavailable'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface RateQuote {
  /** Units of the currency per one unit of the asset, fixed-point; null when unpriced. */
  rate: string | null
  source: string
  /** Which aggregation window answered, e.g. `1h` or `24h`; null when unpriced. */
  window: string | null
}

export interface RateSource {
  /** The rate of `asset` in `currency` at `at`, or an unavailable quote. Never throws. */
  rateAt(asset: Asset, currency: string, at: Date): Promise<RateQuote>
}

/** `USD=USDC:G…,EUR=EURC:G…` → the anchor asset standing for each currency. */
export function parseAnchors(spec: string): Map<string, Asset> {
  const out = new Map<string, Asset>()
  for (const entry of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [currency, ref] = entry.split('=') as [string, string | undefined]
    if (!ref) continue
    const [code, issuer] = ref.split(':') as [string, string | undefined]
    if (!issuer) continue
    try {
      out.set(currency.toUpperCase(), new Asset(code, issuer))
    } catch {
      // A malformed anchor is left out; the currency then prices as unavailable, which the line says.
    }
  }
  return out
}

/** The reporting currencies this deployment can price: whatever has an anchor. */
export function supportedCurrencies(): string[] {
  return [...parseAnchors(env.RATE_ANCHORS).keys()]
}

function sameAsset(a: Asset, b: Asset): boolean {
  return a.equals(b)
}

/** The hour's close for base/counter, or the day's when the hour did not trade. Counter units per one base unit. */
async function closeAt(base: Asset, counter: Asset, at: Date): Promise<{ price: Decimal; window: string } | null> {
  for (const [resolution, label] of [[HOUR_MS, '1h'], [DAY_MS, '24h']] as const) {
    const end = at.getTime()
    const start = end - resolution
    try {
      const page = await horizon().tradeAggregation(base, counter, Math.floor(start / resolution) * resolution, end, resolution, 0).order('desc').limit(1).call()
      const record = page.records[0]
      if (record && Number(record.trade_count) > 0) return { price: new Decimal(record.close), window: label }
    } catch (error) {
      logger.warn({ reason: error instanceof Error ? error.message : 'unknown', window: label }, 'trade aggregation read failed')
    }
  }
  return null
}

/** The DEX source: identity when the asset IS the anchor, else the close of the hour, then of the day. */
export const dexRates: RateSource = {
  async rateAt(asset, currency, at) {
    const anchor = parseAnchors(env.RATE_ANCHORS).get(currency.toUpperCase())
    if (!anchor) return { rate: null, source: RATE_SOURCE_UNAVAILABLE, window: null }
    if (sameAsset(asset, anchor)) return { rate: '1', source: RATE_SOURCE_IDENTITY, window: null }
    const close = await closeAt(asset, anchor, at)
    if (!close) return { rate: null, source: RATE_SOURCE_UNAVAILABLE, window: null }
    // Fixed-point at the ledger's precision; the export multiplies from here.
    return { rate: close.price.toDecimalPlaces(7, Decimal.ROUND_HALF_EVEN).toFixed(), source: RATE_SOURCE_DEX, window: close.window }
  },
}
