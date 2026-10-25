import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { EMAIL_CSV_HEADER, emailCsvTemplate, emailRecipientSnapshot, parseEmailRecipients } from '@/lib/campaign/email-recipients'
import { deriveEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { generatePhrase } from '@/lib/campaign/derive'
import { buildCsv, claimUrl } from '@/lib/campaign/csv'

const row = (email: string, amount = '', label = '') => [label, '', '', '', '', '', '', amount, '', email].join(',')
const csv = (...rows: string[]) => [EMAIL_CSV_HEADER, ...rows].join('\r\n')
describe('email verification recipient CSV', () => {
  it('adds Email Address after all existing export columns and keeps template rows blank', () => {
    expect(emailCsvTemplate(2)).toBe(EMAIL_CSV_HEADER + '\r\n,,,,,,,,,\r\n,,,,,,,,,\r\n')
  })
  it('preserves order, duplicate mailboxes, labels and variable amounts, and round trips the public snapshot', () => {
    const result = parseEmailRecipients('\uFEFF' + csv(',,,,,,,,,', row('First@example.com', '20', 'Winner'), row('second@example.com', '15'), row('first@example.com', '', 'Participant')), 3)
    expect(result.emails).toEqual(['first@example.com', 'second@example.com', 'first@example.com'])
    expect(result.amounts).toEqual(['20', '15', null])
    expect(parseEmailRecipients(emailRecipientSnapshot(result), 3)).toEqual(result)
  })
  it.each([
    [csv(row('not-an-email')), 'valid Email Address'],
    [csv(row('person@example.com', '0')), 'positive amount'],
    [csv(row('person@example.com', '0.00000001')), 'positive amount'],
    [csv('"unterminated'), 'unclosed quote'],
    [csv(row('person@example.com') + ',extra'), 'number of columns'],
    ['Email Address,Email Address\na,b', 'one Email Address'],
    [emailCsvTemplate(), 'at least one'],
  ])('refuses incomplete or malformed recipient input (%#)', (input, error) => {
    expect(() => parseEmailRecipients(input, 5)).toThrow(error)
  })
  it('refuses secrets, recovery words, oversized data and too many recipients before any upload', () => {
    const key = Keypair.random()
    expect(() => parseEmailRecipients(csv(['', '', key.secret(), '', '', '', '', '', '', 'person@example.com'].join(',')), 1)).toThrow('not a secrets export')
    expect(() => parseEmailRecipients(csv(row('person@example.com', '', generatePhrase())), 1)).toThrow('recovery words')
    expect(() => parseEmailRecipients('a'.repeat(2_000_001), 1)).toThrow('2 MB')
    expect(() => parseEmailRecipients(csv(row('a@example.com'), row('b@example.com')), 1)).toThrow('recipient limit')
  })
  it('keeps key, amount and email aligned in registration and the private export without uploading any seed', () => {
    const phrase = generatePhrase(), emails = ['a@example.com', 'b@example.com']
    const keys = deriveEphemeralKeys(phrase, 7, 2, ['A', 'B'], [], ['20', '15'], { recipientEmails: emails })
    const registration = publicHalves(keys)
    expect(registration.recipientEmails).toEqual(emails)
    expect(registration.amounts).toEqual(['20', '15'])
    for (const key of keys) expect(JSON.stringify(registration)).not.toContain(key.secret)
    expect(JSON.stringify(registration)).not.toContain(phrase)
    const exported = buildCsv(keys.map((key) => ({ key, url: claimUrl('https://kleym.test', key.secret) })))
    expect(exported.split('\n')[0]).toBe(EMAIL_CSV_HEADER)
    expect(exported.split('\n').slice(1, 3).map((line) => line.split(',').at(-1))).toEqual(emails.map((email) => `"${email}"`))
  })
})
