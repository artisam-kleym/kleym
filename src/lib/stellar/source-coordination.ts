import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import type { Prisma } from '@/generated/prisma/client'
import { baseReserve, horizon, spendableNative } from './horizon'

export class SourceCoordinationError extends Error {}

export type SourceOwner = { batchId: string } | { scope: string }

/** Positive obligations only: do not spend reserves a later operation may release. */
export function requiredSourceXlm(transaction: Transaction, reserve: Decimal): Decimal {
  let units = 0
  let native = new Decimal(transaction.fee).div('10000000')
  const sponsored = new Set<string>()
  for (const op of transaction.operations) {
    const source = op.source ?? transaction.source
    if (op.type === 'beginSponsoringFutureReserves' && source === transaction.source) sponsored.add(op.sponsoredId)
    if (op.type === 'createAccount') {
      if (sponsored.has(op.destination)) units += 2
      if (source === transaction.source) native = native.plus(op.startingBalance)
    }
    if (op.type === 'changeTrust' && op.limit !== '0.0000000' &&
      (sponsored.has(source) || source === transaction.source)) units += 1
    if (op.type === 'createClaimableBalance') {
      if (sponsored.has(source) || source === transaction.source) units += op.claimants.length
      if (source === transaction.source && op.asset.isNative()) native = native.plus(op.amount)
    }
    if (op.type === 'payment' && source === transaction.source && op.asset.isNative()) native = native.plus(op.amount)
    if (op.type === 'endSponsoringFutureReserves') sponsored.delete(source)
  }
  return native.plus(reserve.times(units))
}

function classic(xdr: string): Transaction {
  const transaction = TransactionBuilder.fromXDR(xdr, env.NETWORK_PASSPHRASE)
  if (!(transaction instanceof Transaction)) throw new SourceCoordinationError('Unsupported stored transaction envelope.')
  return transaction
}

/**
 * Existing public-envelope journals are the durable reservation. PostgreSQL
 * serializes admission across web/worker processes, including preparations
 * made before this guard was introduced. Submitted envelopes never age out
 * here: their exact hash must first be resolved by the recovery worker.
 *
 * persist MUST write the prepared/submitted journal in this same transaction.
 * No advisory lock or database transaction remains open while a wallet signs.
 */
export async function coordinateSource<T>(
  candidate: Transaction, owner: SourceOwner,
  persist: (db: Prisma.TransactionClient, check: (body: Transaction) => Promise<void>) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (db) => {
    const key = `stellar-source:${env.STELLAR_NETWORK}:${candidate.source}`
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    const check = async (body: Transaction) => {
      if (body.source !== candidate.source) throw new SourceCoordinationError('The prepared transaction source changed. Prepare again.')
      const [batches, attempts] = await Promise.all([
        db.batch.findMany({ where: { campaign: { network: env.STELLAR_NETWORK }, status: { in: ['PENDING', 'SUBMITTED'] },
          OR: [{ preparedXdr: { not: null } }, { status: 'SUBMITTED' }] },
          select: { id: true, status: true, preparedXdr: true, submittedXdr: true,
            campaign: { select: { fundingMode: true, senderPublicKey: true, sponsorPublicKey: true } } } }),
        db.ledgerAttempt.findMany({ where: { campaign: { network: env.STELLAR_NETWORK }, status: { in: ['PREPARED', 'SUBMITTED'] } },
          select: { scope: true, status: true, preparedXdr: true } }),
      ])
      for (const entry of [...batches, ...attempts]) {
        if (('batchId' in owner && 'id' in entry && entry.id === owner.batchId) ||
          ('scope' in owner && 'scope' in entry && entry.scope === owner.scope)) continue
        if (!entry.preparedXdr) {
          // Pre-journal submitted batches still own their source; they cannot
          // safely be replaced merely because their historical XDR is absent.
          if ('campaign' in entry && entry.status === 'SUBMITTED') {
            const source = entry.submittedXdr ? classic(entry.submittedXdr).source :
              entry.campaign.fundingMode === 'SPONSORED' ? entry.campaign.sponsorPublicKey : entry.campaign.senderPublicKey
            if (source === body.source) throw new SourceCoordinationError('This transaction source is awaiting funding confirmation. Try again after recovery.')
          }
          continue
        }
        const stored = classic(entry.preparedXdr)
        const bound = Number(stored.timeBounds?.maxTime ?? 0)
        if (stored.source === body.source && (entry.status === 'SUBMITTED' || bound === 0 || bound > Date.now() / 1000)) {
          throw new SourceCoordinationError('This transaction source is completing another transaction. Wait for confirmation or its unsigned signing window to expire, then try again.')
        }
      }
      const maxTime = Number(body.timeBounds?.maxTime ?? 0)
      if (maxTime === 0 || maxTime <= Date.now() / 1000) {
        throw new SourceCoordinationError('The signing window expired. Prepare a new transaction.')
      }
      // Fresh under the source lock; never reuse the earlier preparation snapshot.
      const [account, reserve] = await Promise.all([horizon().loadAccount(body.source), baseReserve()])
      if (BigInt(body.sequence) !== BigInt(account.sequenceNumber()) + 1n) {
        throw new SourceCoordinationError('The transaction source sequence changed. Prepare again before signing.')
      }
      const needed = requiredSourceXlm(body, reserve)
      if (spendableNative(account, reserve).lessThan(needed)) {
        throw new SourceCoordinationError('The transaction source cannot cover the fee and new XLM reserves right now. Try again after it is refilled.')
      }
    }
    return persist(db, check)
  }, { maxWait: 5000, timeout: 20000 })
}
