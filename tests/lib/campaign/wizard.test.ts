/**
 * Campaign wizard: keygen, CSV, label refusal, cost. SPEC.md §5.3, AGENT.md §1, §4.1.
 */
import { describe, expect, it } from 'vitest'
import { Keypair, StrKey } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { generateEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { buildCsv, claimUrl, csvFilename, parseLabels } from '@/lib/campaign/csv'
import { affordability, computeCost } from '@/lib/campaign/cost'

describe('keygen', () => {
  it('produces valid, distinct keypairs', () => {
    const keys = generateEphemeralKeys(50)
    expect(keys).toHaveLength(50)
    expect(new Set(keys.map((k) => k.publicKey)).size).toBe(50)
    expect(new Set(keys.map((k) => k.secret)).size).toBe(50)
    for (const key of keys) {
      expect(StrKey.isValidEd25519PublicKey(key.publicKey)).toBe(true)
      expect(StrKey.isValidEd25519SecretSeed(key.secret)).toBe(true)
      // The public half must actually belong to the secret, or the CSV hands
      // the recipient a key that cannot claim the balance registered for them.
      expect(Keypair.fromSecret(key.secret).publicKey()).toBe(key.publicKey)
    }
  })

  it('aligns labels by index and pads with null', () => {
    const keys = generateEphemeralKeys(3, ['alice', 'bob'])
    expect(keys.map((k) => k.label)).toEqual(['alice', 'bob', null])
  })

  it('refuses a non-positive count rather than returning nothing', () => {
    expect(() => generateEphemeralKeys(0)).toThrow()
    expect(() => generateEphemeralKeys(-1)).toThrow()
    expect(() => generateEphemeralKeys(1.5)).toThrow()
  })

  // AGENT.md §1. This is the shape that goes to the server, and it must not be
  // possible to widen it by accident.
  it('publicHalves carries no secret', () => {
    const keys = generateEphemeralKeys(5)
    const halves = publicHalves(keys)
    const serialised = JSON.stringify(halves)
    for (const key of keys) expect(serialised).not.toContain(key.secret)
    expect(Object.keys(halves).sort()).toEqual(['labels', 'publicKeys'])
  })
})

describe('claim URL', () => {
  it('puts the secret in the fragment, never the path or query', () => {
    const secret = Keypair.random().secret()
    const url = new URL(claimUrl('https://kleym.app', secret))
    expect(url.hash).toBe(`#${secret}`)
    expect(url.search).toBe('')
    expect(url.pathname).toBe('/claim')
    // What the server would receive: everything before the '#'.
    expect(`${url.origin}${url.pathname}${url.search}`).not.toContain(secret)
  })

  it('does not double a trailing slash', () => {
    expect(claimUrl('https://kleym.app/', 'S123')).toBe('https://kleym.app/claim#S123')
  })
})

describe('CSV', () => {
  const rows = () => {
    const keys = generateEphemeralKeys(2, ['alice', 'bob'])
    return keys.map((key) => ({ key, url: claimUrl('https://kleym.app', key.secret) }))
  }

  it('has a header and one row per link', () => {
    const lines = buildCsv(rows()).trimEnd().split('\n')
    expect(lines[0]).toBe('label,public_key,secret,claim_url')
    expect(lines).toHaveLength(3)
  })

  /*
   * The column that shifts when quoting is wrong is the secret. A CSV the
   * sender cannot parse is a campaign whose funds are stranded until expiry.
   */
  it('quotes labels containing commas, quotes and newlines', () => {
    const keys = generateEphemeralKeys(1, ['Smith, "Bob"\nJr'])
    const csv = buildCsv([{ key: keys[0]!, url: 'https://kleym.app/claim#x' }])
    const row = csv.trimEnd().split('\n').slice(1).join('\n')
    expect(row.startsWith('"Smith, ""Bob""\nJr"')).toBe(true)
    // The seed must still be findable in its own column.
    expect(row).toContain(`"${keys[0]!.secret}"`)
  })

  it('ends with a newline so the last row is not dropped', () => {
    expect(buildCsv(rows()).endsWith('\n')).toBe(true)
  })

  it('names the file after the campaign', () => {
    expect(csvFilename('Q1 Airdrop!')).toBe('kleym-q1-airdrop-secrets.csv')
    expect(csvFilename('   ')).toBe('kleym-campaign-secrets.csv')
  })
})

describe('label parsing', () => {
  it('accepts plain labels', () => {
    expect(parseLabels('alice\nbob\ncarol', 10)).toEqual({ ok: true, labels: ['alice', 'bob', 'carol'] })
  })

  it('drops a header row', () => {
    expect(parseLabels('label\nalice\nbob', 10)).toEqual({ ok: true, labels: ['alice', 'bob'] })
  })

  // SPEC.md §5.3: labels only, never addresses. An address here means the
  // sender is about to publish recipient addresses into a file they will share.
  it('refuses a Stellar address', () => {
    const result = parseLabels(`alice\n${Keypair.random().publicKey()}`, 10)
    expect(result).toMatchObject({ ok: false, reason: 'address', line: 2 })
  })

  it('refuses a secret seed, and says which line', () => {
    const result = parseLabels(`alice\nbob\n${Keypair.random().secret()}`, 10)
    expect(result).toMatchObject({ ok: false, reason: 'seed', line: 3 })
  })

  // A pasted spreadsheet row routinely carries an address in a later column.
  it('reads only the first column', () => {
    const address = Keypair.random().publicKey()
    expect(parseLabels(`alice,${address}\nbob,${address}`, 10)).toEqual({
      ok: true,
      labels: ['alice', 'bob'],
    })
  })

  it('refuses an address that arrives quoted', () => {
    const result = parseLabels(`"${Keypair.random().publicKey()}"`, 10)
    expect(result).toMatchObject({ ok: false, reason: 'address' })
  })

  it('refuses more labels than there are links', () => {
    expect(parseLabels('a\nb\nc', 2)).toMatchObject({ ok: false, reason: 'too-many', found: 3, allowed: 2 })
  })

  it('refuses an empty list', () => {
    expect(parseLabels('   \n\n', 10)).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('cost', () => {
  const base = {
    amountPerLink: '2.5000000',
    linkCount: 200,
    reservePerLink: '1.5',
    maxOpsPerBatch: 90,
    baseFeeStroops: '1000',
  }

  it('totals amount, reserve and fee, and counts batches', () => {
    const cost = computeCost(base)
    expect(cost.totalAmount).toBe('500')
    expect(cost.totalReserve).toBe('300')
    expect(cost.totalFee).toBe('0.02')
    expect(cost.batches).toBe(3)
    // SPEC.md §10.4: 200 links is 3 batches and 3 signatures.
    expect(cost.signatures).toBe(3)
  })

  it('tracks a reserve that is not 1.5 — the figure is read at runtime', () => {
    expect(computeCost({ ...base, reservePerLink: '2.25' }).totalReserve).toBe('450')
  })

  // AGENT.md §4.1. This is the number the sender reads before signing.
  it('stays exact where a float would not', () => {
    const cost = computeCost({ ...base, amountPerLink: '0.1', linkCount: 3 })
    expect(cost.totalAmount).toBe('0.3')
    expect(0.1 * 3).not.toBe(0.3)
  })

  it('keeps seven decimal places at the protocol maximum', () => {
    const cost = computeCost({ ...base, amountPerLink: '922337203685.4775807', linkCount: 1 })
    expect(cost.totalAmount).toBe('922337203685.4775807')
    expect(new Decimal(cost.totalAmount).equals('922337203685.4775807')).toBe(true)
  })
})

describe('affordability', () => {
  const cost = computeCost({
    amountPerLink: '1',
    linkCount: 10,
    reservePerLink: '1.5',
    maxOpsPerBatch: 90,
    baseFeeStroops: '1000',
  })

  it('needs one XLM balance to cover amount, reserve and fee when native', () => {
    expect(affordability(cost, { assetBalance: null, xlmBalance: '25.002' }, true)).toEqual({
      asset: true,
      reserve: true,
    })
    expect(affordability(cost, { assetBalance: null, xlmBalance: '25.0009' }, true).reserve).toBe(false)
  })

  /*
   * The reserve is always XLM even when the asset is not. Reporting one total
   * would tell a sender holding plenty of USDC and no XLM that they can afford
   * a campaign they cannot.
   */
  it('checks two balances separately when the asset is not native', () => {
    expect(affordability(cost, { assetBalance: '10', xlmBalance: '0.5' }, false)).toEqual({
      asset: true,
      reserve: false,
    })
    expect(affordability(cost, { assetBalance: '9.9', xlmBalance: '100' }, false)).toEqual({
      asset: false,
      reserve: true,
    })
  })

  it('treats an unfunded account as unaffordable, not as zero-cost', () => {
    expect(affordability(cost, { assetBalance: null, xlmBalance: null }, true).reserve).toBe(false)
  })
})
