/**
 * Minimal valid configuration for unit tests.
 *
 * Some modules legitimately depend on config — the campaign schemas read
 * MAX_LINKS_PER_CAMPAIGN, for instance — and env.ts validates the whole set on
 * first access and exits if anything is missing. That is correct production
 * behaviour, so tests supply a valid environment rather than the schema being
 * loosened to accommodate them.
 *
 * These are placeholders. No test asserts on them, and the sponsor key here is
 * a throwaway generated at load, never a real one.
 */
import { Keypair } from '@stellar/stellar-sdk'

const sponsor = Keypair.random()

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://kleym:kleym@localhost:5432/kleym',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
  STELLAR_NETWORK: 'testnet',
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  SPONSOR_PUBLIC_KEY: sponsor.publicKey(),
  SPONSOR_SECRET_KEY: sponsor.secret(),
  RESEND_API_KEY: 're_test_placeholder',
  EMAIL_FROM: 'noreply@kleym.test',
})
