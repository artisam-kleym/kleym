import { env } from '@/lib/config/env'

export const LOCAL_DELIVERY_NOTICE = 'Distribute each private claim link yourself from your saved CSV. Kleym bearer-link email delivery is disabled.'

/** Historical email harnesses only; production and public-network pilots stay local-link-only. */
export function legacyBearerEmailAllowed(): boolean {
  return env.LEGACY_BEARER_EMAIL_ENABLED && env.NODE_ENV !== 'production' && env.STELLAR_NETWORK === 'testnet'
}

/** OTP-only mail uses an existing Zender credential; no bearer URL ever enters mail. */
export function emailVerificationAvailable(): boolean {
  return env.EMAIL_PROVIDER === 'zender' && !!env.ZENDER_API_KEY
}
