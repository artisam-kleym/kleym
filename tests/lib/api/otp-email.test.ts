import { describe, expect, it } from 'vitest'
import { otpEmail } from '@/lib/email/templates'

describe('branded OTP email', () => {
  it('keeps the code contiguous and selectable, with a privacy-safe subject and plain-text fallback', () => {
    const email = otpEmail('012345')
    expect(email.subject).not.toContain('012345')
    expect(email.text).toContain('012345')
    expect(email.html).toMatch(/<code[^>]*>012345<\/code>/)
    expect(email.text).toContain('10 minutes after your request')
    expect(email.text).toContain('used once')
  })
  it('needs no external assets, links, scripts, forms or unsupported style blocks', () => {
    const { html } = otpEmail('012345')
    expect(html).not.toMatch(/<(?:img|svg|script|iframe|form|style)\b/i)
    expect(html).not.toMatch(/\b(?:src|href|onload|onclick)\s*=/i)
    expect(html).not.toContain('/claim')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('max-width:560px')
    expect(html).toContain('#354f6e')
    expect(html).toContain('#e2f5ec')
  })
  it.each(['12345', '1234567', '<12345', '12 345', 'abcdef', '123456\n'])('refuses malformed code %j before content is constructed', code => {
    expect(() => otpEmail(code)).toThrow('exactly six digits')
  })
})
