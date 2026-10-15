import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { parseWalletRecipients, walletCsvTemplate, walletRecipientSnapshot, WALLET_CSV_HEADER } from '@/lib/campaign/wallet-recipients'
import { deriveEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { buildCsv, claimUrl } from '@/lib/campaign/csv'
import { generatePhrase } from '@/lib/campaign/derive'

const wallets = Array.from({ length: 5 }, () => Keypair.random().publicKey())
const row = (wallet: string, amount = '', label = '') => [label, '', '', '', '', '', '', amount, '', wallet].join(',')
const csv = (...rows: string[]) => [WALLET_CSV_HEADER, ...rows].join('\r\n')

describe('ordered wallet recipient CSV', () => {
  it('downloads the existing export column order with Wallet Address appended and empty rows', () => {
    const lines = walletCsvTemplate(5).trimEnd().split('\r\n')
    expect(lines[0]).toBe(WALLET_CSV_HEADER)
    expect(lines.slice(1)).toEqual(Array(5).fill(',,,,,,,,,'))
  })
  it('imports five populated rows in exact order, skipping only entirely empty rows', () => {
    const result = parseWalletRecipients('\uFEFF' + csv(',,,,,,,,,', ...wallets.map((wallet, i) => row(wallet, ['20', '15', '10', '5', ''][i], `Worker ${i + 1}`)), ',,,,,,,,,'), 5)
    expect(result.wallets).toEqual(wallets)
    expect(result.amounts).toEqual(['20', '15', '10', '5', null])
    expect(parseWalletRecipients(walletRecipientSnapshot(result), 5)).toEqual(result)
  })
  it('retains repeated wallets as distinct ordered prize rows', () => {
    const result = parseWalletRecipients(csv(row(wallets[0]!, '20'), row(wallets[0]!, '5')), 5)
    expect(result.wallets).toEqual([wallets[0], wallets[0]])
    expect(result.amounts).toEqual(['20', '5'])
  })
  it('supports quoted commas, multiline labels and escaped quotes', () => {
    const result = parseWalletRecipients(csv(row(wallets[0]!, '1', '"Worker, ""A""\nTeam"')), 5)
    expect(result.labels[0]).toContain('Worker,')
    expect(result.labels[0]).toContain('\nTeam')
  })
  it.each([
    [csv(row('G' + 'A'.repeat(55))), 'valid Stellar'],
    [csv(row('', '5', 'Missing wallet')), 'row 2'],
    [csv(row(wallets[0]!, '0')), 'positive amount'],
    [csv(row(wallets[0]!, '0.00000001')), 'positive amount'],
    [csv('"unterminated'), 'unclosed quote'],
    [csv(row(wallets[0]!) + ',extra'), 'number of columns'],
    ['label,Wallet Address,Wallet Address\na,b,c', 'one Wallet Address'],
    [walletCsvTemplate(), 'at least one'],
  ])('refuses invalid or incomplete input without silently assigning a default (%#)', (input, message) => {
    expect(() => parseWalletRecipients(input, 5)).toThrow(message)
  })
  it('rejects secrets exports and does not echo credential values', () => {
    const key = Keypair.random()
    const input = csv(['name', key.publicKey(), key.secret(), claimUrl('https://kleym.test', key.secret()), '', '', '', '', '', wallets[0]].join(','))
    let message = ''
    try { parseWalletRecipients(input, 5) } catch (error) { message = (error as Error).message }
    expect(message).toContain('not a secrets export')
    expect(message).not.toContain(key.secret())
  })
  it('rejects recovery phrases locally before any public snapshot can be sent', () => {
    expect(() => parseWalletRecipients(csv(row(wallets[0]!, '1', generatePhrase())), 5)).toThrow('recovery words')
  })
  it('rejects excess recipients and oversized input', () => {
    expect(() => parseWalletRecipients(csv(...wallets.map((w) => row(w))), 4)).toThrow('recipient limit')
    expect(() => parseWalletRecipients('a'.repeat(2_000_001), 5)).toThrow('2 MB')
  })
  it('keeps wallet, prize, derived key and exported link in the same position; only public registration terms leave the browser', () => {
    const phrase = generatePhrase()
    const keys = deriveEphemeralKeys(phrase, 7, 5, ['A', 'B', 'C', 'D', 'E'], [], ['20', '15', '10', '5', null], { recipientPublicKeys: wallets })
    const publicTerms = publicHalves(keys)
    expect(publicTerms.recipientPublicKeys).toEqual(wallets)
    expect(publicTerms.amounts).toEqual(['20', '15', '10', '5', null])
    expect(JSON.stringify(publicTerms)).not.toContain(phrase)
    for (const key of keys) expect(JSON.stringify(publicTerms)).not.toContain(key.secret)
    const exported = buildCsv(keys.map((key) => ({ key, url: claimUrl('https://kleym.test', key.secret) })))
    expect(exported.split('\n')[0]).toBe(WALLET_CSV_HEADER)
    expect(exported.split('\n').slice(1, 6).map((line) => line.split(',').at(-1))).toEqual(wallets.map((w) => `"${w}"`))
    expect(() => buildCsv([{ key: { ...keys[0]!, recipientPublicKey: '' }, url: '' }])).toThrow('assigned wallet')
  })
})
