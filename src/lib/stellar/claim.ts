/**
 * The claim transactions. SPEC.md §3.3 — verified on testnet by the #1 spike.
 *
 * TWO transactions, and TX2 must land in a LATER LEDGER than TX1. §3.3.1 records
 * why, and it is not a preference: an account cannot be merged in the
 * transaction that created it (`op_seq_num_too_far`), nor while it holds a
 * trustline (`op_has_sub_entries`). Both were isolated with controls in
 * scripts/spike-diagnose.ts. There is no workaround, so any "simplification"
 * that folds these back into one transaction is a regression to a disproven
 * design.
 *
 * Every operation list here follows the spike, not the original spec text —
 * the issue is explicit that where they disagree, the spike wins.
 *
 * NO SEED reaches this module. The ephemeral key arrives as a public key
 * derived in the browser; the recipient signs in their own wallet; the only
 * secret is SPONSOR_SECRET_KEY, which is Kleym's own (AGENT.md §1, §5.5).
 */
import {
  Asset,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  type Account,
} from '@stellar/stellar-sdk'
import { toMemo, type DepositMemo } from './memo'

/** How long the recipient has to sign before the envelope expires. */
const SIGNING_WINDOW_SECONDS = 180

export interface LedgerFacts {
  /** Does the ephemeral account already exist? If so, TX1 is a no-op. */
  ephemeralExists: boolean
  ephemeralTrusts: boolean
  recipientExists: boolean
  recipientTrusts: boolean
}

export interface ClaimContext {
  sponsorAccount: Account
  sponsorPublicKey: string
  ephemeralPublicKey: string
  recipientPublicKey: string
  asset: Asset
  amount: string
  /** The claimable balance TX2 claims. Read from the ledger, never the client. */
  balanceId: string
  networkPassphrase: string
  baseFee: string
  /**
   * Receive-as (#74). When present, TX2 converts on the way out: a
   * `pathPaymentStrictSend` from the ephemeral account replaces the plain
   * payment, sending the whole link amount of `asset` and delivering at least
   * `destMin` of `destAsset`. Quoted and bounded on the SERVER; the recipient
   * never supplies a price. Absent, TX2 is byte-for-byte what it always was.
   */
  conversion?: Conversion
  /**
   * Deposit memo (#75): the recipient is an exchange or custodian account.
   * The memo rides on TX2, and the ephemeral account is merged to the
   * SPONSOR rather than the recipient — `accountMerge` carries no memo, so
   * its remainder arriving at an omnibus account would be credited to nobody.
   * The sponsored reserve returns to the sponsor on merge whatever the
   * destination, and the account's own balance is ~0 (created with
   * `startingBalance: '0'`), so nothing is lost by pointing it home.
   */
  memo?: DepositMemo
}

export interface Conversion {
  destAsset: Asset
  /** The quote minus tolerance. The whole risk control: below this, the transaction fails rather than fills. */
  destMin: string
  /** Intermediate assets from the quote, so the path that was priced is the path that is taken. */
  path: Asset[]
}

/** What the recipient ends up holding — the destination asset when converting, the campaign asset otherwise. */
export function deliveredAsset(context: Pick<ClaimContext, 'asset' | 'conversion'>): Asset {
  return context.conversion?.destAsset ?? context.asset
}

/**
 * TX1 — materialise the ephemeral account. Signers: SPONSOR, EPHEMERAL.
 *
 * The recipient is deliberately absent: TX1 needs only the sponsor and the
 * ephemeral key, and the ephemeral key is derivable from the URL fragment the
 * moment the claim page loads.
 *
 * SPEC.md §3.3 is emphatic that this must NOT be submitted on page load. Every
 * abandoned page would strand sponsor reserves that §3.3.2 says Kleym cannot
 * recover — merely opening a link would cost 1.0–1.5 XLM of float. It is built
 * when the recipient commits to claiming.
 */
export function buildMaterialise(
  context: ClaimContext,
  facts: Pick<LedgerFacts, 'ephemeralTrusts'>,
): { xdr: string; operations: number } {
  const nonNative = !context.asset.isNative()

  const builder = new TransactionBuilder(context.sponsorAccount, {
    fee: context.baseFee,
    networkPassphrase: context.networkPassphrase,
  })

  builder.addOperation(
    Operation.beginSponsoringFutureReserves({
      sponsoredId: context.ephemeralPublicKey,
      source: context.sponsorPublicKey,
    }),
  )
  builder.addOperation(
    Operation.createAccount({
      destination: context.ephemeralPublicKey,
      startingBalance: '0',
      source: context.sponsorPublicKey,
    }),
  )
  builder.addOperation(
    Operation.endSponsoringFutureReserves({ source: context.ephemeralPublicKey }),
  )

  if (nonNative && !facts.ephemeralTrusts) {
    builder.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: context.ephemeralPublicKey,
        source: context.sponsorPublicKey,
      }),
    )
    builder.addOperation(
      Operation.changeTrust({ asset: context.asset, source: context.ephemeralPublicKey }),
    )
    builder.addOperation(
      Operation.endSponsoringFutureReserves({ source: context.ephemeralPublicKey }),
    )
  }

  const transaction = builder.setTimeout(SIGNING_WINDOW_SECONDS).build()
  return { xdr: transaction.toXDR(), operations: transaction.operations.length }
}

export interface ClaimPlan {
  xdr: string
  operations: number
  /**
   * Whether the RECIPIENT must sign.
   *
   * Only when the recipient is an operation source. Stellar rejects a
   * transaction carrying a signature it does not need with `tx_bad_auth_extra`
   * — observed in the spike, not assumed: it submits an over-signed
   * transaction, asserts the code, then submits the same transaction correctly
   * signed to show the rejection was the signature and not the operations.
   */
  needsRecipientSignature: boolean
  recipientExists: boolean
  recipientTrusts: boolean
}

/**
 * TX2 — claim, forward, dispose. Signers: SPONSOR, EPHEMERAL, and RECIPIENT
 * only when the recipient is an operation source.
 *
 * Op order is load-bearing at the end: the ephemeral trustline must be removed
 * BEFORE the merge, because `AccountMerge` refuses an account holding any
 * subentry. Removing it also returns that reserve to the sponsor. The merge
 * itself releases the rest — without it every claim permanently leaks reserve
 * XLM from the sponsor account.
 */
export function buildClaim(context: ClaimContext, facts: LedgerFacts): ClaimPlan {
  const nonNative = !context.asset.isNative()
  /*
   * The trustline the RECIPIENT needs is for what they RECEIVE (#74). With a
   * conversion that is the destination asset; sponsoring the campaign asset's
   * trustline instead would create the account and then fail `op_no_trust`.
   * `facts.recipientTrusts` is read against this same asset by the caller.
   */
  const delivered = deliveredAsset(context)
  const deliveredNonNative = !delivered.isNative()

  const builder = new TransactionBuilder(context.sponsorAccount, {
    fee: context.baseFee,
    networkPassphrase: context.networkPassphrase,
  })

  builder.addOperation(
    Operation.claimClaimableBalance({
      balanceId: context.balanceId,
      source: context.ephemeralPublicKey,
    }),
  )

  if (!facts.recipientExists) {
    builder.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: context.recipientPublicKey,
        source: context.sponsorPublicKey,
      }),
    )
    builder.addOperation(
      Operation.createAccount({
        destination: context.recipientPublicKey,
        startingBalance: '0',
        source: context.sponsorPublicKey,
      }),
    )
    builder.addOperation(
      Operation.endSponsoringFutureReserves({ source: context.recipientPublicKey }),
    )
  }

  if (deliveredNonNative && !facts.recipientTrusts) {
    builder.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: context.recipientPublicKey,
        source: context.sponsorPublicKey,
      }),
    )
    builder.addOperation(
      Operation.changeTrust({ asset: delivered, source: context.recipientPublicKey }),
    )
    builder.addOperation(
      Operation.endSponsoringFutureReserves({ source: context.recipientPublicKey }),
    )
  }

  if (context.conversion) {
    builder.addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: context.asset,
        sendAmount: context.amount,
        destination: context.recipientPublicKey,
        destAsset: context.conversion.destAsset,
        destMin: context.conversion.destMin,
        path: context.conversion.path,
        source: context.ephemeralPublicKey,
      }),
    )
  } else {
    builder.addOperation(
      Operation.payment({
        destination: context.recipientPublicKey,
        asset: context.asset,
        amount: context.amount,
        source: context.ephemeralPublicKey,
      }),
    )
  }

  // Before the merge, always. See the note above.
  if (nonNative) {
    builder.addOperation(
      Operation.changeTrust({
        asset: context.asset,
        limit: '0',
        source: context.ephemeralPublicKey,
      }),
    )
  }

  builder.addOperation(
    Operation.accountMerge({
      // To the sponsor when depositing with a memo (#75) — see ClaimContext.memo.
      destination: context.memo ? context.sponsorPublicKey : context.recipientPublicKey,
      source: context.ephemeralPublicKey,
    }),
  )

  if (context.memo) builder.addMemo(toMemo(context.memo))

  const transaction = builder.setTimeout(SIGNING_WINDOW_SECONDS).build()

  return {
    xdr: transaction.toXDR(),
    operations: transaction.operations.length,
    needsRecipientSignature: !facts.recipientExists || (deliveredNonNative && !facts.recipientTrusts),
    recipientExists: facts.recipientExists,
    recipientTrusts: facts.recipientTrusts,
  }
}

/**
 * Adds the SPONSOR signature to an envelope.
 *
 * The only place the sponsor seed is used, and it is read at call time rather
 * than held in a module-level Keypair — a long-lived Keypair is one more object
 * a heap dump can find (AGENT.md §5.5).
 */
export function signAsSponsor(xdr: string, networkPassphrase: string, sponsorSecret: string): string {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase)
  if (!(transaction instanceof Transaction)) {
    throw new Error('refusing to sponsor-sign a fee-bump envelope')
  }
  transaction.sign(Keypair.fromSecret(sponsorSecret))
  return transaction.toXDR()
}
