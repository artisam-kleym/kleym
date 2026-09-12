/**
 * The sponsor pool. Issue #48.
 *
 * Sponsorship is what lets a recipient claim without holding XLM; the sponsor
 * account is Kleym's own float, and until now it was one account — an
 * admitted single point of failure (SPEC.md §12). This is a POOL: the primary
 * `SPONSOR_SECRET_KEY` plus any in `SPONSOR_SECRET_KEYS_EXTRA`, every one an
 * environment secret (AGENT.md §5.5 — a pool is not a reason to move key
 * material into the database).
 *
 * A campaign is bound to one sponsor when it is created and keeps it for
 * life: reserves return to the SPONSORING account on merge, so switching
 * mid-campaign would leave the first account's reserves outstanding and the
 * accounting wrong. Failover — choosing a different sponsor because the
 * first is below its working threshold — applies to new campaigns only.
 */
import Decimal from 'decimal.js'
import { Keypair } from '@stellar/stellar-sdk'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { sponsorSpendable } from './horizon'
import { alert } from '@/lib/alerts'

export interface Sponsor {
  publicKey: string
  /** Position in the pool: 0 is the primary. */
  index: number
}

let pool: (Sponsor & { secret: string })[] | undefined

function loadPool(): (Sponsor & { secret: string })[] {
  if (pool) return pool
  const seeds = [env.SPONSOR_SECRET_KEY, ...env.SPONSOR_SECRET_KEYS_EXTRA]
  pool = seeds.map((secret, index) => ({ publicKey: Keypair.fromSecret(secret).publicKey(), secret, index }))
  if (pool[0]!.publicKey !== env.SPONSOR_PUBLIC_KEY) {
    // Fail loudly at first use: a mismatched pair means the wrong secret is deployed.
    throw new Error('SPONSOR_PUBLIC_KEY does not match the key derived from SPONSOR_SECRET_KEY')
  }
  const seen = new Set<string>()
  for (const s of pool) {
    if (seen.has(s.publicKey)) throw new Error('the sponsor pool lists the same account twice')
    seen.add(s.publicKey)
  }
  return pool
}

/** Public halves only. */
export function sponsorPool(): Sponsor[] {
  return loadPool().map(({ publicKey, index }) => ({ publicKey, index }))
}

/** The primary sponsor, which rows older than the pool are read as. */
export function primarySponsor(): Sponsor {
  return sponsorPool()[0]!
}

/** The sponsor a campaign is bound to; unknown keys are refused, not defaulted. */
export function sponsorFor(publicKey: string | null): Sponsor {
  if (publicKey === null) return primarySponsor()
  const found = sponsorPool().find((s) => s.publicKey === publicKey)
  if (!found) throw new Error(`campaign is bound to a sponsor that is not in the pool: ${publicKey.slice(0, 8)}…`)
  return found
}

/** The seed for signing. Kept out of `Sponsor` so it is never spread into a log line. */
export function sponsorSecret(publicKey: string): string {
  const found = loadPool().find((s) => s.publicKey === publicKey)
  if (!found) throw new Error('no such sponsor in the pool')
  return found.secret
}

export type SpendableReader = (publicKey: string) => Promise<Decimal>

export interface SponsorChoice {
  sponsor: Sponsor
  spendable: Decimal
  /** True when the primary was passed over for being below the working threshold. */
  failedOver: boolean
}

/**
 * The sponsor for a NEW campaign: the first in pool order whose spendable
 * float is at or above the working threshold; failing that, the one with the
 * most. Never none — a campaign that cannot be sponsored is refused at claim
 * time by `guardSponsor`, with the honest "temporarily unavailable".
 */
export async function chooseSponsor(
  read: SpendableReader = sponsorSpendable,
  threshold: Decimal = new Decimal(env.SPONSOR_WORKING_THRESHOLD),
): Promise<SponsorChoice> {
  const candidates: { sponsor: Sponsor; spendable: Decimal }[] = []
  for (const sponsor of sponsorPool()) {
    try {
      candidates.push({ sponsor, spendable: await read(sponsor.publicKey) })
    } catch (error) {
      // An unreadable sponsor is skipped, not treated as empty: Horizon being
      // slow for one account should not fail the whole pool over.
      logger.warn({ sponsor: sponsor.publicKey, reason: error instanceof Error ? error.message : 'unknown' }, 'sponsor balance unreadable during selection')
    }
  }
  if (candidates.length === 0) throw new Error('no sponsor in the pool could be read')

  const working = candidates.find((c) => c.spendable.greaterThanOrEqualTo(threshold))
  const chosen = working ?? candidates.reduce((a, b) => (b.spendable.greaterThan(a.spendable) ? b : a))
  const failedOver = chosen.sponsor.index !== 0
  if (failedOver) {
    const primary = candidates.find((c) => c.sponsor.index === 0)
    await alert('sponsor.failover', {
      chosen: chosen.sponsor.publicKey,
      chosenSpendable: chosen.spendable.toFixed(),
      primary: primary?.sponsor.publicKey ?? env.SPONSOR_PUBLIC_KEY,
      primarySpendable: primary?.spendable.toFixed() ?? null,
      threshold: threshold.toFixed(),
    })
  }
  return { sponsor: chosen.sponsor, spendable: chosen.spendable, failedOver }
}

/* ── Status and forecasting for /admin ─────────────────────────────────── */

export interface SponsorStatus {
  publicKey: string
  index: number
  spendable: string | null
  /** Live campaigns bound to this sponsor. */
  campaigns: number
  /** Claims in the last seven days across those campaigns. */
  claimsPerDay: string
  /** Days of float at that rate, or null when there is no rate or no balance. */
  runwayDays: string | null
  low: boolean
}

/**
 * Cost of one claim to the sponsor, in XLM, at the current base fee: two
 * transactions of up to fifteen operations each. Reserves come back on
 * merge, so fees are what a completed claim actually spends; a stranded
 * claim's reserve is reported separately on /admin and not folded in here,
 * because it returns.
 */
export function feePerClaim(baseFeeStroops: number): Decimal {
  return new Decimal(baseFeeStroops).times(30).dividedBy(10_000_000)
}

/** "At the current claim rate this float lasts N days." Decimal throughout. */
export function runwayDays(spendable: Decimal, claimsPerDay: Decimal, baseFeeStroops: number): Decimal | null {
  const perDay = claimsPerDay.times(feePerClaim(baseFeeStroops))
  if (perDay.isZero() || spendable.lessThanOrEqualTo(0)) return null
  return spendable.dividedBy(perDay).toDecimalPlaces(0, Decimal.ROUND_DOWN)
}
