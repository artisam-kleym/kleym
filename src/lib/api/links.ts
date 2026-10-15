/**
 * Link registration, as one atomic operation.
 *
 * Lives here rather than inline in the route so the race it guards against can
 * be exercised directly — a concurrency bound that only exists inside a route
 * handler can only be tested through a session, and so tends not to be.
 */
import Decimal from 'decimal.js'
import { StrKey } from '@stellar/stellar-sdk'
import { prisma } from '@/lib/db/client'
import { owned } from './session-guard'
import { hashClaimCode } from './claim-policy'

export type RegisterOutcome =
  | { kind: 'not-found' }
  | { kind: 'bad-status'; status: string }
  /** CODE policy (#79): the campaign needs a code per link and did not get one — or got codes it does not take. */
  | { kind: 'codes'; detail: string }
  | { kind: 'budget'; detail: string }
  | { kind: 'over-limit'; declared: number; adding: number; wouldTotal: number }
  | { kind: 'ok'; registered: number; total: number }

/**
 * Reads the count, checks the limit and inserts in ONE serializable transaction.
 *
 * As three separate statements this was check-then-act: two concurrent
 * registrations both read the same count, both pass the check, and together
 * exceed `linkCount` — which bounds how much value the campaign commits, so
 * overshooting it is not cosmetic. Serializable is what makes the bound real;
 * a lower isolation level still admits the interleaving, because the rows
 * being counted are the rows being inserted.
 *
 * The loser of a genuine race aborts with Postgres 40001, surfaced by Prisma
 * as P2034. That is the transaction working, and the caller should retry.
 */
export async function registerLinks(
  campaignId: string,
  organizationId: string,
  publicKeys: string[],
  labels?: (string | null)[],
  attestations?: ({ reference?: string | null; category?: string | null; note?: string | null } | null)[],
  /** Per-link amounts (#73); `null` or absent means the campaign default. */
  amounts?: (string | null)[],
  codes?: string[],
  recipientPublicKeys?: string[],
): Promise<RegisterOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: owned(campaignId, organizationId),
        select: { id: true, status: true, linkCount: true, amountPerLink: true, variableAmounts: true, claimPolicy: true, senderPublicKey: true, renewalOfId: true },
      })
      if (!campaign) return { kind: 'not-found' }

      /*
       * Every row gets an amount at registration — its own, or the campaign
       * default — so no ClaimLink is ever ambiguous about what it pays. The
       * default is the campaign's, read here rather than at request time, so
       * a stale client figure cannot become a row.
       */
      const fallback = new Decimal(campaign.amountPerLink.toString())
      const resolved = publicKeys.map((_, index) => {
        const own = amounts?.[index]
        return own ? new Decimal(own) : fallback
      })
      const variable = campaign.variableAmounts || resolved.some((amount) => !amount.equals(fallback))
      if (campaign.renewalOfId && variable) return { kind: 'budget', detail: 'A renewal must preserve each returned link amount; variable amounts would change its refunded budget.' }

      if (campaign.claimPolicy === 'WALLET') {
        if (!recipientPublicKeys || recipientPublicKeys.length !== publicKeys.length ||
          recipientPublicKeys.some((key) => !StrKey.isValidEd25519PublicKey(key) || key === campaign.senderPublicKey || publicKeys.includes(key))) {
          return { kind: 'budget', detail: 'Register one valid assigned wallet address per link.' }
        }
      } else if (recipientPublicKeys) {
        return { kind: 'budget', detail: 'Assigned wallets require the wallet-bound claim policy.' }
      }

      // The policy decides whether codes are required or refused; never both silently.
      if (campaign.claimPolicy === 'CODE' && (!codes || codes.length !== publicKeys.length)) {
        return { kind: 'codes', detail: 'This campaign binds every link to a claim code; register one code per public key.' }
      }
      if (campaign.claimPolicy !== 'CODE' && codes) {
        return { kind: 'codes', detail: `This campaign's claim policy is ${campaign.claimPolicy.toLowerCase()}; it does not take claim codes.` }
      }

      if (campaign.status !== 'DRAFT' && campaign.status !== 'CREATING') {
        return { kind: 'bad-status', status: campaign.status }
      }

      const existing = await tx.claimLink.count({ where: { campaignId } })
      const desired = publicKeys.map((publicKey, index) => ({
        campaignId,
        ephemeralPublicKey: publicKey,
        recipientPublicKey: recipientPublicKeys?.[index] ?? null,
        amount: resolved[index]!.toFixed(),
        label: labels?.[index] ?? null,
        codeHash: codes ? hashClaimCode(codes[index]!) : null,
        reference: attestations?.[index]?.reference || null,
        category: attestations?.[index]?.category || null,
        note: attestations?.[index]?.note || null,
      }))
      if (new Set(publicKeys).size !== publicKeys.length) {
        return { kind: 'budget', detail: 'Every prize link must have a distinct public key.' }
      }
      // A committed registration may have lost its HTTP response. Replay only
      // identical public terms; silently ignoring changed amounts/codes would
      // produce an export that disagrees with the funded prize.
      const recorded = await tx.claimLink.findMany({
        where: { campaignId, ephemeralPublicKey: { in: publicKeys } },
        select: { ephemeralPublicKey: true, recipientPublicKey: true, amount: true, label: true, codeHash: true, reference: true, category: true, note: true },
      })
      const byKey = new Map(recorded.map((row) => [row.ephemeralPublicKey, row]))
      for (const prize of desired) {
        const row = byKey.get(prize.ephemeralPublicKey)
        if (row && (!new Decimal(row.amount.toString()).equals(prize.amount) ||
          row.recipientPublicKey !== prize.recipientPublicKey || row.label !== prize.label || row.codeHash !== prize.codeHash ||
          row.reference !== prize.reference || row.category !== prize.category || row.note !== prize.note)) {
          return { kind: 'budget', detail: 'A registered prize link has different terms. Keep its original export; registration retries cannot change its amount, label, code or recipient details.' }
        }
      }
      const additions = desired.filter((prize) => !byKey.has(prize.ephemeralPublicKey))
      const wouldTotal = existing + additions.length
      if (wouldTotal > campaign.linkCount) {
        return { kind: 'over-limit', declared: campaign.linkCount, adding: additions.length, wouldTotal }
      }
      if (additions.length === 0) return { kind: 'ok', registered: 0, total: existing }

      const created = await tx.claimLink.createMany({
        data: additions,
        skipDuplicates: true,
      })

      // Display reads this flag; money reads the link (schema.prisma).
      if (variable && !campaign.variableAmounts) {
        await tx.campaign.update({ where: { id: campaign.id }, data: { variableAmounts: true } })
      }

      /*
       * Counted again rather than added up. `skipDuplicates` means
       * `created.count` can be lower than requested, so `existing + count`
       * would report a total the table does not hold.
       */
      const total = await tx.claimLink.count({ where: { campaignId } })
      return { kind: 'ok', registered: created.count, total }
    },
    { isolationLevel: 'Serializable' },
  )
}

/**
 * A transaction aborted by serialization failure (Postgres 40001).
 *
 * Prisma 7 with the pg driver adapter reports this TWO ways depending on where
 * the abort lands: `P2034` from the query engine, and a bare
 * `DriverAdapterError: TransactionWriteConflict` when the adapter's COMMIT is
 * the statement that fails. Matching only the code lets the second shape fall
 * through to a 500 — a retryable conflict reported as a server fault.
 * Observed in scripts/verify-concurrency.ts, which is why it runs eight
 * attempts rather than two.
 */
export function isWriteConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: string; name?: string; message?: string }
  return (
    e.code === 'P2034' ||
    (e.name === 'DriverAdapterError' && e.message === 'TransactionWriteConflict')
  )
}
