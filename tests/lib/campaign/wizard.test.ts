/**
 * Campaign wizard: keygen, CSV, label refusal, cost. SPEC.md §5.3, AGENT.md §1, §4.1.
 */
import { describe, expect, it } from 'vitest'
import { Keypair, StrKey } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { generateEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { buildCsv, claimUrl, csvFilename, parseLabels, splitCsvLine } from '@/lib/campaign/csv'
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
  // #79: a claim code beside each key when the policy asks for one, in the CSV and in the request.
  it('generates a 13-character claim code per key only when asked', () => {
    const plain = generateEphemeralKeys(3)
    expect(plain.every((k) => k.code === null)).toBe(true)
    expect(publicHalves(plain).codes).toBeUndefined()

    const coded = generateEphemeralKeys(50, [], [], [], { withCodes: true })
    for (const key of coded) expect(key.code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{13}$/)
    expect(new Set(coded.map((k) => k.code)).size).toBe(50)
    expect(publicHalves(coded).codes).toEqual(coded.map((k) => k.code))
    // The code is not a seed: the seed guard must not fire on it.
    expect(coded.some((k) => /^S[A-Z2-7]{55}$/.test(k.code!))).toBe(false)
  })

  it('writes the claim code as the last CSV column', () => {
    const keys = generateEphemeralKeys(1, ['a'], [], [], { withCodes: true })
    const row = buildCsv(keys.map((key) => ({ key, url: 'https://kleym.app/claim#x' }))).trimEnd().split('\n')[1]!
    expect(row.endsWith(`"${keys[0]!.code}"`)).toBe(true)
  })

  it('exports one matching code per labelled link without putting it in the URL', () => {
    const keys = generateEphemeralKeys(
      3,
      ['First', 'Second', 'Third'],
      [],
      ['20', '15', '5'],
      { withCodes: true },
    )
    const rows = keys.map((key) => ({
      key,
      url: claimUrl('https://example.test', key.secret),
    }))
    const lines = buildCsv(rows, { requireCodes: true })
      .trimEnd()
      .split('\n')
      .map(splitCsvLine)
    expect(lines[0]![8]).toBe('claim_code')
    expect(
      lines
        .slice(1)
        .every(
          (row, i) =>
            row[0] === keys[i]!.label &&
            row[7] === keys[i]!.amount &&
            row[8] === keys[i]!.code,
        ),
    ).toBe(true)
    expect(lines.slice(1).every((row) => !row[3]!.includes(row[8]!))).toBe(true)
  })

  it('refuses missing, malformed and duplicate codes without exposing credentials', () => {
    const keys = generateEphemeralKeys(2, [], [], [], { withCodes: true })
    const exportKeys =
      (changed: typeof keys, requireCodes = true) =>
      () =>
        buildCsv(
          changed.map((key) => ({ key, url: 'https://example.test/claim' })),
          { requireCodes },
        )
    expect(exportKeys(keys.map((key) => ({ ...key, code: null })))).toThrow(
      'Every code-protected link must have a valid claim code',
    )
    expect(exportKeys([keys[0]!, { ...keys[1]!, code: null }], false)).toThrow(
      'Every code-protected link must have a valid claim code',
    )
    expect(exportKeys([keys[0]!, { ...keys[1]!, code: 'bad-code' }])).toThrow(
      'Every code-protected link must have a valid claim code',
    )
    expect(
      exportKeys([keys[0]!, { ...keys[1]!, code: keys[0]!.code }]),
    ).toThrow('Each link must have its own claim code')
  })

  it('aligns amounts by index (#73) and publicHalves carries them only when set', () => {
    const keys = generateEphemeralKeys(3, [], [], ['1.5', null])
    expect(keys.map((k) => k.amount)).toEqual(['1.5', null, null])
    expect(publicHalves(keys).amounts).toEqual(['1.5', null, null])
    expect(publicHalves(generateEphemeralKeys(2)).amounts).toBeUndefined()
  })

  it('publicHalves carries no secret', () => {
    const keys = generateEphemeralKeys(5)
    const halves = publicHalves(keys)
    const serialised = JSON.stringify(halves)
    for (const key of keys) expect(serialised).not.toContain(key.secret)
    expect(Object.keys(halves).sort()).toEqual(['labels', 'publicKeys'])
  })
})

describe('claim URL', () => {
  /*
   * `#s=<seed>`, raw. See lib/claim/fragment.ts for why not base64url: the
   * encoded form is invisible to every seed guard in the repo.
   */
  it('puts the secret in the fragment, never the path or query', () => {
    const secret = Keypair.random().secret()
    const url = new URL(claimUrl('https://kleym.app', secret))
    expect(url.hash).toBe(`#s=${secret}`)
    expect(url.search).toBe('')
    expect(url.pathname).toBe('/claim')
    // What the server would receive: everything before the '#'.
    expect(`${url.origin}${url.pathname}${url.search}`).not.toContain(secret)
  })

  it('does not double a trailing slash', () => {
    expect(claimUrl('https://kleym.app/', 'S123')).toBe('https://kleym.app/claim#s=S123')
  })
})

describe('CSV', () => {
  const rows = () => {
    const keys = generateEphemeralKeys(2, ['alice', 'bob'])
    return keys.map((key) => ({ key, url: claimUrl('https://kleym.app', key.secret) }))
  }

  it('has a header and one row per link', () => {
    const lines = buildCsv(rows()).trimEnd().split('\n')
    expect(lines[0]).toBe('label,public_key,secret,claim_url,reference,category,note,amount,claim_code')
    expect(lines).toHaveLength(3)
  })

  // #52: the sender's reference data goes out with the file it came in with,
  // and reads back through the same parser — a round trip, not two formats.
  it('round-trips attestation fields through export and import', () => {
    const keys = generateEphemeralKeys(2, ['alice', 'bob'], [{ reference: 'PAY-1', category: 'payroll', note: 'Q3, "bonus"' }, null])
    const csv = buildCsv(keys.map((key) => ({ key, url: 'https://kleym.app/claim#x' })))
    const back = parseLabels(csv, 10)
    expect(back).toEqual({
      ok: true,
      labels: ['alice', 'bob'],
      attestations: [{ reference: 'PAY-1', category: 'payroll', note: 'Q3, "bonus"' }, null],
    })
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

  it('reads attestation columns only when the header names them', () => {
    expect(parseLabels('label,reference,category\nalice,REF-1,vendor\nbob,,', 10)).toEqual({
      ok: true,
      labels: ['alice', 'bob'],
      attestations: [{ reference: 'REF-1', category: 'vendor', note: null }, null],
    })
    // Unnamed later columns stay unread, exactly as before.
    expect(parseLabels('alice,REF-1\nbob,REF-2', 10)).toEqual({ ok: true, labels: ['alice', 'bob'] })
  })

  it('refuses key material in a named attestation column too', () => {
    expect(parseLabels(`label,note\nalice,${Keypair.random().publicKey()}`, 10)).toMatchObject({ ok: false, reason: 'address', line: 2 })
    expect(parseLabels(`label,reference\nalice,${Keypair.random().secret()}`, 10)).toMatchObject({ ok: false, reason: 'seed', line: 2 })
  })

  it('caps each attestation column', () => {
    expect(parseLabels(`label,category\nalice,${'x'.repeat(61)}`, 10)).toMatchObject({ ok: false, reason: 'too-long', line: 2, column: 'category', allowed: 60 })
  })

  it('refuses more labels than there are links', () => {
    expect(parseLabels('a\nb\nc', 2)).toMatchObject({ ok: false, reason: 'too-many', found: 3, allowed: 2 })
  })

  /*
   * Per-link amounts (#73). Read only when the header NAMES the column, like
   * attestations; a blank cell means "the campaign default"; and a malformed
   * or non-positive amount names its row rather than silently becoming the
   * default — that would pay someone the wrong figure without a word.
   */
  describe('amount column', () => {
    it('reads amounts only when the header names them, blank meaning the default', () => {
      expect(parseLabels('label,amount\nalice,12.5\nbob,\ncarol,0.0000001', 10)).toEqual({
        ok: true,
        labels: ['alice', 'bob', 'carol'],
        amounts: ['12.5', null, '0.0000001'],
      })
      // A second column with no header is not an amount; nothing is guessed.
      expect(parseLabels('alice,12.5\nbob,3', 10)).toEqual({ ok: true, labels: ['alice', 'bob'] })
    })

    it.each([
      ['a negative amount', '-1'],
      ['zero', '0'],
      ['eight decimal places', '0.00000001'],
      ['exponent notation', '1e3'],
      ['a word', 'twelve'],
      ['a thousands separator', '1,000'],
    ])('refuses %s, naming the row', (_label, value) => {
      expect(parseLabels(`label,amount\nalice,1\nbob,"${value}"`, 10)).toMatchObject({ ok: false, reason: 'amount', line: 3 })
    })

    it('still refuses key material in the amount column', () => {
      expect(parseLabels(`label,amount\nalice,${Keypair.random().secret()}`, 10)).toMatchObject({ ok: false, reason: 'seed', line: 2 })
    })

    it('carries amounts beside attestation columns', () => {
      expect(parseLabels('label,reference,amount\nalice,REF-1,7', 10)).toEqual({
        ok: true,
        labels: ['alice'],
        attestations: [{ reference: 'REF-1', category: null, note: null }],
        amounts: ['7'],
      })
    })
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

  // #73, acceptance criterion 5: the estimate is the SUM of per-link amounts.
  it('sums per-link amounts, with blanks taking the default', () => {
    const cost = computeCost({ ...base, amountPerLink: '1', linkCount: 4, amounts: ['0.1', null, '0.2', '10'] })
    expect(cost.totalAmount).toBe('11.3')
    // Reserve and fee are per operation and do not care what it carries.
    expect(cost.totalReserve).toBe('6')
    expect(cost.totalFee).toBe('0.0004')
  })

  it('pads a short amount list with the default and ignores a long one past the count', () => {
    expect(computeCost({ ...base, amountPerLink: '1', linkCount: 3, amounts: ['5'] }).totalAmount).toBe('7')
    expect(computeCost({ ...base, amountPerLink: '1', linkCount: 2, amounts: ['5', '5', '5'] }).totalAmount).toBe('10')
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
