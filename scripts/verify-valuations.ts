/**
 * Accounting valuations (#80), verified against a real database.
 *
 * A settled claim gets exactly one valuation at its own claim time; a
 * replayed settle changes nothing; a reclaim gets a reversal at its own
 * time; an unpriced row is filled in by the pass and never touched again;
 * the export is organisation-scoped and byte-identical across runs; the sum
 * of claim lines equals the sum of the links' amounts.
 *
 *   pnpm verify:valuations   (needs Postgres)
 */
import { randomUUID } from 'node:crypto'
import { Asset, Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { recordClaimValuation, recordReclaimValuation, revalueUnpriced, valuationRows, journalLines, buildAccountingExport } = await import('../src/lib/api/valuations')
type RateSource = import('../src/lib/stellar/rates').RateSource

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

/** A rate source that answers what it is told, per asset code. */
const rates = (table: Record<string, string | null>): RateSource => ({
  rateAt: async (asset: Asset) => {
    const rate = table[asset.isNative() ? 'XLM' : asset.getCode()] ?? null
    return { rate, source: rate === null ? 'unavailable' : 'test', window: rate === null ? null : '1h' }
  },
})

async function fixture() {
  const user = await prisma.user.create({ data: { username: `val-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const organizationId = await personalOrg(prisma, user.id)
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, organizationId, name: 'verify-valuations', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM', amountPerLink: '1.0000000', linkCount: 3,
      expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'ACTIVE',
    },
    select: { id: true },
  })
  const link = (amount: string, at: Date) =>
    prisma.claimLink.create({
      data: {
        campaignId: campaign.id, ephemeralPublicKey: Keypair.random().publicKey(), amount, status: 'CLAIMED',
        claimedBy: Keypair.random().publicKey(), claimedAt: at, claimTxHash: randomUUID().replace(/-/g, '').repeat(2),
      },
      select: { id: true },
    })
  return { organizationId, campaignId: campaign.id, a: await link('1.5', new Date('2026-09-01T10:00:00Z')), b: await link('2.5', new Date('2026-09-14T10:00:00Z')) }
}

async function main(): Promise<void> {
  console.log('\n1. One valuation per settled claim, at its own date; a replay changes nothing')
  const f = await fixture()
  await recordClaimValuation(f.a.id, '100', rates({ XLM: '0.2' }))
  await recordClaimValuation(f.a.id, '100', rates({ XLM: '0.9' }))
  const va = await prisma.valuation.findUnique({ where: { linkId: f.a.id } })
  check('a valuation exists for the claim', va !== null)
  check('valued at the claim time, not now', va?.valuedAt.toISOString() === '2026-09-01T10:00:00.000Z')
  check('the first rate stands; the replay did not overwrite it', va?.rate?.toFixed() === '0.2', va?.rate?.toFixed())
  check('the fee is recorded in XLM', va?.feeXlm.toFixed() === '0.00001')
  check('exactly one row', (await prisma.valuation.count({ where: { linkId: f.a.id } })) === 1)

  console.log('\n2. Unpriced at settle, filled by the pass, then never touched')
  await recordClaimValuation(f.b.id, '100', rates({ XLM: null }))
  check('an unpriced row is kept with the reason', (await prisma.valuation.findUnique({ where: { linkId: f.b.id } }))?.rateSource === 'unavailable')
  const pass = await revalueUnpriced(rates({ XLM: '0.25' }), 50)
  check('the pass prices it', pass.priced >= 1)
  await revalueUnpriced(rates({ XLM: '0.99' }), 50)
  check('a priced row is not repriced', (await prisma.valuation.findUnique({ where: { linkId: f.b.id } }))?.rate?.toFixed() === '0.25')

  console.log('\n3. A reclaim is a reversal at its own time')
  const reclaim = await prisma.reclaimBatch.create({ data: { campaignId: f.campaignId, transactionHash: randomUUID().replace(/-/g, '').repeat(2), balanceCount: 1, amount: '1.0000000' }, select: { id: true } })
  await recordReclaimValuation(reclaim.id, '100', rates({ XLM: '0.3' }))
  const rows = await valuationRows({ organizationId: f.organizationId, campaignId: f.campaignId })
  const lines = journalLines(rows)
  check('three movements, each with a fee line', lines.length === 6, `${lines.length}`)
  const reversal = lines.find((l) => l.kind === 'reclaim')
  check('the reclaim debits the asset and credits expense', reversal?.debitAccount === 'Digital assets (XLM)' && reversal?.creditAccount === 'Payouts expense')

  console.log('\n4. The export: scoped, byte-identical, and reconciling to the links')
  const query = { organizationId: f.organizationId, organizationName: 'x', currency: 'USD', campaignId: f.campaignId }
  const one = buildAccountingExport(lines, query, 'csv')
  const two = buildAccountingExport(journalLines(await valuationRows({ organizationId: f.organizationId, campaignId: f.campaignId })), query, 'csv')
  check('two runs are byte-identical', one.body.equals(two.body))
  const claimed = lines.filter((l) => l.kind === 'claim').reduce((s, l) => s.plus(l.assetAmount!), new Decimal(0))
  const links = await prisma.claimLink.aggregate({ where: { campaignId: f.campaignId, status: 'CLAIMED' }, _sum: { amount: true } })
  check('claim lines sum to the claimed links', claimed.equals(new Decimal(links._sum.amount!.toString())), `${claimed.toFixed()} vs ${links._sum.amount}`)
  const other = await fixture()
  check("another organisation's export holds none of these", (await valuationRows({ organizationId: other.organizationId })).every((r) => r.campaignId !== f.campaignId))

  await prisma.$disconnect()
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
