/** Public build settings only. Never import the application's secret-bearing env schema. */
import { isPublicHostname } from '../src/lib/validation/public-host'
export function landingOrigin(raw: string, allowLocal = false): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Landing URLs must be valid public HTTPS origins.')
  }
  if (/S[A-Z2-7]{55}/i.test(raw) || /S[A-Z2-7]{55}/i.test(url.href))
    throw new Error('Landing URLs must not contain wallet keys.')
  const local =
    allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (!local &&
      (url.protocol !== 'https:' || !isPublicHostname(url.hostname))) ||
    (local && !['http:', 'https:'].includes(url.protocol)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Landing URLs must be public HTTPS origins without credentials, paths, queries or fragments.',
    )
  }
  return url.origin
}

export function landingConfiguration(
  values: Record<string, string | undefined>,
  allowLocal = false,
) {
  const network = values.LANDING_NETWORK ?? 'testnet'
  if (network !== 'testnet' && network !== 'public')
    throw new Error('LANDING_NETWORK must be testnet or public.')
  return {
    appOrigin: landingOrigin(
      values.LANDING_APP_URL ?? 'https://app.kleym.xyz',
      allowLocal,
    ),
    siteOrigin: landingOrigin(
      values.LANDING_SITE_URL ?? 'https://kleym.xyz',
      allowLocal,
    ),
    network,
  }
}
