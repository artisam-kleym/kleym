import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { updatePrizeAmount } from '@/lib/campaign/prize-amounts'
import { computeCost } from '@/lib/campaign/cost'
import { buildCsv, buildRecipientListCsv, hasPrizeAmountColumn, parseLabels, splitCsvLine } from '@/lib/campaign/csv'
import { generateEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { registerLinksSchema } from '@/lib/api/campaigns'
import { buildBatchTransaction, verifyBatchTransaction } from '@/lib/stellar/batch'

const cost = (amounts: (string | null)[], count = 5, fallback = '5') => computeCost({ amountPerLink: fallback, amounts, linkCount: count, reservePerLink: '1', maxOpsPerBatch: 90, baseFeeStroops: '1000', sponsored: true })
const prizes = () => ['20', '15', '10'].reduce((amounts, value, index) => updatePrizeAmount(amounts, index, value, 5), [] as (string | null)[])

describe('custom prize amounts with a campaign default', () => {
  it('pays 20, 15, 10 and then the default 5 to each remaining person', () => {
    expect(cost(prizes()).totalAmount).toBe('55')
    expect(cost(prizes(), 10).totalAmount).toBe('80')
    expect(cost(prizes(), 5, '7').totalAmount).toBe('59')
  })
  it('clearing one custom field restores its default without touching the others', () => {
    const amounts = prizes()
    expect(updatePrizeAmount(amounts, 0, '', 5)).toEqual([null, '15', '10'])
    expect(cost(updatePrizeAmount(amounts, 0, '', 5)).totalAmount).toBe('40')
    expect(amounts).toEqual(['20', '15', '10'])
  })
  it('pads intervening people with defaults and refuses out-of-range changes', () => {
    expect(updatePrizeAmount([], 3, '0.0000001', 5)).toEqual([null, null, null, '0.0000001'])
    expect(() => updatePrizeAmount([], 5, '20', 5)).toThrow('outside')
    expect(() => updatePrizeAmount([], -1, '20', 5)).toThrow('outside')
  })
  it('keeps invalid edits visible but prevents the review budget from accepting them', () => {
    for (const invalid of ['0', '-1', '1e3', '0.00000001', '922337203685.4775808']) {
      const edited = updatePrizeAmount(prizes(), 1, invalid, 5)
      expect(edited[1]).toBe(invalid)
      expect(() => cost(edited)).toThrow('positive amount')
    }
  })
  it('snapshots manual prizes and metadata in public CSV, including unlabeled default rows', () => {
    const csv = buildRecipientListCsv(5, ['Alice, first', 'Bob'], [{ reference: 'round "one"', category: 'Gold', note: null }], prizes())
    const parsed = parseLabels(csv, 5)
    expect(parsed).toMatchObject({ ok: true, labels: ['Alice, first', 'Bob', '', '', ''], amounts: ['20', '15', '10', null, null], attestations: [{ reference: 'round "one"', category: 'Gold', note: null }, null, null, null, null] })
    expect(buildRecipientListCsv(5, [], [], [])).toBe('')
    expect(hasPrizeAmountColumn(csv)).toBe(true)
    expect(hasPrizeAmountColumn('Alice\nBob')).toBe(false)
    expect(hasPrizeAmountColumn('label,amount\nAlice,\nBob,')).toBe(true)
  })
  it('keeps each override aligned through keys, export, registration and sponsor-paid funding', () => {
    const keys = generateEphemeralKeys(5, ['First', 'Second', 'Third'], [], prizes())
    const payload = publicHalves(keys)
    expect(payload.amounts).toEqual(['20', '15', '10', null, null])
    expect(registerLinksSchema.safeParse(payload).success).toBe(true)
    for (const key of keys) expect(JSON.stringify(payload)).not.toContain(key.secret)
    const csvRows = buildCsv(keys.map((key) => ({ key, url: 'https://example.test/claim' }))).trimEnd().split('\n').slice(1).map(splitCsvLine)
    expect(csvRows.map((row) => row[7])).toEqual(['20', '15', '10', '', ''])

    const sender = Keypair.random(), sponsor = Keypair.random()
    const expected = { senderPublicKey: sender.publicKey(), sponsorPublicKey: sponsor.publicKey(), asset: new Asset('USDC', Keypair.random().publicKey()),
      amountPerLink: '5', expiresAt: new Date('2027-01-01'), networkPassphrase: Networks.TESTNET, baseFee: '1000',
      links: keys.map((key, index) => ({ id: `prize-${index}`, ephemeralPublicKey: key.publicKey, amount: key.amount ?? '5' })) }
    const built = buildBatchTransaction({ ...expected, senderAccount: new Account(sender.publicKey(), '1'), sponsorAccount: new Account(sponsor.publicKey(), '1'), timeoutSeconds: 600 })
    const tx = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET) as Transaction
    const operations = tx.operations.filter((op) => op.type === 'createClaimableBalance')
    expect(operations.map((op) => op.amount)).toEqual(['20.0000000', '15.0000000', '10.0000000', '5.0000000', '5.0000000'])
    expect(operations.map((op) => op.claimants[0]!.destination)).toEqual(payload.publicKeys)
    tx.sign(sender)
    expect(verifyBatchTransaction(tx.toXDR(), expected).ok).toBe(true)
    expect(verifyBatchTransaction(tx.toXDR(), { ...expected, links: expected.links.map((link, index) => index === 1 ? { ...link, amount: '14' } : link) })).toMatchObject({ ok: false, reason: 'wrong-amount' })
  })
})
