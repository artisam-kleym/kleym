/** Explicit public exceptions require review when a secret-shaped key is added. */
export const PUBLIC_ENV_KEYS = [
  'SPONSOR_PUBLIC_KEY', // Public Stellar identity, not a signing seed.
  'APP_URL', // Public application origin.
  'MARKETING_SITE_URL', // Public standalone website origin; rejects credentials.
  'TESTNET_APP_URL', // Public Testnet workspace origin, no credentials.
  'MAINNET_APP_URL', // Public Mainnet workspace origin, no credentials.
  'HORIZON_URL', // Public network provider URL; never embed credentials.
  'SEED_ADMIN_USERNAME', // Development account name, not its password.
  'ALLOW_PROD_SEED', // Bootstrap switch, not signing material.
] as const

export function unclassifiedSecretKeys(
  schemaKeys: readonly string[],
  secretKeys: readonly string[],
  publicKeys: readonly string[] = PUBLIC_ENV_KEYS,
): string[] {
  const classified = new Set([...secretKeys, ...publicKeys])
  return schemaKeys.filter((key) =>
    /SECRET|PASSWORD|TOKEN|SEED|_KEY$|_URL$/.test(key) && !classified.has(key),
  )
}

export function assertSecretClassification(schemaKeys: readonly string[], secretKeys: readonly string[]): void {
  const missing = unclassifiedSecretKeys(schemaKeys, secretKeys)
  if (missing.length) throw new Error(`Unclassified secret-shaped environment keys: ${missing.join(', ')}`)
}
