import { describe, expect, it } from 'vitest'
import { ENV_SCHEMA_KEYS, SECRET_ENV_KEYS } from '@/lib/config/env'
import { assertSecretClassification, unclassifiedSecretKeys } from '@/lib/config/secret-classification'
import { createLogger } from '@/lib/config/logger'
import { verifyBytes } from '@/lib/api/audit-chain'

describe('environment classification and emitted log redaction (#109)', () => {
  it('classifies every actual schema key without loading runtime secrets', () => {
    expect(ENV_SCHEMA_KEYS).toContain('AUDIT_SIGNING_SEED')
    expect(unclassifiedSecretKeys(ENV_SCHEMA_KEYS, SECRET_ENV_KEYS)).toEqual([])
  })

  it('rejects an intentionally unclassified future seed fixture', () => {
    expect(() => assertSecretClassification([...ENV_SCHEMA_KEYS, 'FUTURE_SIGNING_SEED'], SECRET_ENV_KEYS))
      .toThrow('Unclassified secret-shaped environment keys: FUTURE_SIGNING_SEED')
    expect(unclassifiedSecretKeys([...ENV_SCHEMA_KEYS, 'FUTURE_SIGNING_SEED'], SECRET_ENV_KEYS))
      .toEqual(['FUTURE_SIGNING_SEED'])
  })

  it('requires explicit classification for other future credential names', () => {
    expect(unclassifiedSecretKeys(['PROVIDER_TOKEN', 'API_KEY', 'SERVICE_SECRET', 'DB_URL', 'ADMIN_PASSWORD'], []))
      .toHaveLength(5)
  })

  it('redacts planted root and nested values in actual Pino JSON output', () => {
    let output = ''
    const log = createLogger({ write: (chunk: string) => { output += chunk } })
    const planted = Object.fromEntries(SECRET_ENV_KEYS.map((key) => [key, `planted-fixture-${key}`]))
    log.info({ ...planted, nested: planted, publicId: 'campaign-public-fixture', walletConnectProjectId: 'public-project-fixture' }, 'safe fixture')
    const emitted = JSON.parse(output)
    for (const key of SECRET_ENV_KEYS) {
      expect(emitted[key]).toBe('[redacted]')
      expect(emitted.nested[key]).toBe('[redacted]')
      expect(output).not.toContain(planted[key])
    }
    expect(emitted.publicId).toBe('campaign-public-fixture')
    expect(emitted.walletConnectProjectId).toBe('public-project-fixture')
  })

  it('censors entire configuration objects too', () => {
    let output = ''
    createLogger({ write: (chunk: string) => { output += chunk } })
      .info({ env: { AUDIT_SIGNING_SEED: 'planted-not-a-key' }, nested: { env: { SESSION_SECRET: 'planted-not-a-key' } } })
    const emitted = JSON.parse(output)
    expect(emitted.env).toBe('[redacted]')
    expect(emitted.nested.env).toBe('[redacted]')
  })

  it('still verifies a fixed historical Ed25519 signature with its public key alone', () => {
    // RFC 8032 section 7.1 test 1, empty message: only public verification data.
    const publicKey = Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex').toString('base64')
    const signature = Buffer.from('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b', 'hex').toString('base64')
    expect(verifyBytes(Buffer.alloc(0), signature, publicKey)).toBe(true)
    expect(verifyBytes(Buffer.from('altered'), signature, publicKey)).toBe(false)
  })
})
