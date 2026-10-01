import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { horizon } from './horizon'
import type { LedgerAttempt, Prisma } from '@/generated/prisma/client'
import { feeChargedOf } from './fees'

export interface LedgerResult {
  hash: string
  successful: boolean
  ledger?: number
  resultXdr?: string
  feeCharged?: string | number | null
  errorCode?: string
}
export type AttemptLookup = (hash: string) => Promise<LedgerResult | null>

export const lookupAttempt: AttemptLookup = async (hash) => {
  try {
    const record = await horizon().transactions().transaction(hash).call()
    return { hash: record.hash, successful: record.successful, ledger: record.ledger_attr,
      resultXdr: record.result_xdr, feeCharged: feeChargedOf(record.result_xdr) }
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404 || (error as { name?: string }).name === 'NotFoundError') return null
    throw error
  }
}

export function parseAttempt(xdr: string): Transaction {
  const transaction = TransactionBuilder.fromXDR(xdr, env.NETWORK_PASSPHRASE)
  if (!(transaction instanceof Transaction)) throw new Error('Unexpected envelope')
  return transaction
}

export function hasSignature(transaction: Transaction, publicKey: string): boolean {
  const key = Keypair.fromPublicKey(publicKey)
  return transaction.signatures.some((signature) =>
    signature.hint().equals(key.signatureHint()) && key.verify(transaction.hash(), signature.signature()))
}

/** Serialize preparation so two tabs receive the same body, including sequence. */
export async function prepareAttempt(
  scope: string, campaignId: string, kind: string, xdr: string, metadata: Prisma.InputJsonObject,
): Promise<LedgerAttempt> {
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`
    const prior = await db.ledgerAttempt.findUnique({ where: { scope } })
    if (prior && prior.status !== 'FAILED' && prior.status !== 'CONFIRMED' && prior.status !== 'SETTLED') {
      const maxTime = Number(parseAttempt(prior.preparedXdr).timeBounds?.maxTime ?? 0)
      // An uncertain submission is never replaced, even after its timeout.
      if (prior.status === 'SUBMITTED' || maxTime > Date.now() / 1000) return prior
    }
    const data = { campaignId, kind, preparedXdr: xdr, transactionHash: parseAttempt(xdr).hash().toString('hex'),
      metadata, submittedXdr: null, status: 'PREPARED', ledger: null, resultXdr: null, feeCharged: null }
    return db.ledgerAttempt.upsert({ where: { scope }, create: { scope, ...data }, update: data })
  })
}

/** Save the original signed bytes before Horizon; recover only this hash. */
export async function executeAttempt(
  attempt: LedgerAttempt, transaction: Transaction,
  submit: (transaction: Transaction) => Promise<LedgerResult>,
  lookup: AttemptLookup = lookupAttempt,
  canSubmit = true,
): Promise<LedgerResult> {
  if (transaction.hash().toString('hex') !== attempt.transactionHash) throw new Error('Prepared body changed')
  if (attempt.status === 'CONFIRMED' || attempt.status === 'SETTLED') return {
    hash: attempt.transactionHash, successful: true, ledger: attempt.ledger ?? undefined,
    resultXdr: attempt.resultXdr ?? undefined, feeCharged: attempt.feeCharged,
  }
  if (attempt.status === 'FAILED') throw new Error('Prepare a new transaction after the confirmed failure')
  await prisma.ledgerAttempt.updateMany({
    where: { scope: attempt.scope, transactionHash: attempt.transactionHash, status: 'PREPARED' },
    data: { status: 'SUBMITTED', submittedXdr: transaction.toXDR() },
  })
  const saved = await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: attempt.scope } })
  if (saved.transactionHash !== attempt.transactionHash || !saved.submittedXdr) throw new Error('Preparation changed')
  let result = await lookup(saved.transactionHash)
  const original = parseAttempt(saved.submittedXdr)
  const maxTime = Number(original.timeBounds?.maxTime ?? 0)
  if (!result && lookup === lookupAttempt && maxTime > 0 && maxTime <= Date.now() / 1000) {
    const ledgers = await horizon().ledgers().order('desc').limit(1).call()
    const closedAt = Date.parse(ledgers.records[0]?.closed_at ?? '') / 1000
    if (closedAt > maxTime) {
      // Query again after a closed ledger past the bound: this original body
      // cannot execute in any later ledger. A new prepare still checks balances.
      result = await lookup(saved.transactionHash)
      if (!result) {
        await prisma.ledgerAttempt.updateMany({ where: { scope: saved.scope, transactionHash: saved.transactionHash }, data: { status: 'FAILED' } })
        return { hash: saved.transactionHash, successful: false }
      }
    }
  }
  if (!result) {
    if (!canSubmit) throw new Error('Only confirmation lookup is allowed for this attempt')
    try {
      result = await submit(original)
    } catch (error) {
      // A timeout or spent sequence is not evidence of failure. Look up this
      // exact hash before returning a pending response or attempting a resend.
      result = await lookup(saved.transactionHash)
      if (!result) {
        const codes = (error as { response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } } })
          .response?.data?.extras?.result_codes
        const code = codes?.transaction
        // These explicit rejections cannot have paid the recipient. Unknown
        // responses and tx_bad_seq stay pending until their hash is observed.
        if (code && code !== 'tx_bad_seq') {
          await prisma.ledgerAttempt.updateMany({ where: { scope: saved.scope, transactionHash: saved.transactionHash },
            data: { status: 'FAILED' } })
          return { hash: saved.transactionHash, successful: false,
            errorCode: codes?.operations?.find((operation) => operation !== 'op_success') ?? code }
        }
        throw error
      }
    }
  }
  if (result.hash !== saved.transactionHash) throw new Error('Ledger returned a different transaction')
  await prisma.ledgerAttempt.updateMany({
    where: { scope: saved.scope, transactionHash: saved.transactionHash },
    data: { status: result.successful ? 'CONFIRMED' : 'FAILED', ledger: result.ledger ?? null,
      resultXdr: result.resultXdr ?? null, feeCharged: result.feeCharged == null ? null : String(result.feeCharged) },
  })
  return result
}
