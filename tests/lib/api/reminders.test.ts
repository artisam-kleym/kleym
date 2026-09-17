import { describe, expect, it } from 'vitest'
import { duePoints, pointToSend } from '@/lib/api/reminders'
import { reminderEmail } from '@/lib/email/templates'

const DAY = 86_400_000
const EXPIRES = new Date('2026-10-01T00:00:00Z')
const at = (daysBefore: number) => new Date(EXPIRES.getTime() - daysBefore * DAY)

/*
 * #78. Which reminders fall due is a pure function of the schedule, the
 * expiry, what was already sent and the clock — tested as such.
 */
describe('duePoints', () => {
  it('is empty before the first point and grows as points pass', () => {
    expect(duePoints([7, 1], EXPIRES, [], at(10))).toEqual([])
    expect(duePoints([7, 1], EXPIRES, [], at(7))).toEqual([7])
    expect(duePoints([7, 1], EXPIRES, [], at(0.5))).toEqual([1, 7])
  })

  it('never repeats a point that was sent', () => {
    expect(duePoints([7, 1], EXPIRES, [7], at(3))).toEqual([])
    expect(duePoints([7, 1], EXPIRES, [7], at(0.5))).toEqual([1])
  })

  it('ignores nonsense points', () => {
    expect(duePoints([0, -1, 2.5, 3], EXPIRES, [], at(1))).toEqual([3])
  })

  it('sends ONE message when several points fell due at once — the closest to expiry', () => {
    expect(pointToSend(duePoints([14, 7, 1], EXPIRES, [], at(0.5)))).toBe(1)
    expect(pointToSend([])).toBeNull()
  })
})

/*
 * Acceptance criterion 3. A reminder has no URL to leak — Kleym does not hold
 * it — and this pins that the template never grows one by accident.
 */
describe('reminderEmail', () => {
  const message = reminderEmail({
    senderName: 'Acme Payroll',
    campaignName: 'Q3 bonus',
    amount: '250',
    assetCode: 'USDC',
    expiresAt: EXPIRES,
    sentAt: new Date('2026-09-01T10:00:00Z'),
  })

  it('names the sender, the amount and the expiry, and points at the original message', () => {
    expect(message.subject).toMatch(/Acme Payroll/)
    expect(message.text).toMatch(/250 USDC/)
    expect(message.text).toMatch(/2026-10-01/)
    expect(message.text).toMatch(/original/i)
    expect(message.text).toMatch(/2026-09-01/)
  })

  it('carries no link, no fragment and nothing seed-shaped', () => {
    for (const body of [message.text, message.html]) {
      expect(body).not.toMatch(/\/claim/)
      expect(body).not.toMatch(/#s=/)
      expect(body).not.toMatch(/S[A-Z2-7]{55}/)
      expect(body).not.toMatch(/https?:\/\//)
    }
  })
})
