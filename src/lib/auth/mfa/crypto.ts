/**
 * TOTP keys at rest. Issue #47.
 *
 * AES-256-GCM under MFA_ENCRYPTION_KEY from the environment. The column holds
 * base64(iv | tag | ciphertext); nothing in the database can recover a key
 * without the environment, and the environment is redacted from every log
 * line by way of SECRET_ENV_KEYS.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/lib/config/env'

const IV_BYTES = 12
const TAG_BYTES = 16

function key(): Buffer {
  return Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64')
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, 'base64')
  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ct = raw.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
