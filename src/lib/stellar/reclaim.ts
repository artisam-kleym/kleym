/**
 * Reclaim construction. SPEC.md §3.4.
 *
 * After `expiresAt` the sender's claimant predicate becomes satisfiable, so
 * unclaimed balances can be returned with one `ClaimClaimableBalance` operation
 * each, sourced from the sender and batched under the protocol's 100-operation
 * ceiling.
 *
 * The balance IDs handed in here must have come from a live Horizon query
 * (SPEC.md §3.4). A database row is not authorisation to build an operation:
 * including one balance a recipient already claimed fails the WHOLE batch with
 * `op_does_not_exist`, taking the other 89 refunds down with it.
 *
 * No secret reaches this module. Kleym builds an unsigned envelope; the sender
 * signs in their own wallet (SPEC.md §8).
 */
import {
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  type Account,
} from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

export interface BuildReclaimInput {
  /** The sender's account, loaded from Horizon — its sequence number is used. */
  senderAccount: Account
  senderPublicKey: string
  /** Balance IDs confirmed to still exist on the ledger, in order. */
  balanceIds: string[]
  networkPassphrase: string
  /** Per-operation fee in stroops. */
  baseFee: string
  /** Seconds the sender has to sign before the envelope expires. */
  timeoutSeconds: number
}

/** Builds the unsigned envelope returning one batch of balances to the sender. */
export function buildReclaimTransaction(input: BuildReclaimInput): { xdr: string } {
  if (input.balanceIds.length === 0) {
    throw new Error('cannot build a reclaim with no balances')
  }

  const builder = new TransactionBuilder(input.senderAccount, {
    fee: input.baseFee,
    networkPassphrase: input.networkPassphrase,
  })

  for (const balanceId of input.balanceIds) {
    builder.addOperation(
      Operation.claimClaimableBalance({ balanceId, source: input.senderPublicKey }),
    )
  }

  return { xdr: builder.setTimeout(input.timeoutSeconds).build().toXDR() }
}

export interface ExpectedReclaim {
  senderPublicKey: string
  balanceIds: string[]
  networkPassphrase: string
  baseFee: string
}

/** See the note on MAX_FEE_MULTIPLE in stellar/batch.ts — same reasoning. */
const MAX_FEE_MULTIPLE = 10

export type ReclaimVerifyFailure =
  | 'unparseable'
  | 'wrong-source'
  | 'wrong-operation-count'
  | 'wrong-operation-type'
  | 'wrong-balance'
  | 'wrong-operation-source'
  | 'wrong-fee'
  | 'not-signed-by-sender'

/**
 * Checks that a signed envelope reclaims exactly the balances Kleym prepared.
 *
 * The envelope comes back through the sender's browser, so it is untrusted
 * even though the sender is authenticated — a compromised page or extension
 * can return a different transaction than the one it was handed. Two things
 * matter beyond shape:
 *
 * - Every operation must be a `claimClaimableBalance` for an expected id. An
 *   envelope that claims the balances AND adds a payment somewhere else would
 *   otherwise be submitted by Kleym on the sender's behalf.
 * - Every operation's source must be the sender. An operation sourced
 *   elsewhere is not the sender reclaiming their own funds.
 *
 * Balance ids are compared as a multiset rather than positionally: a wallet
 * that reorders operations has not changed what the transaction does, and the
 * result — the sender holding their own funds again — is identical.
 */
export function verifyReclaimTransaction(
  signedXdr: string,
  expected: ExpectedReclaim,
): { ok: true; transaction: Transaction } | { ok: false; reason: ReclaimVerifyFailure } {
  let transaction: Transaction
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, expected.networkPassphrase)
    if (!(parsed instanceof Transaction)) return { ok: false, reason: 'unparseable' }
    transaction = parsed
  } catch {
    return { ok: false, reason: 'unparseable' }
  }

  if (transaction.source !== expected.senderPublicKey) {
    return { ok: false, reason: 'wrong-source' }
  }

  // The signature, not a passphrase field, is what proves the network — see
  // the long note in stellar/batch.ts.
  if (!signedBy(transaction, expected.senderPublicKey)) {
    return { ok: false, reason: 'not-signed-by-sender' }
  }

  if (transaction.operations.length !== expected.balanceIds.length) {
    return { ok: false, reason: 'wrong-operation-count' }
  }

  const preparedTotalFee = new Decimal(expected.baseFee).times(expected.balanceIds.length)
  if (new Decimal(transaction.fee).greaterThan(preparedTotalFee.times(MAX_FEE_MULTIPLE))) {
    return { ok: false, reason: 'wrong-fee' }
  }

  const outstanding = new Set(expected.balanceIds)
  for (const operation of transaction.operations) {
    if (operation.type !== 'claimClaimableBalance') {
      return { ok: false, reason: 'wrong-operation-type' }
    }
    // An absent source inherits the transaction's, which is checked above.
    if (operation.source !== undefined && operation.source !== expected.senderPublicKey) {
      return { ok: false, reason: 'wrong-operation-source' }
    }
    // `delete` returning false catches an unexpected id AND a duplicate one.
    if (!outstanding.delete(operation.balanceId)) {
      return { ok: false, reason: 'wrong-balance' }
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
 * The balance ids a signed envelope actually claims.
 *
 * Returns null if the envelope will not parse, and null if it contains any
 * operation that is not a `claimClaimableBalance` — the caller uses this list
 * to decide what the sender is authorised to reclaim, so an envelope carrying
 * anything else must not yield a tidy list that hides the extra operation.
 */
export function claimedBalanceIds(signedXdr: string, networkPassphrase: string): string[] | null {
  let transaction: Transaction
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase)
    if (!(parsed instanceof Transaction)) return null
    transaction = parsed
  } catch {
    return null
  }

  const ids: string[] = []
  for (const operation of transaction.operations) {
    if (operation.type !== 'claimClaimableBalance') return null
    ids.push(operation.balanceId)
  }
  return ids
}
