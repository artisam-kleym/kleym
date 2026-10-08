/**
 * Minimal valid configuration for tests and verification scripts.
 *
 * Some modules legitimately depend on config — the campaign schemas read
 * MAX_LINKS_PER_CAMPAIGN, for instance — and env.ts validates the whole set on
 * first access and exits if anything is missing. That is correct production
 * behaviour, so callers supply a valid environment rather than the schema
 * being loosened to accommodate them.
 *
 * These are placeholders. Nothing asserts on them, and the sponsor key is a
 * throwaway generated at load, never a real one.
 *
 * Every value defers to one already in the environment: scripts/verify-*.ts
 * runs against a real database, and a hardcoded DATABASE_URL here would send
 * CI's queries to a server that is not the one it started.
 */
import { Keypair } from '@stellar/stellar-sdk'

/** Audit rows carry a BigInt `seq` (#49); scripts JSON them in check output. */
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}

export function applyEnvPlaceholders(): void {
  const sponsor = Keypair.random()

  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://kleym:kleym@localhost:5432/kleym',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
    AUDIT_SIGNING_SEED: Buffer.alloc(32, 9).toString('base64'),
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64'),
    STELLAR_NETWORK: 'testnet',
    SPONSORED_FUNDING_ENABLED: 'true', // Explicit isolated-fixture opt-in; never enables public distributions.
    MAINNET_DISTRIBUTION_ENABLED: 'false',
    HORIZON_URL: 'https://horizon-testnet.stellar.org',
    NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    SPONSOR_PUBLIC_KEY: sponsor.publicKey(),
    SPONSOR_SECRET_KEY: sponsor.secret(),
    RESEND_API_KEY: 're_test_placeholder',
    EMAIL_FROM: 'noreply@kleym.test',
  }

  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] ??= value
  }
}
