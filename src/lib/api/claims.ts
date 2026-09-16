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
import { buildClaim, buildMaterialise, signAsSponsor, type ClaimContext } from '@/lib/stellar/claim'
import type { ClaimConflictReason } from '@/lib/claim/problem-types'
import { sponsorFor, sponsorSecret } from '@/lib/stellar/sponsors'
import { alert } from '@/lib/alerts'
import { observedClaim } from '@/lib/observability/claims'
import { emitWebhook } from '@/lib/webhooks/emit'

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/

export const materialiseSchema = z
  .object({ ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)') })
  .strict()

export const claimSchema = z
  .object({
    ephemeralPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
    recipientPublicKey: z.string().regex(PUBLIC_KEY, 'must be a Stellar public key (G…)'),
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
  }
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
      suspendedAt: true,
      delivery: { select: { id: true } },
      campaign: {
        select: {
          name: true, network: true, assetCode: true, assetIssuer: true,
          amountPerLink: true, expiresAt: true, status: true, suspendedAt: true,
          user: { select: { username: true } },
        },
      },
    },
  })

  if (!link || link.status !== 'ACTIVE') return unavailableLink()
  if (link.campaign.expiresAt.getTime() <= Date.now()) return unavailableLink()
  if (link.campaign.status === 'CANCELLED') return unavailableLink()
  // Suspended (#72): Kleym has stopped participating. The balance is still on
  // the ledger and its holder can still claim it directly — this is the same
  // unavailable answer, not a statement that the funds are gone.
  if (link.suspendedAt || link.campaign.suspendedAt) return unavailableLink()

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
      id: true, status: true, balanceId: true, campaignId: true, suspendedAt: true,
      campaign: {
        select: { assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true, status: true, sponsorPublicKey: true, suspendedAt: true },
      },
    },
  })

  // 404 for anything not claimable, for the §6.4 reason: prepare must not
  // become the oracle that resolve refuses to be.
  if (!link || link.status !== 'ACTIVE' || !link.balanceId) return { kind: 'not-found' }
  if (link.campaign.status === 'CANCELLED') return { kind: 'not-found' }
  if (link.suspendedAt || link.campaign.suspendedAt) return { kind: 'not-found' }

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
}

/**
 * TX2. Requires the ephemeral account to exist — TX1 must have landed, in an
 * EARLIER ledger (§3.3.1). Refusing here is clearer than letting the network
 * answer `op_seq_num_too_far`, which reads like a Kleym bug.
 */
async function prepareClaimUnobserved(
  ephemeralPublicKey: string,
  recipientPublicKey: string,
): Promise<Outcome<ClaimPrepared>> {
  if (recipientPublicKey === ephemeralPublicKey) {
    return conflict('The destination cannot be the link’s own key.')
  }

  const loaded = await loadClaimable(ephemeralPublicKey)
  if (loaded.kind !== 'ok') return loaded

  const sponsor = await guardSponsor(loaded.value.sponsorPublicKey)
  if (sponsor.kind !== 'ok') return sponsor

  if (!(await accountExists(ephemeralPublicKey))) {
    return conflict('Preparation is not finished yet. Complete the first step and wait one ledger.', 'not-ready')
  }

  const [recipientLive, recipientTrusts, ephemeralTrusts] = await Promise.all([
    accountExists(recipientPublicKey),
    hasTrustline(recipientPublicKey, loaded.value.asset),
    hasTrustline(ephemeralPublicKey, loaded.value.asset),
  ])

  const context = await claimContext(loaded.value, ephemeralPublicKey, recipientPublicKey)
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
    const claimedAt = new Date()
    const claimed = await prisma.claimLink.update({
      where: { id: link.id },
      data: {
        status: 'CLAIMED',
        claimedAt,
        claimTxHash: result.hash,
        claimedBy: recipient,
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
      (op.type === 'accountMerge' || op.type === 'payment') &&
      op.source !== undefined &&
      op.source !== ephemeralPublicKey,
  )
  return spendsElsewhere ? wrong : { ok: true }
}

/**
 * Who received the funds, read from the transaction rather than the request.
 *
 * The merge destination is the recipient by construction — TX2's last operation
 * sends the ephemeral account's remainder there. Taking it from the envelope
 * means the recorded `claimedBy` matches what the ledger did, not what a client
 * claimed alongside it.
 */
function recipientOf(transaction: Transaction): string | null {
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
export const submitClaim = observedClaim('submit', submitClaimUnobserved)
