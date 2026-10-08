/**
 * Signed claim receipts (#81), verified against a real database.
 *
 * Issued exactly once per settled claim (a second issue returns the first,
 * byte-identical), never for an unsettled link, organisation-scoped (another
 * organisation cannot fetch it), and the bundle for a campaign holds one
 * receipt per settled claim and no other. Each verifies with the public key.
 *
 *   pnpm verify:receipts   (needs Postgres)
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { issueReceipt, receiptFor, receiptsFor, buildReceiptBundle, verifyReceipt } = await import('../src/lib/api/receipts')
const { verifyBytes, canonicalJson, signBytes, signingPublicKey } = await import('../src/lib/api/audit-chain')

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

async function fixture() {
  const user = await prisma.user.create({ data: { username: `rcpt-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const organizationId = await personalOrg(prisma, user.id)
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, organizationId, name: 'verify-receipts', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM', amountPerLink: '1.0000000', linkCount: 3,
      expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'ACTIVE',
    },
    select: { id: true },
  })
  const link = async (claimed: boolean, over: { claimedBy?: string | null; reconciled?: boolean; missingTime?: boolean } = {}) => {
    const ephemeralPublicKey = Keypair.random().publicKey()
    // A row reconciliation settled names the claimable balance's claimant — the ephemeral account — as `claimedBy`.
    const claimedBy = over.reconciled ? ephemeralPublicKey : over.claimedBy === undefined ? Keypair.random().publicKey() : over.claimedBy
    return prisma.claimLink.create({
      data: {
        campaignId: campaign.id, ephemeralPublicKey, amount: '1.0000000',
        status: claimed ? 'CLAIMED' : 'ACTIVE',
        ...(claimed ? { claimedBy, claimedAt: new Date(), ledgerSettledAt: over.missingTime ? null : new Date('2026-10-01T12:00:00Z'), observedAt: new Date(), claimTxHash: randomUUID().replace(/-/g, '').repeat(2), claimMemoType: 'id', claimMemo: '42' } : {}),
      },
      select: { id: true },
    })
  }
  return {
    organizationId, campaignId: campaign.id,
    claimedA: await link(true), claimedB: await link(true), active: await link(false),
    unpaid: await link(true, { claimedBy: null }), reconciled: await link(true, { reconciled: true }),
    missingTime: await link(true, { missingTime: true }),
  }
}

async function main(): Promise<void> {
  console.log('\n1. Issued once, at claim, and never for an unsettled link')
  const f = await fixture()
  const first = await issueReceipt(f.claimedA.id)
  const again = await issueReceipt(f.claimedA.id)
  check('a settled claim gets a receipt', first !== null)
  check('v3 uses authoritative time despite delayed observation', first?.contents.version === 3 &&
    first.contents.claim.claimedAt === '2026-10-01T12:00:00.000Z' && first.contents.claim.timeSource === 'ledger')
  check('legacy application time alone cannot create a new receipt', await issueReceipt(f.missingTime.id) === null)
  // Historical bytes are generated from a safe public fixture, then stored
  // as v2. Fetching must return them unchanged, even without a reliable time.
  const legacyDoc = { ...first!.contents, version: 2, receiptId: `legacy_${f.missingTime.id}`,
    link: { id: f.missingTime.id }, claim: { ...first!.contents.claim } }
  delete legacyDoc.claim.timeSource
  const legacyCanonical = canonicalJson(legacyDoc)
  const legacySignature = signBytes(Buffer.from(legacyCanonical))
  await prisma.claimReceipt.create({ data: { id: legacyDoc.receiptId, linkId: f.missingTime.id,
    campaignId: f.campaignId, organizationId: f.organizationId, version: 2, claimedAt: new Date(),
    canonical: legacyCanonical, signature: legacySignature, publicKey: signingPublicKey() } })
  const historical = await issueReceipt(f.missingTime.id)
  check('stored v2 canonical/signature remain byte-identical and verifiable', historical?.canonical === legacyCanonical &&
    historical.signature === legacySignature && verifyReceipt(historical.canonical, historical.signature, historical.publicKey))
  // Remove only this owned compatibility fixture before the original bundle-count checks.
  await prisma.claimReceipt.delete({ where: { linkId: f.missingTime.id } })
  check('a second issue returns the same receipt, byte-identical', first !== null && again !== null && first.receiptId === again.receiptId && first.canonical === again.canonical && first.signature === again.signature)
  check('it verifies with the public key alone', first !== null && verifyReceipt(first.canonical, first.signature, first.publicKey))
  check('it records the memo beside the destination', first !== null && first.contents.claim.memoType === 'id' && first.contents.claim.memo === '42')
  check('an unsettled link gets none', (await issueReceipt(f.active.id)) === null)
  check('exactly one row per link', (await prisma.claimReceipt.count({ where: { linkId: f.claimedA.id } })) === 1)

  console.log('\n2. Organisation-scoped')
  const other = await fixture()
  check('the owning organisation can fetch it', (await receiptFor(f.organizationId, f.campaignId, f.claimedA.id)) !== null)
  check('another organisation cannot', (await receiptFor(other.organizationId, f.campaignId, f.claimedA.id)) === null)

  console.log('\n3. The campaign bundle: one per settled claim and no others — issuing what claim time missed')
  // claimedB was never issued: the bundle issues it first (F4), so every CLAIMED link the page counts is there.
  const receipts = await receiptsFor({ organizationId: f.organizationId, campaignId: f.campaignId })
  check('two settled claims, two receipts — the one claim time missed was issued by the bundle', receipts.length === 2, `${receipts.length}`)
  check('a CLAIMED link with no payee gets no receipt and does not break the bundle', receipts.every((r) => r.contents.link.id !== f.unpaid.id))
  check('a claim reconciliation settled (payee unknown) gets no receipt', (await issueReceipt(f.reconciled.id)) === null && receipts.every((r) => r.contents.link.id !== f.reconciled.id))
  check('the sender\'s label rides beside the receipt, unsigned', receipts.every((r) => 'sender' in r && !r.canonical.includes('"label"')))
  check('the active link is not among them', receipts.every((r) => r.contents.link.id !== f.active.id))
  const bundle = buildReceiptBundle(receipts, { organizationId: f.organizationId, organizationName: 'x', campaignId: f.campaignId }, 'json')
  check('the bundle verifies as a whole', verifyBytes(bundle.body, bundle.signature, bundle.publicKey))
  check('and every receipt inside verifies alone', receipts.every((r) => verifyReceipt(r.canonical, r.signature, r.publicKey)))
  const others = await receiptsFor({ organizationId: other.organizationId, campaignId: f.campaignId })
  check("another organisation's bundle for this campaign is empty", others.length === 0)

  await prisma.$disconnect()
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
