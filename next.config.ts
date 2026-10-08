import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Stellar SDK is not edge-compatible; every route handler pins the Node
  // runtime explicitly (AGENT.md §3). Keep it out of any edge bundling.
  // BullMQ's dynamic worker/optional-backend loading needs native Node resolution.
  serverExternalPackages: ['@stellar/stellar-sdk', 'pino', 'bullmq'],
}

export default nextConfig
