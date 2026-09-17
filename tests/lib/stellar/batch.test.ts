/**
 * Batch construction and envelope verification. SPEC.md §3.2, AGENT.md §7.1.
 *
 * No network. The one thing that genuinely cannot be checked without a ledger —
 * that a locally derived balance ID is the ID Stellar assigns — is checked
 * against a committed fixture captured from a real testnet transaction
 * (scripts/make-balance-id-fixture.ts).
 */
import { describe, expect, it } from 'vitest'
import { Account, Asset, Claimant, Keypair, Networks, TransactionBuilder, Transaction } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import {
  balanceIdsFromResultXdr,
  balanceIdsOf,
  batchCount,
  batchFee,
  buildBatchTransaction,
  chunkLinks,
  claimantsFor,
  planBatches,
  totalReserve,
  verifyBatchTransaction,
  type BatchLink,
} from '@/lib/stellar/batch'
import { reservePerLink } from '@/lib/stellar/horizon'
import fixture from '../../fixtures/balance-id.json'

const SIZE = 90
const PASSPHRASE = Networks.TESTNET
const EXPIRES = new Date('2027-01-01T00:00:00.000Z')

function links(n: number, seed = 'L'): BatchLink[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${seed}${i}`,
    ephemeralPublicKey: Keypair.random().publicKey(),
  }))
}

describe('batching', () => {
  it('splits 200 links into exactly 3 batches', () => {
    expect(batchCount(200, SIZE)).toBe(3)
    expect(chunkLinks(links(200), SIZE).map((b) => b.length)).toEqual([90, 90, 20])
  })

  // The boundary AGENT.md §7.1 names. 90 must not spill into a second batch,
  // and 91 must, or a campaign either exceeds the op ceiling or signs an empty
  // transaction.
  it('keeps 90 links in one batch and 91 in two', () => {
    expect(batchCount(90, SIZE)).toBe(1)
    expect(chunkLinks(links(90), SIZE).map((b) => b.length)).toEqual([90])

    expect(batchCount(91, SIZE)).toBe(2)
    expect(chunkLinks(links(91), SIZE).map((b) => b.length)).toEqual([90, 1])
  })

  it('never exceeds the protocol operation ceiling at the configured size', () => {
    for (const count of [1, 89, 90, 91, 180, 181, 1000]) {
      expect(chunkLinks(links(count), SIZE).every((b) => b.length <= 100)).toBe(true)
    }
  })

  it('numbers batches from 1 and preserves link order', () => {
    const all = links(91)
    const plan = planBatches(all, SIZE)
    expect(plan.map((p) => p.sequence)).toEqual([1, 2])
    expect(plan.flatMap((p) => p.links.map((l) => l.id))).toEqual(all.map((l) => l.id))
  })

  it('rejects a batch size below 1 rather than looping forever', () => {
    expect(() => chunkLinks(links(3), 0)).toThrow()
    expect(() => batchCount(3, 0)).toThrow()
  })
})

describe('claimants', () => {
  const ephemeral = Keypair.random().publicKey()
  const sender = Keypair.random().publicKey()

  it('gives the recipient before expiry and the sender after', () => {
    const [recipient, reclaimer] = claimantsFor(ephemeral, sender, EXPIRES)

    expect(recipient!.destination).toBe(ephemeral)
    expect(reclaimer!.destination).toBe(sender)

    // Mutually exclusive: the sender's predicate is exactly NOT the recipient's.
    const unix = String(Math.floor(EXPIRES.getTime() / 1000))
    const before = Claimant.predicateBeforeAbsoluteTime(unix)
    expect(recipient!.predicate.toXDR('base64')).toBe(before.toXDR('base64'))
    expect(reclaimer!.predicate.toXDR('base64')).toBe(Claimant.predicateNot(before).toXDR('base64'))
  })

  it('uses whole seconds, since absolute-time predicates are unix seconds', () => {
    const withMillis = new Date('2027-01-01T00:00:00.777Z')
    const [recipient] = claimantsFor(ephemeral, sender, withMillis)
    const truncated = Claimant.predicateBeforeAbsoluteTime('1798761600')
    expect(recipient!.predicate.toXDR('base64')).toBe(truncated.toXDR('base64'))
  })
})

describe('reserve arithmetic', () => {
  // SPEC.md §3.2: read from the protocol, never hardcoded. The function takes
  // the live value; these assert the arithmetic on top of it.
  it('charges one base reserve for the entry plus one per claimant', () => {
    expect(reservePerLink(new Decimal('0.5'), 2).toString()).toBe('1.5')
    expect(reservePerLink(new Decimal('1'), 2).toString()).toBe('3')
  })

  it('tracks a base reserve that is not 0.5', () => {
    // The reason it is read at runtime: this is the day it changes.
    expect(totalReserve(reservePerLink(new Decimal('0.75'), 2), 100).toString()).toBe('225')
  })

  it('stays exact where floating point would not', () => {
    const perLink = reservePerLink(new Decimal('0.1'), 2)
    expect(totalReserve(perLink, 3).toString()).toBe('0.9')
    expect(0.1 * 3 * 3).not.toBe(0.9) // the bug AGENT.md §4.1 forbids
  })

  it('converts stroop fees to XLM without float error', () => {
    expect(batchFee('1000', 90).toString()).toBe('0.009')
  })
})

describe('buildBatchTransaction', () => {
  const sender = Keypair.random()
  const account = () => new Account(sender.publicKey(), '100')

  function build(count: number, amount = '2.5000000') {
    const batch = links(count)
    const built = buildBatchTransaction({
      senderAccount: account(),
      senderPublicKey: sender.publicKey(),
      asset: Asset.native(),
      amountPerLink: amount,
      expiresAt: EXPIRES,
      links: batch,
      networkPassphrase: PASSPHRASE,
      baseFee: '1000',
      timeoutSeconds: 300,
    })
    return { batch, built }
  }

  it('emits one createClaimableBalance per link', () => {
    const { built } = build(90)
    const tx = TransactionBuilder.fromXDR(built.xdr, PASSPHRASE) as Transaction
    expect(tx.operations).toHaveLength(90)
    expect(tx.operations.every((op) => op.type === 'createClaimableBalance')).toBe(true)
  })

  it('returns a balance ID per link, all distinct', () => {
    const { batch, built } = build(90)
    expect(built.balanceIds.map((b) => b.linkId)).toEqual(batch.map((l) => l.id))
    expect(new Set(built.balanceIds.map((b) => b.balanceId)).size).toBe(90)
  })

  it('refuses to build an empty batch', () => {
    expect(() => build(0)).toThrow()
  })

  it('carries no signature — the sender signs in their own wallet', () => {
    const { built } = build(3)
    const tx = TransactionBuilder.fromXDR(built.xdr, PASSPHRASE) as Transaction
    expect(tx.signatures).toHaveLength(0)
  })
})

describe('balance ID derivation', () => {
  /*
   * The fixture is a real testnet transaction whose balance IDs were read back
   * from Horizon. Deriving them again here and getting the same values is the
   * only assertion that distinguishes "correct" from "self-consistent".
   */
  const tx = TransactionBuilder.fromXDR(fixture.signedXdr, Networks.TESTNET) as Transaction

  it('matches the IDs the ledger assigned', () => {
    const derived = balanceIdsOf(
      tx,
      fixture.ephemeralPublicKeys.map((key, i) => ({ id: `link-${i}`, ephemeralPublicKey: key })),
    )
    expect(derived.map((d) => d.balanceId)).toEqual(fixture.balanceIds)
  })

  it('matches the IDs carried in the transaction result XDR', () => {
    expect(balanceIdsFromResultXdr(fixture.resultXdr)).toEqual(fixture.balanceIds)
  })

  it('produces well-formed claimable balance IDs', () => {
    for (const id of fixture.balanceIds) expect(id).toMatch(/^00000000[0-9a-f]{64}$/)
  })
})

describe('verifyBatchTransaction', () => {
  const sender = Keypair.random()
  const attacker = Keypair.random()
  const batch = links(3)

  const expected = {
    senderPublicKey: sender.publicKey(),
    asset: Asset.native(),
    amountPerLink: '2.5000000',
    expiresAt: EXPIRES,
    links: batch,
    networkPassphrase: PASSPHRASE,
    baseFee: '1000',
  }

  function signed(overrides: Partial<typeof expected> = {}, signWith = sender) {
    const merged = { ...expected, ...overrides }
    const { xdr } = buildBatchTransaction({
      senderAccount: new Account(merged.senderPublicKey, '100'),
      senderPublicKey: merged.senderPublicKey,
      asset: merged.asset,
      amountPerLink: merged.amountPerLink,
      expiresAt: merged.expiresAt,
      links: merged.links,
      networkPassphrase: merged.networkPassphrase,
      baseFee: merged.baseFee,
      timeoutSeconds: 300,
    })
    const tx = TransactionBuilder.fromXDR(xdr, merged.networkPassphrase) as Transaction
    tx.sign(signWith)
    return tx.toXDR()
  }

  it('accepts the envelope it prepared', () => {
    expect(verifyBatchTransaction(signed(), expected)).toMatchObject({ ok: true })
  })

  it('accepts an equal amount written with different precision', () => {
    expect(verifyBatchTransaction(signed({ amountPerLink: '2.5' }), expected)).toMatchObject({ ok: true })
  })

  it('rejects an unsigned envelope', () => {
    const { xdr } = buildBatchTransaction({
      senderAccount: new Account(sender.publicKey(), '100'),
      senderPublicKey: sender.publicKey(),
      asset: Asset.native(),
      amountPerLink: '2.5000000',
      expiresAt: EXPIRES,
      links: batch,
      networkPassphrase: PASSPHRASE,
      baseFee: '1000',
      timeoutSeconds: 300,
    })
    expect(verifyBatchTransaction(xdr, expected)).toMatchObject({
      ok: false,
      reason: 'not-signed-by-sender',
    })
  })

  it('rejects a different source account', () => {
    const swapped = signed({ senderPublicKey: attacker.publicKey() }, attacker)
    expect(verifyBatchTransaction(swapped, expected)).toMatchObject({ ok: false, reason: 'wrong-source' })
  })

  it('rejects a different number of operations', () => {
    expect(verifyBatchTransaction(signed({ links: links(2) }), expected)).toMatchObject({
      ok: false,
      reason: 'wrong-operation-count',
    })
  })

  it('rejects a different asset', () => {
    const other = new Asset('USDC', attacker.publicKey())
    expect(verifyBatchTransaction(signed({ asset: other }), expected)).toMatchObject({
      ok: false,
      reason: 'wrong-asset',
    })
  })

  it('rejects a different amount', () => {
    expect(verifyBatchTransaction(signed({ amountPerLink: '9.0000000' }), expected)).toMatchObject({
      ok: false,
      reason: 'wrong-amount',
    })
  })

  /*
   * Per-link amounts (#73). The verifier compares each operation against THAT
   * link's row, so a batch where every link pays something different is
   * accepted as prepared — and one altered operation in an otherwise valid
   * batch is refused. The planted case is acceptance criterion 2.
   */
  describe('with per-link amounts', () => {
    const varied = batch.map((link, i) => ({ ...link, amount: `${i + 1}.2500000` }))
    const variedExpected = { ...expected, links: varied }

    it('accepts a batch whose links each carry their own amount', () => {
      expect(verifyBatchTransaction(signed({ links: varied }), variedExpected)).toMatchObject({ ok: true })
    })

    it('writes each link its own amount, in position', () => {
      const tx = TransactionBuilder.fromXDR(signed({ links: varied }), PASSPHRASE) as Transaction
      const amounts = tx.operations.map((op) => (op as { amount: string }).amount)
      expect(amounts.map((a) => new Decimal(a).toFixed())).toEqual(['1.25', '2.25', '3.25'])
    })

    it('rejects a batch with ONE altered operation among valid ones', () => {
      const planted = varied.map((link, i) => (i === 1 ? { ...link, amount: '99.0000000' } : link))
      expect(verifyBatchTransaction(signed({ links: planted }), variedExpected)).toMatchObject({
        ok: false,
        reason: 'wrong-amount',
      })
    })

    it('rejects the campaign default where the row says otherwise', () => {
      // Every op carries amountPerLink; the rows say something else. The
      // uniform figure is not a fallback the verifier accepts on a varied row.
      expect(verifyBatchTransaction(signed({ links: batch }), variedExpected)).toMatchObject({
        ok: false,
        reason: 'wrong-amount',
      })
    })

    it('rejects two links swapping amounts, since the totals would still match', () => {
      const swapped = [{ ...varied[0]!, amount: varied[1]!.amount }, { ...varied[1]!, amount: varied[0]!.amount }, varied[2]!]
      expect(verifyBatchTransaction(signed({ links: swapped }), variedExpected)).toMatchObject({
        ok: false,
        reason: 'wrong-amount',
      })
    })
  })

  // The one that costs money: same shape, but the balances become claimable by
  // someone the campaign never registered.
  it('rejects substituted claimant destinations', () => {
    const substituted = signed({ links: batch.map((l) => ({ ...l, ephemeralPublicKey: attacker.publicKey() })) })
    expect(verifyBatchTransaction(substituted, expected)).toMatchObject({
      ok: false,
      reason: 'wrong-claimants',
    })
  })

  it('rejects a shifted expiry, which would move the reclaim window', () => {
    const later = signed({ expiresAt: new Date('2030-01-01T00:00:00.000Z') })
    expect(verifyBatchTransaction(later, expected)).toMatchObject({
      ok: false,
      reason: 'wrong-claimants',
    })
  })

  /*
   * An envelope carries no network id, so the only thing that separates a
   * testnet transaction from an identical public-network one is what the
   * signature was computed over. A passphrase field comparison passes this
   * case; signature verification is what fails it.
   */
  it('rejects an envelope signed for another network', () => {
    const wrongNetwork = signed({ networkPassphrase: Networks.PUBLIC })
    expect(verifyBatchTransaction(wrongNetwork, expected)).toMatchObject({
      ok: false,
      reason: 'not-signed-by-sender',
    })
  })

  it('rejects an envelope signed by someone other than the sender', () => {
    const merged = { ...expected }
    const { xdr } = buildBatchTransaction({
      senderAccount: new Account(merged.senderPublicKey, '100'),
      senderPublicKey: merged.senderPublicKey,
      asset: merged.asset,
      amountPerLink: merged.amountPerLink,
      expiresAt: merged.expiresAt,
      links: merged.links,
      networkPassphrase: PASSPHRASE,
      baseFee: '1000',
      timeoutSeconds: 300,
    })
    const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE) as Transaction
    tx.sign(attacker)
    expect(verifyBatchTransaction(tx.toXDR(), expected)).toMatchObject({
      ok: false,
      reason: 'not-signed-by-sender',
    })
  })

  /*
   * The fee is the sender's own money and they signed for it, so this is not a
   * Kleym-integrity check — it is the "compromised wallet returns a
   * correctly-shaped batch" case the rest of this function exists for.
   */
  it('accepts a fee raised within the surge-pricing allowance', () => {
    expect(verifyBatchTransaction(signed({ baseFee: '9000' }), expected)).toMatchObject({ ok: true })
  })

  it('rejects a fee raised far beyond what was prepared', () => {
    expect(verifyBatchTransaction(signed({ baseFee: '2000000' }), expected)).toMatchObject({
      ok: false,
      reason: 'wrong-fee',
    })
  })

  it('rejects garbage without throwing', () => {
    expect(verifyBatchTransaction('not-xdr', expected)).toMatchObject({ ok: false, reason: 'unparseable' })
  })
})
