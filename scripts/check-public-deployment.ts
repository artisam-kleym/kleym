/** Read-only public readiness probe. No .env, cookies, private links or chain writes. */
import assert from 'node:assert/strict'

async function main() {
  const input = process.argv[2]
  assert(input, 'Usage: tsx scripts/check-public-deployment.ts https://YOUR_PUBLIC_KLEYM_HOST')
  const origin = new URL(input)
  assert(origin.protocol === 'https:' && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === '/', 'Use only a public HTTPS origin, never a claim URL or credentials')
  assert(!/^(localhost|127\.|\[?::1\]?)/i.test(origin.hostname), 'A loopback URL is not a public deployment')
  async function read(path: string) {
    const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    assert.equal(response.status, 200, `${path} did not pass (${response.status})`)
    return response
  }
  assert.equal((await (await read('/api/health')).json()).status, 'ok')
  assert.equal((await (await read('/api/ready')).json()).ready, true)
  const response = await read('/claim')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  const csp = response.headers.get('content-security-policy') ?? ''
  assert(csp.includes("script-src 'self' 'nonce-") && !/unsafe-inline|unsafe-eval/.test(csp), 'Claim CSP is missing or weakened')
  assert(csp.includes('wss://relay.walletconnect.org'), 'Mobile wallet configuration is not enabled')
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin: origin.origin, ready: true, claimHeadersPassed: true,
    qualification: 'Public HTTP readiness only. Worker settlement, Android wallet and ledger acceptance still require proof.', writes: 0 }, null, 2))
}
main().catch(() => {
  // Deliberately omit request URLs/errors: an accidental private-link argument must not be printed.
  console.error('Public deployment check failed. Use a public HTTPS origin and check health, readiness and mobile wallet configuration.')
  process.exitCode = 1
})
