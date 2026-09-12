/**
 * Credentials for other systems, at rest. Issue #46.
 *
 * AES-256-GCM under CREDENTIAL_ENCRYPTION_KEY from the environment; the
 * column holds base64(iv | tag | ciphertext). Nothing in the database can
 * recover a value without the environment, which the logger redacts.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/lib/config/env'

const IV_BYTES = 12
const TAG_BYTES = 16

const key = () => Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, 'base64')

export function encryptAtRest(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function decryptAtRest(stored: string): string {
  const raw = Buffer.from(stored, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_BYTES))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}
