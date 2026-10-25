/**
 * Batch construction. SPEC.md §3.2.
 *
 * One `CreateClaimableBalance` operation per link, batched under the protocol's
 * 100-operation ceiling. Everything here is pure except `buildBatchTransaction`,
 * which needs the sender's current sequence number.
 *
 * No secret ever reaches this module. The sender signs in their own wallet
 * (SPEC.md §8); Kleym builds an unsigned envelope and never sees a seed.
 */
import {
  Asset,
  Claimant,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
  type Account,
} from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

/**
 * A link as the builder needs it: a public key, and — since #73 — what it
 * pays. `amount` is optional here so a uniform campaign can still be built
 * from `amountPerLink` alone; when present it wins, position by position,
 * in both the builder and the verifier.
 */
export interface BatchLink {
  id: string
  ephemeralPublicKey: string
  recipientPublicKey?: string | null
  /** Fixed-point string. Falls back to the batch's `amountPerLink` when absent. */
  amount?: string
}

/** The amount THIS link's operation carries: its own, or the campaign default. */
export function linkAmount(link: BatchLink, amountPerLink: string): string {
  return link.amount ?? amountPerLink
}

/**
 * Splits links into batches of at most `size`.
 *
 * 1-based sequence, matching `Batch.sequence` and the "Batch 3 / 12" the UI
 * shows. Order is the caller's, and is stable: a retry that rebuilds batch 7
 * must produce the same links in the same order.
 */
export function chunkLinks<T>(links: T[], size: number): T[][] {
  if (size < 1) throw new Error(`batch size must be at least 1, got ${size}`)
  const batches: T[][] = []
  for (let i = 0; i < links.length; i += size) batches.push(links.slice(i, i + size))
  return batches
}

/** How many batches a campaign of `linkCount` links needs. */
export function batchCount(linkCount: number, size: number): number {
  if (size < 1) throw new Error(`batch size must be at least 1, got ${size}`)
  return Math.ceil(linkCount / size)
}

/**
 * The two claimants for one link, per SPEC.md §3.2.
 *
 * The predicates are mutually exclusive and jointly exhaustive: the recipient
 * may claim strictly before `expiresAt`, the sender strictly after. There is no
 * instant at which both can claim, and none at which neither can — which is
 * what makes reclaim safe without a custodial step. Proven on testnet in both
 * directions by the #1 spike; asserted structurally here so a reordering or a
 * dropped `not` fails a test rather than a campaign.
 */
export function claimantsFor(ephemeralPublicKey: string, senderPublicKey: string, expiresAt: Date): Claimant[] {
  const unixExpiry = Math.floor(expiresAt.getTime() / 1000).toString()
  const beforeExpiry = Claimant.predicateBeforeAbsoluteTime(unixExpiry)

  return [
    new Claimant(ephemeralPublicKey, beforeExpiry),
    new Claimant(senderPublicKey, Claimant.predicateNot(beforeExpiry)),
  ]
}

export interface BatchPlan {
  sequence: number
  links: BatchLink[]
}

/** Groups a campaign's links into numbered batches. */
export function planBatches(links: BatchLink[], size: number): BatchPlan[] {
  return chunkLinks(links, size).map((batch, index) => ({ sequence: index + 1, links: batch }))
}

export interface BuildBatchInput {
  /** The sender's account, loaded from Horizon — its sequence number is used. */
  senderAccount: Account
  /** Present only for sponsor-paid funding: this account owns the sequence and fee. */
  sponsorAccount?: Account
  senderPublicKey: string
  asset: Asset
  /** The default for links that carry no `amount` of their own. */
  amountPerLink: string
  expiresAt: Date
  links: BatchLink[]
  networkPassphrase: string
  /** Per-operation fee in stroops. */
  baseFee: string
  /** Seconds the sender has to sign before the envelope expires. */
  timeoutSeconds: number
}

/**
 * Builds the unsigned envelope for one batch.
 *
 * Returns the base64 XDR the sender's wallet signs, and the balance IDs the
 * operations will produce. The IDs are derived by the SDK from the source
 * account, sequence number and operation index — deterministic before
 * submission, and confirmed against Horizon before any link is marked ACTIVE
 * (AGENT.md §4.2). Deriving them by walking the result XDR by hand is the
 * error-prone path the issue warns against.
 */
export function buildBatchTransaction(input: BuildBatchInput): {
  xdr: string
  balanceIds: { linkId: string; balanceId: string }[]
} {
  if (input.links.length === 0) throw new Error('cannot build a batch with no links')

  const builder = new TransactionBuilder(input.sponsorAccount ?? input.senderAccount, {
    fee: input.baseFee,
    networkPassphrase: input.networkPassphrase,
  })

  if (input.sponsorAccount) {
    builder.addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: input.senderPublicKey }))
  }

  for (const link of input.links) {
    builder.addOperation(
      Operation.createClaimableBalance({
        ...(input.sponsorAccount ? { source: input.senderPublicKey } : {}),
        asset: input.asset,
        amount: linkAmount(link, input.amountPerLink),
        claimants: claimantsFor(link.recipientPublicKey ?? link.ephemeralPublicKey, input.senderPublicKey, input.expiresAt),
      }),
    )
  }

  if (input.sponsorAccount) {
    builder.addOperation(Operation.endSponsoringFutureReserves({ source: input.senderPublicKey }))
  }

  const transaction = builder.setTimeout(input.timeoutSeconds).build()

  const balanceIds = input.links.map((link, index) => ({
    linkId: link.id,
    balanceId: transaction.getClaimableBalanceId(index + (input.sponsorAccount ? 1 : 0)),
  }))

  return { xdr: transaction.toXDR(), balanceIds }
}

/**
 * Total XLM the sender locks for `linkCount` links.
 *
 * `reservePerLink` is derived from the live base reserve (SPEC.md §3.2 requires
 * it be read at runtime), and the arithmetic is Decimal throughout —
 * AGENT.md §4.1 forbids `Number` for an amount.
 */
export function totalReserve(reservePerLink: Decimal, linkCount: number): Decimal {
  return reservePerLink.times(linkCount)
}

/** Total fee in XLM for a batch of `ops` operations at `baseFee` stroops each. */
export function batchFee(baseFee: string, ops: number): Decimal {
  return new Decimal(baseFee).times(ops).div(1e7)
}

export interface ExpectedBatch {
  senderPublicKey: string
  sponsorPublicKey?: string
  /** Server-stored body hash, not a value supplied by the browser. */
  preparedHash?: string
  asset: Asset
  amountPerLink: string
  expiresAt: Date
  links: BatchLink[]
  networkPassphrase: string
  /** Per-operation fee the envelope was prepared with, in stroops. */
  baseFee: string
}

/**
 * How far above the prepared fee a signed envelope may go.
 *
 * The fee is the sender's own money and they signed for it, so an inflated one
 * is not a Kleym-integrity problem — but a compromised wallet returning a
 * correctly-shaped batch with an enormous fee is precisely the threat the rest
 * of this function is written against, and it costs the sender real XLM.
 * Generous enough that surge pricing or a wallet bumping the fee still clears.
 */
const MAX_FEE_MULTIPLE = 10

export type VerifyFailure =
  | 'unparseable'
  | 'wrong-source'
  | 'wrong-operation-count'
  | 'wrong-operation-type'
  | 'wrong-asset'
  | 'wrong-amount'
  | 'wrong-claimants'
  | 'wrong-fee'
  | 'not-signed-by-sender'
  | 'wrong-prepared-transaction'

/**
 * Checks that a signed envelope is the batch Kleym prepared, and nothing else.
 *
 * The signed XDR arrives from the sender's browser, so it is untrusted input
 * even though the sender is authenticated: a wallet, an extension or a
 * compromised page can return a different transaction than the one it was
 * handed. Submitting without re-deriving the operations would let a campaign's
 * funds move somewhere Kleym then records as claimable links.
 *
 * Every field the operations carry is compared against the campaign row, not
 * against the prepared envelope — the prepared envelope is also client-visible
 * and would prove nothing.
 */
export function verifyBatchTransaction(
  signedXdr: string,
  expected: ExpectedBatch,
): { ok: true; transaction: Transaction } | { ok: false; reason: VerifyFailure } {
  let transaction: Transaction
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, expected.networkPassphrase)
    if (!(parsed instanceof Transaction)) return { ok: false, reason: 'unparseable' }
    transaction = parsed
  } catch {
    // A mismatched passphrase and malformed base64 both land here; the caller
    // gets one message either way, which is also all a client should learn.
    return { ok: false, reason: 'unparseable' }
  }

  if (transaction.source !== (expected.sponsorPublicKey ?? expected.senderPublicKey)) {
    return { ok: false, reason: 'wrong-source' }
  }

  if (expected.preparedHash && transaction.hash().toString('hex') !== expected.preparedHash) {
    return { ok: false, reason: 'wrong-prepared-transaction' }
  }

  /*
   * The SIGNATURE is what proves the network, not a passphrase comparison.
   *
   * A transaction envelope carries no network identifier — `fromXDR` simply
   * labels the parsed transaction with whatever passphrase it is handed, so
   * comparing that field to the expected one always succeeds and checks
   * nothing. The network id is only mixed in when the signature payload is
   * hashed, so verifying the sender's signature over `transaction.hash()`
   * under the expected passphrase is the check that actually rejects an
   * envelope signed for the wrong network — and, in the same step, one the
   * sender never signed at all.
   */
  if (!signedBy(transaction, expected.senderPublicKey)) {
    return { ok: false, reason: 'not-signed-by-sender' }
  }

  const overhead = expected.sponsorPublicKey ? 2 : 0
  if (transaction.operations.length !== expected.links.length + overhead) {
    return { ok: false, reason: 'wrong-operation-count' }
  }

  /*
   * `transaction.fee` is the TOTAL, not per-operation: the SDK multiplies the
   * builder's fee by the operation count. Comparing it against the
   * per-operation figure would reject every batch of more than one.
   */
  const preparedTotalFee = new Decimal(expected.baseFee).times(expected.links.length + overhead)
  if (new Decimal(transaction.fee).greaterThan(preparedTotalFee.times(MAX_FEE_MULTIPLE))) {
    return { ok: false, reason: 'wrong-fee' }
  }

  const expectedAsset = expected.asset
  const expiry = Math.floor(expected.expiresAt.getTime() / 1000).toString()

  if (expected.sponsorPublicKey) {
    const first = transaction.operations[0]!
    const last = transaction.operations.at(-1)!
    if (first.type !== 'beginSponsoringFutureReserves' || last.type !== 'endSponsoringFutureReserves') {
      return { ok: false, reason: 'wrong-operation-type' }
    }
    if (first.sponsoredId !== expected.senderPublicKey || (first.source ?? transaction.source) !== expected.sponsorPublicKey || last.source !== expected.senderPublicKey) {
      return { ok: false, reason: 'wrong-source' }
    }
  }
  const operations = overhead ? transaction.operations.slice(1, -1) : transaction.operations
  for (const [index, operation] of operations.entries()) {
    if (operation.type !== 'createClaimableBalance') {
      return { ok: false, reason: 'wrong-operation-type' }
    }
    if ((operation.source ?? transaction.source) !== expected.senderPublicKey) {
      return { ok: false, reason: 'wrong-source' }
    }
    if (!operation.asset.equals(expectedAsset)) {
      return { ok: false, reason: 'wrong-asset' }
    }
    /*
     * Against THIS link's amount (#73), by position — not against a single
     * campaign figure, and never skipped because amounts may now vary. A
     * verifier that stopped checking amounts when they became per-link would
     * remove the one control that stops a compromised browser altering what
     * gets funded. String comparison would fail on '1.0' vs '1.0000000'; the
     * amounts are equal as money, which is the only sense that matters here.
     */
    if (!new Decimal(operation.amount).equals(new Decimal(linkAmount(expected.links[index]!, expected.amountPerLink)))) {
      return { ok: false, reason: 'wrong-amount' }
    }
    if (!claimantsMatch(operation.claimants, expected.links[index]!.recipientPublicKey ?? expected.links[index]!.ephemeralPublicKey, expected.senderPublicKey, expiry)) {
      return { ok: false, reason: 'wrong-claimants' }
    }
  }

  return { ok: true, transaction }
}

/** Whether `publicKey` signed this transaction, under its attached passphrase. */
function signedBy(transaction: Transaction, publicKey: string): boolean {
  const keypair = Keypair.fromPublicKey(publicKey)
  const payload = transaction.hash()
  return transaction.signatures.some((signature) => {
    if (!signature.hint().equals(keypair.signatureHint())) return false
    return keypair.verify(payload, signature.signature())
  })
}

/**
 * Both claimants, in order, with the exact predicates SPEC.md §3.2 specifies.
 *
 * Compared through XDR rather than by reading the predicate objects: the
 * predicate union has several shapes, and a hand-written reader that silently
 * fails to recognise one would pass a transaction it never actually checked.
 */
function claimantsMatch(
  claimants: Claimant[],
  ephemeralPublicKey: string,
  senderPublicKey: string,
  unixExpiry: string,
): boolean {
  if (claimants.length !== 2) return false

  const beforeExpiry = Claimant.predicateBeforeAbsoluteTime(unixExpiry)
  const wanted = [
    new Claimant(ephemeralPublicKey, beforeExpiry),
    new Claimant(senderPublicKey, Claimant.predicateNot(beforeExpiry)),
  ]

  return claimants.every((claimant, index) => {
    const other = wanted[index]!
    return (
      claimant.destination === other.destination &&
      claimant.predicate.toXDR('base64') === other.predicate.toXDR('base64')
    )
  })
}

/** Balance IDs the operations of a submitted envelope will produce, by index. */
export function balanceIdsOf(transaction: Transaction, links: BatchLink[]): { linkId: string; balanceId: string }[] {
  const offset = transaction.operations[0]?.type === 'beginSponsoringFutureReserves' ? 1 : 0
  return links.map((link, index) => ({ linkId: link.id, balanceId: transaction.getClaimableBalanceId(index + offset) }))
}

/**
 * Balance IDs as the LEDGER reported them, read out of a transaction result.
 *
 * `balanceIdsOf` derives IDs before submission and is what the confirm worker
 * uses; this reads the same IDs back from what the network returned. They are
 * compared in tests/lib/stellar/batch.test.ts against a real testnet
 * transaction, which is the only way to know the derivation is right rather
 * than merely self-consistent.
 */
export function balanceIdsFromResultXdr(resultXdr: string): string[] {
  const result = xdr.TransactionResult.fromXDR(resultXdr, 'base64')
  return result
    .result()
    .results()
    .filter((operation) => operation.tr().switch().name === 'createClaimableBalance')
    .map((operation) => operation.tr().createClaimableBalanceResult().balanceId().toXDR('hex'))
}
