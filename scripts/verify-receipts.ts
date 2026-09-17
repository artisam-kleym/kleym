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
const { verifyBytes } = await import('../src/lib/api/audit-chain')

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
  const link = async (claimed: boolean) =>
    prisma.claimLink.create({
      data: {
        campaignId: campaign.id, ephemeralPublicKey: Keypair.random().publicKey(), amount: '1.0000000',
        status: claimed ? 'CLAIMED' : 'ACTIVE',
        ...(claimed ? { claimedBy: Keypair.random().publicKey(), claimedAt: new Date(), claimTxHash: randomUUID().replace(/-/g, '').repeat(2), claimMemoType: 'id', claimMemo: '42' } : {}),
      },
      select: { id: true },
    })
  return { organizationId, campaignId: campaign.id, claimedA: await link(true), claimedB: await link(true), active: await link(false) }
}

async function main(): Promise<void> {
  console.log('\n1. Issued once, at claim, and never for an unsettled link')
  const f = await fixture()
  const first = await issueReceipt(f.claimedA.id)
  const again = await issueReceipt(f.claimedA.id)
  check('a settled claim gets a receipt', first !== null)
  check('a second issue returns the same receipt, byte-identical', first !== null && again !== null && first.receiptId === again.receiptId && first.canonical === again.canonical && first.signature === again.signature)
  check('it verifies with the public key alone', first !== null && verifyReceipt(first.canonical, first.signature, first.publicKey))
  check('it records the memo beside the destination', first !== null && first.contents.claim.memoType === 'id' && first.contents.claim.memo === '42')
  check('an unsettled link gets none', (await issueReceipt(f.active.id)) === null)
  check('exactly one row per link', (await prisma.claimReceipt.count({ where: { linkId: f.claimedA.id } })) === 1)

  console.log('\n2. Organisation-scoped')
  const other = await fixture()
  check('the owning organisation can fetch it', (await receiptFor(f.organizationId, f.campaignId, f.claimedA.id)) !== null)
  check('another organisation cannot', (await receiptFor(other.organizationId, f.campaignId, f.claimedA.id)) === null)

  console.log('\n3. The campaign bundle: one per settled claim and no others')
  await issueReceipt(f.claimedB.id)
  const receipts = await receiptsFor({ organizationId: f.organizationId, campaignId: f.campaignId })
  check('two settled claims, two receipts', receipts.length === 2, `${receipts.length}`)
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
