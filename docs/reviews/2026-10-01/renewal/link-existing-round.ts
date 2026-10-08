/** Narrow local history repair for the user's verified pre-renewal reissue. No ledger writes. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { prisma } from '../../../../src/lib/db/client'
import { recordAudit } from '../../../../src/lib/api/audit'
import { renewalSource } from '../../../../src/lib/api/renewal'

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/kleym_app_pilot')
const originalId = 'cmupcw5ey0004y8kjq7oryzzk'
const replacementId = 'cmupd9xde0008y8kjuywfibzl'
const original = await prisma.campaign.findUniqueOrThrow({ where: { id: originalId } })
const replacement = await prisma.campaign.findUniqueOrThrow({ where: { id: replacementId }, include: { batches: true, links: true } })
assert.equal(replacement.organizationId, original.organizationId)
assert.equal(replacement.name, `${original.name} (reissue)`)
assert.equal(replacement.network, 'testnet')
assert.equal(replacement.senderPublicKey, original.senderPublicKey)
assert.equal(replacement.assetCode, original.assetCode)
assert.equal(replacement.assetIssuer, original.assetIssuer)
assert(replacement.amountPerLink.equals(original.amountPerLink))
assert.equal(replacement.status, 'ACTIVE')
assert.equal(replacement.linkCount, 2)
assert.equal(replacement.links.length, 2)
assert.equal(replacement.batches.length, 1)
assert.equal(replacement.batches[0].status, 'CONFIRMED')
assert.equal(replacement.batches[0].transactionHash, '51f03667ca967988ae514af5f85cd5bf82cfd82f72be9db6535298c299519e3d')
assert(replacement.links.every((l) => l.amount.equals(1) && ['ACTIVE', 'CLAIMED'].includes(l.status)))
const value = await renewalSource(originalId, original.organizationId)
assert.equal(value.budget, '2')
assert.equal(value.count, 2)
assert(!value.source.renewal || value.source.renewal.id === replacementId)
assert(!replacement.renewalOfId || replacement.renewalOfId === originalId)
const response = await fetch(`https://horizon-testnet.stellar.org/transactions/${replacement.batches[0].transactionHash}`, { signal: AbortSignal.timeout(15000) })
assert(response.ok)
const record = await response.json()
assert.equal(record.successful, true)
const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
assert(transaction instanceof Transaction)
assert.equal(transaction.hash().toString('hex'), replacement.batches[0].transactionHash)
assert.equal(transaction.source, replacement.sponsorPublicKey)
for (const signer of [original.senderPublicKey, replacement.sponsorPublicKey!]) {
  const key = Keypair.fromPublicKey(signer)
  assert(transaction.signatures.some((s) => s.hint().equals(key.signatureHint()) && key.verify(transaction.hash(), s.signature())))
}
const creations = transaction.operations.flatMap((op, index) => op.type === 'createClaimableBalance' ? [{ op, index }] : [])
assert.equal(creations.length, 2)
for (const { op, index } of creations) {
  assert.equal(op.source, original.senderPublicKey)
  assert.equal(op.amount, '1.0000000')
  assert.equal(op.asset.getCode(), original.assetCode)
  assert.equal(op.asset.getIssuer(), original.assetIssuer)
  assert(replacement.links.some((l) => l.balanceId === transaction.getClaimableBalanceId(index)))
}
const apply = process.argv.includes('--apply')
try {
  if (apply && !replacement.renewalOfId) {
    const result = await prisma.campaign.updateMany({ where: { id: replacementId, organizationId: original.organizationId, renewalOfId: null }, data: { renewalOfId: originalId, renewalBudget: value.budget } })
    assert.equal(result.count, 1)
    await recordAudit({ userId: original.userId, organizationId: original.organizationId, action: 'campaign.link-existing-renewal', entityType: 'campaign', entityId: replacementId,
      metadata: { originalId, budget: value.budget, historicalFundingBeforeRefund: true, fundingHash: replacement.batches[0].transactionHash }, ip: null })
  }
  const proof = { checkedAt: new Date().toISOString(), applied: apply, originalId, replacementId, budget: value.budget,
    historicalFundingBeforeRefund: true, sourceSignaturesAndPrincipalVerified: true, linkedSuccessorPreventsAnotherRenewal: apply,
    changedFields: apply ? ['renewalOfId', 'renewalBudget', 'updatedAt'] : [], chainWrites: 0 }
  writeFileSync('docs/reviews/2026-10-01/renewal/existing-round.json', JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof))
} finally { await prisma.$disconnect() }
