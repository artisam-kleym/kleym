import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Keypair } from '@stellar/stellar-sdk'
import { boundedLinkArray, registerLinksSchema } from '@/lib/api/campaigns'
import { env } from '@/lib/config/env'

const address = Keypair.random().publicKey()
describe('registration collection caps before element validation (#136)', () => {
  it('does not invoke any item parser for an overlong collection', () => {
    const parseElement = vi.fn(() => true)
    const schema = boundedLinkArray(z.string().refine(parseElement))
    const result = schema.safeParse(Array(env.MAX_LINKS_PER_CAMPAIGN + 1).fill('value'))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toMatchObject([{ code: 'too_big', origin: 'array', maximum: env.MAX_LINKS_PER_CAMPAIGN }])
    expect(parseElement).not.toHaveBeenCalled()
  })
  it.each(['publicKeys', 'labels', 'attestations', 'amounts', 'codes', 'recipientPublicKeys'])('caps %s before validating invalid elements', (field) => {
    const result = registerLinksSchema.safeParse({ publicKeys: [address], [field]: Array(env.MAX_LINKS_PER_CAMPAIGN + 1).fill({ invalid: true }) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const problems = result.error.issues.filter((issue) => issue.path[0] === field)
      expect(problems).toContainEqual(expect.objectContaining({ code: 'too_big', maximum: env.MAX_LINKS_PER_CAMPAIGN }))
      expect(problems.every((issue) => issue.path.length === 1)).toBe(true)
    }
  })
  it('allows the configured boundary and rejects non-arrays safely', () => {
    expect(boundedLinkArray(z.string()).safeParse(Array(env.MAX_LINKS_PER_CAMPAIGN).fill('ok')).success).toBe(true)
    for (const value of [null, {}, 'not-an-array', 1]) expect(boundedLinkArray(z.string()).safeParse(value).success).toBe(false)
  })
})
