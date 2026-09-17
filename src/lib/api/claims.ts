/**
 * The claim flow, server side. SPEC.md §3.3, §6.4.
 *
 * This is the only place Kleym signs on a recipient's behalf, and the only
 * place SPONSOR_SECRET_KEY is used. It reads the LEDGER, not the database, for
 * every fact a transaction depends on (AGENT.md §4.2): a stale ACTIVE row is
 * not authorisation to build a claim.
 *
 * No seed arrives here. The client sends the ephemeral PUBLIC key, derived in
 * the browser from the URL fragment.
 */
import { Account, Asset, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { assetOf, hasTrustline, horizon, accountExists, loadClaimableBalance, sponsorSpendable } from '@/lib/stellar/horizon'
import { buildClaim, buildMaterialise, deliveredAsset, signAsSponsor, type ClaimContext, type Conversion } from '@/lib/stellar/claim'
import { QUOTE_MISSED_CODES, assetFields, parseAssetRef, quoteStrictSend, type Quote, type QuoteReader } from '@/lib/stellar/receive-as'
import { checkMemo, memoOf, type DepositMemo } from '@/lib/stellar/memo'
import type { ClaimConflictReason } from '@/lib/claim/problem-types'
import { sponsorFor, sponsorSecret } from '@/lib/stellar/sponsors'
import { alert } from '@/lib/alerts'
import { observedClaim } from '@/lib/observability/claims'
import { emitWebhook } from '@/lib/webhooks/emit'

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/

export const materialiseSchema = z
  .object({ ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)') })
  .strict()

/** Receive-as (#74): the asset the recipient chose, by code and issuer — never a price. */
export const receiveAsSchema = z
  .object({
    assetCode: z.string().regex(/^[A-Za-z0-9]{1,12}$/),
    assetIssuer: z.string().regex(PUBLIC_KEY).nullable(),
    /**
     * The floor the page SHOWED the recipient, from an earlier quote. The
     * envelope is bound to the higher of this and the fresh bound, and if the
     * fresh quote cannot meet it the claim is refused (`quote-missed`) rather
     * than filled below what was promised. Never a price the page invents —
     * a higher floor only ever makes the claim fail.
     */
    destMin: z.string().regex(/^\d+(\.\d{1,7})?$/).optional(),
  })
  .strict()

/** Exchange deposit (#75): typed and bounded by `checkMemo` before anything is built. */
export const memoSchema = z
  .object({
    type: z.enum(['id', 'text', 'hash']),
    value: z.string().min(1).max(128),
  })
  .strict()

export const claimSchema = z
  .object({
    ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
    recipientPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
    receiveAs: receiveAsSchema.optional(),
    /** Present when claiming to an exchange or custodian account (#75). */
    memo: memoSchema.optional(),
  })
  .strict()

export const quoteSchema = z
  .object({
    ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
    receiveAs: receiveAsSchema,
  })
  .strict()

export const submitSchema = z
  .object({
    ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
    signedXdr: z.string().min(1),
    /** Which transaction this is, so submit records the right outcome. */
    phase: z.enum(['materialise', 'claim']),
  })
  .strict()

export type Outcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string; reason?: ClaimConflictReason }
  | { kind: 'unavailable'; detail: string }

/** `reason` is the discriminator the page reads; the detail is for a person. */
const conflict = (detail: string, reason?: ClaimConflictReason) => ({
  kind: 'conflict' as const,
  detail,
  ...(reason ? { reason } : {}),
})

/**
 * What `/api/claims/resolve` may say about a link.
 *
 * The SAME shape for every outcome, including "no such link". SPEC.md §6.4:
 * differential responses let an attacker walk the keyspace and find live links,
 * and a live link is a bearer instrument (§12).
 */
export interface ResolvedLink {
  status: 'claimable' | 'unavailable'
  assetCode: string | null
  assetIssuer: string | null
  amount: string | null
  senderName: string | null
  expiresAt: string | null
  network: string | null
  /** True when the link was emailed and a code is required. */
  otpRequired: boolean
  /** Receive-as (#74): assets the sender lets this recipient convert into. Empty when not offered. */
  receiveAs: { assetCode: string; assetIssuer: string | null }[]
  /** Exchange deposit (#75): may this recipient claim to an address plus a memo? */
  exchangeDeposit: boolean
}

/** Every field null, `unavailable`. Unknown, expired and claimed all land here. */
export function unavailableLink(): ResolvedLink {
  return {
    status: 'unavailable',
    assetCode: null,
    assetIssuer: null,
    amount: null,
    senderName: null,
    expiresAt: null,
    network: null,
    // False, never null: an unavailable answer must not vary in SHAPE either.
    otpRequired: false,
    // Empty, never null, for the same reason.
    receiveAs: [],
    exchangeDeposit: false,
  }
}

/** The campaign's allow-list as assets, dropping anything a stored ref cannot parse. */
function receiveAsAssets(refs: string[]): Asset[] {
  return refs.map(parseAssetRef).filter((asset): asset is Asset => asset !== null)
}

/**
 * Link metadata for the claim page.
 *
 * Deliberately does NOT consult the ledger. Resolve is the unauthenticated,
 * high-volume endpoint an enumerator would hit, and a Horizon round trip per
 * call is both a performance problem and a timing signal — a key that exists
 * would answer measurably slower than one that does not. The ledger check
 * belongs on prepare, which is where a transaction actually gets built.
 */
async function resolveLinkUnobserved(ephemeralPublicKey: string): Promise<ResolvedLink> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: {
      status: true,
      delivery: { select: { id: true } },
      campaign: {
        select: {
          name: true, network: true, assetCode: true, assetIssuer: true,
          amountPerLink: true, expiresAt: true, status: true, receiveAsAssets: true, allowExchangeDeposit: true,
          user: { select: { username: true } },
        },
      },
    },
  })

  if (!link || link.status !== 'ACTIVE') return unavailableLink()
  if (link.campaign.expiresAt.getTime() <= Date.now()) return unavailableLink()
  if (link.campaign.status === 'CANCELLED') return unavailableLink()

  return {
    status: 'claimable',
    assetCode: link.campaign.assetCode,
    assetIssuer: link.campaign.assetIssuer,
    amount: new Decimal(link.campaign.amountPerLink.toString()).toFixed(),
    senderName: link.campaign.user.username,
    expiresAt: link.campaign.expiresAt.toISOString(),
    network: link.campaign.network,
    /*
     * Only ever true on a CLAIMABLE link. An unavailable answer is byte-for-
     * byte identical whatever the reason (SPEC.md §6.4), so this cannot be
     * used to tell an unknown key from an emailed one — it is visible only to
     * someone already holding a live link, who needs to know a code is coming.
     */
    otpRequired: link.delivery !== null,
    receiveAs: receiveAsAssets(link.campaign.receiveAsAssets).map(assetFields),
    exchangeDeposit: link.campaign.allowExchangeDeposit,
  }
}

interface LinkForClaim {
  id: string
  balanceId: string
  campaignId: string
  asset: Asset
  amount: string
  expiresAt: Date
  /** The sponsor this campaign is bound to (#48). */
  sponsorPublicKey: string
  /** Assets the sender allows the recipient to receive as (#74). */
  receiveAs: Asset[]
  /** Whether the sender allows claiming to an exchange address plus memo (#75). */
  exchangeDeposit: boolean
}

/**
 * Loads the link and re-verifies it against the LEDGER.
 *
 * Every check here is one the database alone would get wrong:
 *
 * - the balance may already have been claimed or reclaimed, leaving an ACTIVE
 *   row pointing at nothing;
 * - the campaign may be past `expiresAt`, which makes the recipient's predicate
 *   unsatisfiable — the network would reject the claim, so refusing here is
 *   telling the truth earlier rather than adding a rule.
 */
export type BalanceLoader = typeof loadClaimableBalance

/*
 * The ledger read is injectable so this function can be verified without a
 * network. Not a testing convenience: without it, "prepare refuses an expired
 * link" passes whenever Horizon is unreachable, which is a false pass that
 * hides the check being gone. Observed — removing the expiry check below still
 * passed until this was injectable.
 */
export async function loadClaimable(
  ephemeralPublicKey: string,
  loadBalance: BalanceLoader = loadClaimableBalance,
): Promise<Outcome<LinkForClaim>> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: {
      id: true, status: true, balanceId: true, campaignId: true,
      campaign: {
        select: { assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true, status: true, sponsorPublicKey: true, receiveAsAssets: true, allowExchangeDeposit: true },
      },
    },
  })

  // 404 for anything not claimable, for the §6.4 reason: prepare must not
  // become the oracle that resolve refuses to be.
  if (!link || link.status !== 'ACTIVE' || !link.balanceId) return { kind: 'not-found' }
  if (link.campaign.status === 'CANCELLED') return { kind: 'not-found' }

  if (link.campaign.expiresAt.getTime() <= Date.now()) {
    return conflict('This link has expired. The funds return to the sender.', 'expired')
  }

  // THE LEDGER, not the row. AGENT.md §4.2.
  const onChain = await loadBalance(link.balanceId)
  if (!onChain) {
    logger.warn(
      { linkId: link.id, campaignId: link.campaignId },
      'link is ACTIVE but its balance is not on the ledger',
    )
    return conflict('This link has already been claimed.', 'already-claimed')
  }

  // The campaign's sponsor must still be in the pool; a removed seed is a
  // retryable outage for this campaign, logged for the operator, not a 500.
  const sponsor = sponsorFor(link.campaign.sponsorPublicKey)
  if (!sponsor) {
    logger.error(
      { linkId: link.id, campaignId: link.campaignId, sponsor: link.campaign.sponsorPublicKey },
      'campaign is bound to a sponsor that is no longer in the pool; see docs/sponsor-runbook.md',
    )
    return { kind: 'unavailable', detail: 'Claims are temporarily unavailable. Try again shortly.' }
  }

  /*
   * The LEDGER's amount and asset, not the row's.
   *
   * The record is already in hand, and if the two diverge TX2 fails on the
   * network in a way the recipient cannot act on: `op_underfunded` on the
   * payment when the ledger holds less, or `op_invalid_limit` on the
   * `changeTrust(0)` when it holds more, because an account cannot zero a
   * trustline it still has a balance in. Same reasoning as refusing to defer
   * `op_seq_num_too_far` — the check is cheaper here and the message is honest.
   */
  const asset = assetOf(link.campaign)
  const expectedAsset = asset.isNative() ? 'native' : `${asset.getCode()}:${asset.getIssuer()}`
  const rowAmount = new Decimal(link.campaign.amountPerLink.toString())

  if (onChain.asset !== expectedAsset) {
    logger.error(
      { linkId: link.id, campaignId: link.campaignId, expected: expectedAsset, onChain: onChain.asset },
      'ledger asset does not match the campaign',
    )
    return conflict('This link does not match what is on the network. Contact the sender.')
  }

  if (!rowAmount.equals(new Decimal(onChain.amount))) {
    logger.error(
      { linkId: link.id, campaignId: link.campaignId, expected: rowAmount.toFixed(), onChain: onChain.amount },
      'ledger amount does not match the campaign',
    )
    return conflict('This link does not match what is on the network. Contact the sender.')
  }

  return {
    kind: 'ok',
    value: {
      id: link.id,
      balanceId: link.balanceId,
      campaignId: link.campaignId,
      asset,
      // The LEDGER's amount. It is what TX2 must actually move.
      amount: new Decimal(onChain.amount).toFixed(7),
      expiresAt: link.campaign.expiresAt,
      sponsorPublicKey: sponsor.publicKey,
      receiveAs: receiveAsAssets(link.campaign.receiveAsAssets),
      exchangeDeposit: link.campaign.allowExchangeDeposit,
    },
  }
}

/**
 * Refuses to build anything if the sponsor cannot cover it.
 *
 * SPEC.md §12: sponsor exhaustion halts every claim in the system. Failing here
 * with a clear message beats letting Stellar reject the submission with
 * `tx_insufficient_balance`, which the recipient cannot act on and which leaves
 * a half-finished claim if it happens between TX1 and TX2.
 */
/**
 * The chokepoint every claim passes through, now per sponsor: the campaign's
 * bound sponsor is what is checked and what signs, so a pool failover for
 * new campaigns never touches a claim in flight (#48).
 */
async function guardSponsor(sponsorPublicKey: string): Promise<Outcome<Decimal>> {
  const spendable = await sponsorSpendable(sponsorPublicKey)

  if (spendable.lessThan(env.SPONSOR_MIN_BALANCE_ALERT)) {
    // Logged AND sent outward, deduplicated per sponsor for an hour. Not
    // awaited: the claim must not wait on the receiver (up to 5 s) — and
    // with Redis down that would be every claim, not once an hour.
    void alert('sponsor.low_balance', {
      sponsor: sponsorPublicKey,
      spendable: spendable.toFixed(),
      threshold: env.SPONSOR_MIN_BALANCE_ALERT,
    }, { dedupeKey: sponsorPublicKey }).then((delivered) => {
      // Outward to every organisation subscribed (#51), once per dedupe window.
      if (!delivered.deduplicated) {
        void emitWebhook(null, 'sponsor.low', { sponsorPublicKey, spendable: spendable.toFixed(), threshold: String(env.SPONSOR_MIN_BALANCE_ALERT) })
      }
    })
  }

  // Two accounts plus two trustlines at a 0.5 base reserve, with headroom.
  if (spendable.lessThan(5)) {
    return { kind: 'unavailable', detail: 'Claims are temporarily unavailable. Try again shortly.' }
  }

  return { kind: 'ok', value: spendable }
}

async function claimContext(
  link: LinkForClaim,
  ephemeralPublicKey: string,
  recipientPublicKey: string,
  conversion?: Conversion,
  memo?: DepositMemo,
): Promise<ClaimContext> {
  /*
   * A fresh `Account` rather than the Horizon response object. `AccountResponse`
   * is not an `Account` — it carries the sequence number but not the shape
   * TransactionBuilder wants, and the builder increments what it is given.
   */
  const sponsor = await horizon().loadAccount(link.sponsorPublicKey)
  return {
    sponsorAccount: new Account(sponsor.accountId(), sponsor.sequenceNumber()),
    sponsorPublicKey: link.sponsorPublicKey,
    ephemeralPublicKey,
    recipientPublicKey,
    asset: link.asset,
    amount: link.amount,
    balanceId: link.balanceId,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
    ...(conversion ? { conversion } : {}),
    ...(memo ? { memo } : {}),
  }
}

/**
 * Receive-as (#74): the destination the recipient asked for, checked against
 * the SENDER's allow-list, and a fresh quote for it. Null destination means
 * "the campaign asset" and no quote. Thin books are the ordinary failure —
 * `no-path` is a conflict the page turns into "here is the original asset".
 */
async function resolveConversion(
  link: LinkForClaim,
  wanted: { assetCode: string; assetIssuer: string | null; destMin?: string } | undefined,
  quote: QuoteReader,
): Promise<Outcome<{ destAsset: Asset; quote: Quote } | null>> {
  if (!wanted) return { kind: 'ok', value: null }
  const destAsset = parseAssetRef(wanted.assetCode === 'XLM' ? 'XLM' : `${wanted.assetCode}:${wanted.assetIssuer ?? ''}`)
  if (!destAsset) return conflict('That is not an asset this link can be received as.')
  // The campaign asset itself is "no conversion", whatever the page sent.
  if (destAsset.equals(link.asset)) return { kind: 'ok', value: null }
  if (!link.receiveAs.some((allowed) => allowed.equals(destAsset))) {
    return conflict('That is not an asset this link can be received as.')
  }
  const priced = await quote(link.asset, link.amount, destAsset)
  if (!priced) {
    return conflict(
      `There is no market right now to receive this as ${wanted.assetCode}. You can still receive ${link.asset.isNative() ? 'XLM' : link.asset.getCode()}.`,
      'no-path',
    )
  }
  /*
   * The floor the recipient READ is the floor they get. Between the quote on
   * the ready screen and the envelope there is a wallet connect, TX1 and a
   * ledger wait; if the book fell past the shown floor in that time, this
   * refuses rather than binding to a lower fresh figure and filling at it.
   */
  if (wanted.destMin) {
    const shown = new Decimal(wanted.destMin)
    if (new Decimal(priced.destAmount).lessThan(shown)) {
      return conflict(
        `The price moved: ${wanted.assetCode} would now deliver ${priced.destAmount}, below the ${shown.toFixed()} you were shown. Nothing was filled — pick again for a fresh price, or receive ${link.asset.isNative() ? 'XLM' : link.asset.getCode()}.`,
        'quote-missed',
      )
    }
    if (shown.greaterThan(priced.destMin)) priced.destMin = shown.toFixed(7)
  }
  return { kind: 'ok', value: { destAsset, quote: priced } }
}

export interface QuotePrepared {
  assetCode: string
  assetIssuer: string | null
  /** What the best path delivers now. */
  destAmount: string
  /** The bound TX2 will carry. Below it the claim refuses rather than fills. */
  destMin: string
}

/** A live quote for the page to show before the recipient commits. Same refusals as prepare. */
async function quoteReceiveAsUnobserved(
  ephemeralPublicKey: string,
  wanted: { assetCode: string; assetIssuer: string | null },
  quote: QuoteReader = quoteStrictSend,
): Promise<Outcome<QuotePrepared>> {
  const loaded = await loadClaimable(ephemeralPublicKey)
  // Anything not claimable — unknown, expired, claimed, suspended — is ONE
  // answer here. A typed conflict would tell a holder of the public key alone
  // which of those it is, which is what `resolve` refuses to say (§6.4).
  if (loaded.kind !== 'ok') return { kind: 'not-found' }
  const conversion = await resolveConversion(loaded.value, wanted, quote)
  if (conversion.kind !== 'ok') return conversion
  if (!conversion.value) return conflict('That is the asset this link already pays.')
  return {
    kind: 'ok',
    value: { ...assetFields(conversion.value.destAsset), destAmount: conversion.value.quote.destAmount, destMin: conversion.value.quote.destMin },
  }
}

export interface MaterialisePrepared {
  alreadyExists: boolean
  xdr: string | null
  operations: number
}

/**
 * TX1. Returns `{ alreadyExists: true }` and no XDR when the ephemeral account
 * is already on the ledger — the retry path SPEC.md §3.3.3 step 2 describes,
 * and the reason this is its own endpoint rather than a phase discriminator.
 */
async function prepareMaterialiseUnobserved(ephemeralPublicKey: string): Promise<Outcome<MaterialisePrepared>> {
  const loaded = await loadClaimable(ephemeralPublicKey)
  if (loaded.kind !== 'ok') return loaded

  const sponsor = await guardSponsor(loaded.value.sponsorPublicKey)
  if (sponsor.kind !== 'ok') return sponsor

  if (await accountExists(ephemeralPublicKey)) {
    return { kind: 'ok', value: { alreadyExists: true, xdr: null, operations: 0 } }
  }

  const context = await claimContext(loaded.value, ephemeralPublicKey, ephemeralPublicKey)
  const built = buildMaterialise(context, { ephemeralTrusts: false })

  return {
    kind: 'ok',
    value: {
      alreadyExists: false,
      xdr: signAsSponsor(built.xdr, env.NETWORK_PASSPHRASE, sponsorSecret(loaded.value.sponsorPublicKey)),
      operations: built.operations,
    },
  }
}

export interface ClaimPrepared {
  xdr: string
  needsRecipientSignature: boolean
  operations: number
  /** Receive-as (#74): what TX2 delivers, when converting. Null: the campaign asset, as ever. */
  conversion: (QuotePrepared & { sendAmount: string }) | null
  /** Exchange deposit (#75): the memo TX2 carries, when claiming to an exchange. */
  memo: DepositMemo | null
}

/**
 * TX2. Requires the ephemeral account to exist — TX1 must have landed, in an
 * EARLIER ledger (§3.3.1). Refusing here is clearer than letting the network
 * answer `op_seq_num_too_far`, which reads like a Kleym bug.
 */
async function prepareClaimUnobserved(
  ephemeralPublicKey: string,
  recipientPublicKey: string,
<<<<<<< HEAD
  receiveAs?: { assetCode: string; assetIssuer: string | null; destMin?: string },
=======
  receiveAs?: { assetCode: string; assetIssuer: string | null },
  memoInput?: { type: string; value: string },
>>>>>>> d681429 (Exchange deposit: claim to an address plus a memo, with the memo enforced)
  quote: QuoteReader = quoteStrictSend,
): Promise<Outcome<ClaimPrepared>> {
  if (recipientPublicKey === ephemeralPublicKey) {
    return conflict('The destination cannot be the link’s own key.')
  }

  const loaded = await loadClaimable(ephemeralPublicKey)
  if (loaded.kind !== 'ok') return loaded

  /*
   * Exchange deposit (#75). The memo is checked BEFORE anything is built or
   * signed — a deposit without one cannot be credited — and only where the
   * sender allowed the option.
   */
  let memo: DepositMemo | undefined
  if (memoInput) {
    if (!loaded.value.exchangeDeposit) {
      return conflict('This link cannot be claimed to an exchange account. Connect a wallet instead.')
    }
    const checked = checkMemo(memoInput)
    if (!checked.ok) return conflict(checked.detail, 'memo')
    memo = checked.memo
  }

  const sponsor = await guardSponsor(loaded.value.sponsorPublicKey)
  if (sponsor.kind !== 'ok') return sponsor

  if (!(await accountExists(ephemeralPublicKey))) {
    return conflict('Preparation is not finished yet. Complete the first step and wait one ledger.', 'not-ready')
  }

  /*
   * Quoted HERE, fresh, at the moment the envelope is built — not carried
   * over from what the page displayed. The envelope's own 180 s window is the
   * quote's lifetime: past it the network refuses the transaction outright.
   */
  const conversion = await resolveConversion(loaded.value, receiveAs, quote)
  if (conversion.kind !== 'ok') return conversion
  const converting = conversion.value
    ? { destAsset: conversion.value.destAsset, destMin: conversion.value.quote.destMin, path: conversion.value.quote.path }
    : undefined

  // The trustline that matters is for what the recipient RECEIVES (#74).
  const delivered = deliveredAsset({ asset: loaded.value.asset, conversion: converting })
  const [recipientLive, recipientTrusts, ephemeralTrusts] = await Promise.all([
    accountExists(recipientPublicKey),
    hasTrustline(recipientPublicKey, delivered),
    hasTrustline(ephemeralPublicKey, loaded.value.asset),
  ])

  /*
   * An exchange account cannot sign, and cannot be created or given a
   * trustline by this transaction. If it does not exist or does not accept
   * the asset, the deposit cannot arrive — refuse now, in words, rather than
   * after the recipient has committed.
   */
  if (memo && (!recipientLive || !recipientTrusts)) {
    const code = delivered.isNative() ? 'XLM' : delivered.getCode()
    return conflict(
      recipientLive
        ? `That address does not accept ${code}. Check the deposit address for ${code} with your exchange.`
        : 'That address does not exist on this network. Check the deposit address with your exchange.',
      'deposit-unready',
    )
  }

  const context = await claimContext(loaded.value, ephemeralPublicKey, recipientPublicKey, converting, memo)
  const plan = buildClaim(context, {
    ephemeralExists: true,
    ephemeralTrusts,
    recipientExists: recipientLive,
    recipientTrusts: recipientLive && recipientTrusts,
  })

  return {
    kind: 'ok',
    value: {
      xdr: signAsSponsor(plan.xdr, env.NETWORK_PASSPHRASE, sponsorSecret(loaded.value.sponsorPublicKey)),
      needsRecipientSignature: plan.needsRecipientSignature,
      operations: plan.operations,
      conversion: conversion.value
        ? {
            ...assetFields(conversion.value.destAsset),
            destAmount: conversion.value.quote.destAmount,
            destMin: conversion.value.quote.destMin,
            sendAmount: loaded.value.amount,
          }
        : null,
      memo: memo ?? null,
    },
  }
}

export interface Submitted {
  hash: string
  phase: 'materialise' | 'claim'
  /** True when this submission returned an already-recorded result. */
  replay: boolean
}

/**
 * Submits a signed envelope and records what the LEDGER did.
 *
 * A link becomes CLAIMED here and nowhere else, and only from a transaction
 * Horizon accepted into a closed ledger — never from a client saying so
 * (AGENT.md §4.2).
 *
 * Idempotency is keyed on the transaction HASH rather than an
 * `Idempotency-Key` header. The claim endpoints are unauthenticated, so there
 * is no user to scope a key to; the hash is intrinsic to the envelope, so a
 * double-click submits the same bytes and lands on the same row. Stellar
 * itself also rejects a replayed sequence number, but that arrives as an error
 * the recipient would see — this returns the original result instead.
 */
export type Submitter = (transaction: Transaction) => Promise<{ hash: string; successful: boolean }>

/** The real one. Injectable for the same reason `loadClaimable`'s read is. */
const submitToHorizon: Submitter = async (transaction) => {
  const response = await horizon().submitTransaction(transaction)
  return { hash: response.hash, successful: response.successful !== false }
}

async function submitClaimUnobserved(
  ephemeralPublicKey: string,
  signedXdr: string,
  phase: 'materialise' | 'claim',
  submit: Submitter = submitToHorizon,
): Promise<Outcome<Submitted>> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: {
      id: true, status: true, campaignId: true, claimTxHash: true, claimedBy: true, balanceId: true,
      campaign: { select: { sponsorPublicKey: true } },
    },
  })
  if (!link) return { kind: 'not-found' }

  let transaction: Transaction
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, env.NETWORK_PASSPHRASE)
    if (!(parsed instanceof Transaction)) return conflict('Unexpected transaction envelope.')
    transaction = parsed
  } catch {
    return conflict('That transaction could not be read.')
  }

  /*
   * The envelope must be one Kleym built. It arrives from an unauthenticated
   * caller, so without this check anyone could hand us an arbitrary signed
   * transaction and have Kleym submit it and record a claim against a link.
   */
  // THIS campaign's sponsor, not any sponsor in the pool: an envelope built
  // for one sponsor is not a Kleym envelope for a campaign bound to another.
  const boundSponsor = sponsorFor(link.campaign.sponsorPublicKey)
  if (!boundSponsor) {
    logger.error({ linkId: link.id, campaignId: link.campaignId, sponsor: link.campaign.sponsorPublicKey }, 'campaign is bound to a sponsor that is no longer in the pool; see docs/sponsor-runbook.md')
    return { kind: 'unavailable', detail: 'Claims are temporarily unavailable. Try again shortly.' }
  }
  if (transaction.source !== boundSponsor.publicKey) {
    return conflict('That transaction was not prepared by Kleym.')
  }

  /*
   * And it must be THIS link's envelope.
   *
   * Sponsor-source alone is not enough. `ephemeralPublicKey` and `signedXdr`
   * arrive as two independent inputs, so without binding them a valid envelope
   * prepared for link A — which A's own holder obtains legitimately, it is
   * their claim — can be posted under link B's public key. The submit
   * succeeds, and B's row is written CLAIMED with A's transaction hash and the
   * attacker's address, while B's balance sits untouched on the ledger with no
   * path out until expiry.
   *
   * That would make knowing a PUBLIC KEY sufficient to destroy a link, and the
   * design rests on the opposite: the seed is the bearer instrument, the public
   * key is not. It is why `resolve` takes `pk` over the wire at all.
   *
   * Reproduced before this check existed; scripts/verify-claims.ts §4 keeps it
   * reproduced.
   */
  const binding = envelopeBinding(transaction, phase, link.balanceId, ephemeralPublicKey)
  if (!binding.ok) return conflict(binding.detail)

  const hash = transaction.hash().toString('hex')

  // Already recorded: return what happened rather than submitting again.
  if (link.claimTxHash === hash) {
    return { kind: 'ok', value: { hash, phase, replay: true } }
  }
  if (phase === 'claim' && link.status === 'CLAIMED') {
    return conflict('This link has already been claimed.', 'already-claimed')
  }

  /*
   * TX1 REPLAY. §3.3 requires a ledger boundary before TX2 and clients re-poll
   * across it — which is why `materialise` carries the looser 20/min limit — so
   * a double-submit of TX1 is the ordinary case, not an edge one.
   *
   * `claimTxHash` records only TX2, so the hash short-circuit above cannot
   * catch this and the submit would reach Stellar and come back `tx_bad_seq`:
   * a 409 carrying a raw protocol code at the least recoverable moment in the
   * flow. The ledger already answers the question honestly — if the ephemeral
   * account exists, TX1 landed.
   */
  if (phase === 'materialise' && (await accountExists(ephemeralPublicKey))) {
    return { kind: 'ok', value: { hash, phase, replay: true } }
  }

  let result: { hash: string; successful: boolean }
  try {
    result = await submit(transaction)
  } catch (error) {
    const code = horizonResultCode(error)

    /*
     * `tx_bad_seq` on a replay means these exact bytes already landed —
     * Stellar refusing a spent sequence number. Treat it as the replay it is.
     */
    if (code === 'tx_bad_seq' && link.claimTxHash) {
      return { kind: 'ok', value: { hash: link.claimTxHash, phase, replay: true } }
    }

    /*
     * Receive-as (#74): the book moved past `destMin` between quote and
     * ledger. The whole transaction failed, so the balance is still
     * claimable — this is the bound doing its job, not an error to hide.
     * The page offers the original asset.
     */
    if (phase === 'claim' && QUOTE_MISSED_CODES.has(code)) {
      logger.warn({ linkId: link.id, code }, 'receive-as quote could not be met; claim refused rather than filled')
      return conflict('The price moved before the claim landed, so it was not filled. Your funds are safe — you can receive the original asset instead.', 'quote-missed')
    }

    logger.error({ linkId: link.id, phase, code }, 'claim submission rejected')
    return conflict(`Stellar rejected the transaction: ${code}.`)
  }

  if (!result.successful) {
    logger.error({ linkId: link.id, phase, hash: result.hash }, 'claim transaction failed on ledger')
    return conflict('The transaction did not succeed on the network.')
  }

  /*
   * Only TX2 completes a claim. TX1 materialises the ephemeral account and
   * moves nothing — recording CLAIMED there would mark a link claimed while
   * the funds are still in the claimable balance.
   */
  if (phase === 'claim') {
    const recipient = recipientOf(transaction)
    const memo = memoOf(transaction.memo)
    const claimedAt = new Date()
    const claimed = await prisma.claimLink.update({
      where: { id: link.id },
      data: {
        status: 'CLAIMED',
        claimedAt,
        claimTxHash: result.hash,
        claimedBy: recipient,
        // Beside the recipient, off the same envelope (#75).
        claimMemoType: memo?.type ?? null,
        claimMemo: memo?.value ?? null,
      },
      select: { campaign: { select: { organizationId: true } } },
    })
    logger.info({ linkId: link.id, campaignId: link.campaignId, hash: result.hash }, 'link claimed')
    // The ephemeral PUBLIC key and the claimant — what the ledger shows. Never the link (#51).
    await emitWebhook(claimed.campaign.organizationId, 'link.claimed', {
      campaignId: link.campaignId, linkId: link.id, ephemeralPublicKey, claimedBy: recipient ?? '', claimTxHash: result.hash, claimedAt: claimedAt.toISOString(),
    })
  }

  return { kind: 'ok', value: { hash: result.hash, phase, replay: false } }
}

/**
 * Is this envelope the one prepared for THIS link?
 *
 * TX2 is bound by the balance it claims: `claimClaimableBalance` must name this
 * link's `balanceId`, and the operations that spend must be sourced from this
 * link's ephemeral account. TX1 is bound by what it creates: `createAccount`
 * must name this ephemeral key.
 *
 * Both are checked against the ROW, not against anything else the caller sent —
 * the caller supplies the key and the envelope independently, and it is exactly
 * that independence the check closes.
 */
function envelopeBinding(
  transaction: Transaction,
  phase: 'materialise' | 'claim',
  balanceId: string | null,
  ephemeralPublicKey: string,
): { ok: true } | { ok: false; detail: string } {
  const wrong = { ok: false as const, detail: 'That transaction is not for this link.' }

  if (phase === 'materialise') {
    const creates = transaction.operations.some(
      (op) => op.type === 'createAccount' && op.destination === ephemeralPublicKey,
    )
    return creates ? { ok: true } : wrong
  }

  if (!balanceId) return wrong

  const claims = transaction.operations.some(
    (op) => op.type === 'claimClaimableBalance' && op.balanceId === balanceId,
  )
  if (!claims) return wrong

  /*
   * The merge is what disposes of the ephemeral account, and the payment is
   * what moves the funds. Both must be sourced from THIS link's key, or the
   * envelope claims the right balance while spending someone else's account.
   */
  const spendsElsewhere = transaction.operations.some(
    (op) =>
      (op.type === 'accountMerge' || op.type === 'payment' || op.type === 'pathPaymentStrictSend') &&
      op.source !== undefined &&
      op.source !== ephemeralPublicKey,
  )
  return spendsElsewhere ? wrong : { ok: true }
}

/**
 * Who received the funds, read from the transaction rather than the request.
 *
 * The PAYMENT's destination — `payment`, or `pathPaymentStrictSend` when
 * receiving as another asset (#74). It used to be the merge destination, which
 * was the recipient by construction; with an exchange deposit (#75) the merge
 * goes to the sponsor instead, and reading it would record the sponsor as
 * every exchange recipient. The merge is the fallback only for an envelope
 * with no payment at all, which Kleym does not build. Taking it from the
 * envelope means the recorded `claimedBy` matches what the ledger did, not
 * what a client claimed alongside it.
 */
export function recipientOf(transaction: Transaction): string | null {
  for (const operation of transaction.operations) {
    if (operation.type === 'payment' || operation.type === 'pathPaymentStrictSend') return operation.destination
  }
  for (const operation of transaction.operations) {
    if (operation.type === 'accountMerge') return operation.destination
  }
  return null
}

/** The result code Horizon reported, never the raw error. AGENT.md §4.4. */
export function horizonResultCode(error: unknown): string {
  const codes = (
    error as {
      response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } }
    }
  )?.response?.data?.extras?.result_codes
  if (!codes) return 'submission_failed'
  const operation = codes.operations?.find((code) => code !== 'op_success')
  return operation ?? codes.transaction ?? 'submission_failed'
}

/* ── the exported claim path: each phase in a span, each outcome counted (#53) ── */

export const resolveLink = observedClaim('resolve', resolveLinkUnobserved)
export const prepareMaterialise = observedClaim('materialise', prepareMaterialiseUnobserved)
export const prepareClaim = observedClaim('claim', prepareClaimUnobserved)
export const quoteReceiveAs = observedClaim('quote', quoteReceiveAsUnobserved)
export const submitClaim = observedClaim('submit', submitClaimUnobserved)
