import { afterEach, describe, expect, it } from 'vitest'
import { localExpiry, expiryDescription, expiryError, presetExpiry } from '@/lib/campaign/expiry'
const previous = process.env.TZ
afterEach(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous })
describe('local expiry input', () => {
  it('freezes presets as future instants with minute precision', () => {
    process.env.TZ = 'Asia/Manila'
    const now = Date.parse('2026-10-06T10:02:35Z')
    const deadline = presetExpiry('1h', now)
    expect(deadline).toBe('2026-10-06T19:03+08:00')
    expect(new Date(deadline).getTime() - now).toBe(3_625_000)
    expect(presetExpiry('24h', now)).toBe('2026-10-07T18:03+08:00')
    expect(presetExpiry('7d', now)).toBe('2026-10-13T18:03+08:00')
    expect(presetExpiry('30d', now)).toBe('2026-11-05T18:03+08:00')
  })
  it('rejects incomplete, impossible and expired local deadlines', () => {
    process.env.TZ = 'UTC'
    const now = Date.parse('2026-10-06T10:00:00Z')
    for (const value of ['', '2026-10-07T', '2026-02-30T12:00', '2026-13-01T12:00', '2026-10-06T10:00', '2026-10-05T12:00']) {
      expect(expiryError(value, now)).not.toBeNull()
    }
    expect(expiryError('2026-10-06T10:01', now)).toBeNull()
  })
  it('rejects a custom time skipped by daylight saving without shortening preset durations', () => {
    process.env.TZ = 'America/New_York'
    expect(expiryError('2027-03-14T02:30', Date.parse('2027-03-13T00:00Z'))).not.toBeNull()
    const now = Date.parse('2027-03-14T06:30:00Z')
    expect(new Date(presetExpiry('24h', now)).getTime() - now).toBe(86_400_000)
  })
  it('keeps the exact preset instant when daylight saving repeats a clock time', () => {
    process.env.TZ = 'America/New_York'
    const now = Date.parse('2026-11-01T05:30:00Z')
    const deadline = presetExpiry('1h', now)
    expect(new Date(deadline).toISOString()).toBe('2026-11-01T06:30:00.000Z')
    expect(expiryError(deadline, now)).toBeNull()
    process.env.TZ = 'UTC'
    expect(expiryError(deadline, now)).toBeNull()
  })
  it.each(['Asia/Manila', 'America/New_York', 'UTC'])('preserves the actual expiry instant in %s', (zone) => {
    process.env.TZ = zone
    const instant = new Date('2026-10-31T10:02:00.000Z')
    expect(new Date(localExpiry(instant)).toISOString()).toBe(instant.toISOString())
  })
  it('shows the timezone and UTC instant before funding', () => {
    process.env.TZ = 'Asia/Manila'
    expect(localExpiry(new Date('2026-10-01T10:07:00Z'))).toBe('2026-10-01T18:07')
    expect(expiryDescription('2026-10-01T18:07')).toContain('Asia/Manila')
    expect(expiryDescription('2026-10-01T18:07')).toContain('2026-10-01 10:07:00.000Z UTC')
  })
})
