import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { owned } from './session-guard'
import { readSenderBalances, type SenderBalanceReader } from './reclaim'

export class RenewalRefused extends Error {}

/** Reclaim settlement owns refund accounting; missing balances alone never prove a refund. */
export async function renewalSource(id: string, organizationId: string, readBalances: SenderBalanceReader = readSenderBalances, now = new Date()) {
  const source = await prisma.campaign.findFirst({
    where: owned(id, organizationId),
    select: {
      id: true, name: true, network: true, senderPublicKey: true, assetCode: true, assetIssuer: true,
      amountPerLink: true, expiresAt: true, status: true, variableAmounts: true,
      links: { select: { balanceId: true, status: true, amount: true, claimTxHash: true, claimedBy: true } },
      reclaims: { select: { transactionHash: true, amount: true, balanceCount: true } },
      renewal: { select: { id: true, status: true, expiresAt: true, derivationIndex: true, keyFingerprint: true,
        claimPolicy: true, reminderDaysBefore: true, receiveAsAssets: true, allowExchangeDeposit: true,
        links: { select: { ephemeralPublicKey: true } } } },
    },
  })
  if (!source) throw new RenewalRefused('That campaign could not be found.')
  if (source.expiresAt > now) throw new RenewalRefused('Wait for the original expiry, then reclaim unused funds before renewing. To resend a live link, use its saved CSV; no new funding is needed.')
  if (source.status !== 'RECLAIMED') throw new RenewalRefused('Reclaim all unused funds and wait for ledger confirmation before renewing.')
  if (source.variableAmounts) throw new RenewalRefused('Renewal currently supports equal-amount links. Reclaimed variable amounts remain in your wallet; create a separately reviewed distribution for them.')
  const funded = source.links.filter((l) => l.balanceId !== null)
  if (funded.some((l) => !['CLAIMED', 'RECLAIMED'].includes(l.status))) throw new RenewalRefused('The original round still has unsettled links. Reconcile it before renewing.')
  const returned = funded.filter((l) => l.status === 'RECLAIMED')
  if (!returned.length) throw new RenewalRefused('No unused funds were returned to renew.')
  const budget = returned.reduce((sum, l) => sum.plus(l.amount.toString()), new Decimal(0))
  // Each returned link must belong to the confirmed refund receipt, with matching accounting.
  const receipts = new Map(source.reclaims.map((r) => [r.transactionHash, r]))
  if (returned.some((l) => l.claimedBy !== source.senderPublicKey || !l.claimTxHash || !receipts.has(l.claimTxHash))) throw new RenewalRefused('The refund receipts are incomplete. Reconcile the original campaign before renewing.')
  for (const receipt of receipts.values()) {
    const links = returned.filter((l) => l.claimTxHash === receipt.transactionHash)
    const sum = links.reduce((total, l) => total.plus(l.amount.toString()), new Decimal(0))
    if (links.length !== receipt.balanceCount || !sum.equals(receipt.amount.toString())) throw new RenewalRefused('Refund accounting does not match the original links. Reconcile before renewing.')
  }
  if (!budget.equals(new Decimal(source.amountPerLink.toString()).times(returned.length))) throw new RenewalRefused('The returned amounts differ from the campaign terms. Reconcile before renewing.')
  const balances = await readBalances(source.senderPublicKey)
  if (funded.some((l) => balances.has(l.balanceId!))) throw new RenewalRefused('The ledger still holds original balances. Wait for the reclaim to settle before renewing.')
  return { source, count: returned.length, budget: budget.toFixed() }
}

export function assertRenewalTerms(
  input: { network: string; senderPublicKey: string; assetCode: string; assetIssuer?: string; amountPerLink: string; linkCount: number },
  value: Awaited<ReturnType<typeof renewalSource>>,
) {
  const { source, count, budget } = value
  if (input.network !== source.network || input.senderPublicKey !== source.senderPublicKey || input.assetCode !== source.assetCode || (input.assetIssuer ?? null) !== source.assetIssuer || input.linkCount !== count || !new Decimal(input.amountPerLink).equals(source.amountPerLink.toString()) || !new Decimal(input.amountPerLink).times(input.linkCount).equals(budget)) {
    throw new RenewalRefused('Renewal must use the original sender, network, asset and exactly the returned link budget.')
  }
}
