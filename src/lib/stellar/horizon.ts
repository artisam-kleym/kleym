/**
 * Horizon access and live protocol values. SPEC.md §3.2, §3.5.
 *
 * Constructed lazily, for the reason in lib/db/client.ts: route handlers are
 * evaluated during `next build`, and reading config at module scope would make
 * the build require an environment again.
 *
 * The chain is authoritative (AGENT.md §4.2). Everything here reads from
 * Horizon; nothing here trusts the database.
 */
import { Asset, Horizon } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'

let cached: Horizon.Server | undefined

export function horizon(): Horizon.Server {
  return (cached ??= new Horizon.Server(env.HORIZON_URL))
}

/** The campaign's asset. `assetIssuer` is null exactly when the asset is XLM. */
export function assetOf(campaign: { assetCode: string; assetIssuer: string | null }): Asset {
  return campaign.assetIssuer === null
    ? Asset.native()
    : new Asset(campaign.assetCode, campaign.assetIssuer)
}

/**
 * Base reserve, in XLM, read from the last closed ledger.
 *
 * SPEC.md §3.2 is explicit that this must come from the protocol at runtime.
 * It is 0.5 XLM today and has changed before; a hardcoded 0.5 would quietly
 * under-fund every campaign the day it changes, and the sender is the one who
 * pays. Not cached — a wrong reserve costs more than a Horizon round trip.
 */
export async function baseReserve(): Promise<Decimal> {
  const page = await horizon().ledgers().order('desc').limit(1).call()
  const record = page.records[0]
  if (!record) throw new Error('Horizon returned no ledgers')

  // Horizon exposes stroops on recent protocol versions and XLM on older ones.
  const stroops = (record as unknown as { base_reserve_in_stroops?: number })
    .base_reserve_in_stroops
  if (typeof stroops === 'number') return new Decimal(stroops).div(1e7)

  const xlm = (record as unknown as { base_reserve?: string }).base_reserve
  if (xlm !== undefined) return new Decimal(xlm)

  throw new Error('Horizon ledger record carried no base reserve')
}

/**
 * XLM the sender locks per link.
 *
 * A ClaimableBalanceEntry costs one base reserve for the entry plus one per
 * claimant, and Kleym always writes two claimants (SPEC.md §3.2) — the
 * recipient before expiry and the sender after. Derived rather than stated so
 * that adding a claimant cannot silently under-charge.
 */
export function reservePerLink(base: Decimal, claimants: number): Decimal {
  return base.times(1 + claimants)
}

/** Whether an account exists on the ledger. A 404 is an answer, not a failure. */
export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await horizon().loadAccount(publicKey)
    return true
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || (error as { name?: string })?.name === 'NotFoundError') return false
    throw error
  }
}
