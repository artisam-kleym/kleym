/**
 * TOTP keys at rest. Issue #47.
 *
 * One primitive for every credential Kleym holds (#46 consolidated it):
 * AES-256-GCM under CREDENTIAL_ENCRYPTION_KEY, in lib/auth/at-rest.ts.
 */
export { encryptAtRest as encryptSecret, decryptAtRest as decryptSecret } from '@/lib/auth/at-rest'
