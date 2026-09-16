/**
 * Verification for the sender dashboard (#42). Real Postgres.
 *
 * Criteria 1–4: scoped to the user and reconciling with the campaign list;
 * distributed = claimed only, correct across mixed assets; no exponential
 * notation at the smallest permitted amount; bounded at MAX_LINKS_PER_CAMPAIGN
 * and no Horizon request. Run: pnpm verify:dashboard
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { env } = await import('../src/lib/config/env')
const { loadDashboard, distributedByAsset, dashboardCounts, distributedLabel, RECENT_CAMPAIGNS } = await import('../src/lib/api/dashboard')
const { listCampaigns, campaignListQuerySchema } = await import('../src/lib/api/campaign-list')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Returns the user's personal ORGANISATION id — the scope the dashboard reads in. */
async function user(): Promise<string> {
  const row = await prisma.user.create({
    data: { username: `dash-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  return personalOrg(prisma, row.id)
}
const userOf = (organizationId: string) => organizationId.replace(/^org_/, '')

const ISSUER = Keypair.random().publicKey()
type S = 'PENDING' | 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'RECLAIMED' | 'FAILED'
async function campaign(organizationId: string, opts: { asset: string; amount: string; links: S[]; expiresAt?: Date; status?: 'ACTIVE' | 'EXPIRED' | 'DRAFT'; network?: 'testnet' | 'public'; issuer?: string }) {
  const c = await prisma.campaign.create({
    data: {
      userId: userOf(organizationId), organizationId, name: `dash ${opts.asset} ${opts.amount}`, network: opts.network ?? 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: opts.asset,
      assetIssuer: opts.asset === 'XLM' ? null : (opts.issuer ?? ISSUER),
      amountPerLink: opts.amount, linkCount: opts.links.length,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000), status: opts.status ?? 'ACTIVE',
    },
    select: { id: true },
  })
  const CHUNK = 500
  for (let i = 0; i < opts.links.length; i += CHUNK) {
    await prisma.claimLink.createMany({
      data: opts.links.slice(i, i + CHUNK).map((status) => ({
        campaignId: c.id, ephemeralPublicKey: Keypair.random().publicKey(), amount: opts.amount, status,
        balanceId: status === 'PENDING' || status === 'FAILED' ? null : `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72),
      })),
    })
  }
  return c.id
}

async function claimedOnlyAcrossAssets(): Promise<void> {
  console.log('\n1. Distributed is CLAIMED value, by asset')
  const u = await user()
  await campaign(u, { asset: 'USDC', amount: '500', links: ['CLAIMED', 'CLAIMED', 'ACTIVE', 'RECLAIMED', 'EXPIRED'] })
  await campaign(u, { asset: 'USDC', amount: '0.5', links: ['CLAIMED', 'PENDING'] })
  await campaign(u, { asset: 'XLM', amount: '2.5', links: ['CLAIMED', 'CLAIMED', 'CLAIMED', 'ACTIVE'] })
  await campaign(u, { asset: 'EURC', amount: '10', links: ['ACTIVE', 'ACTIVE'] }) // nothing claimed yet

  const rows = await distributedByAsset(u)
  const by = Object.fromEntries(rows.map((r) => [r.assetCode, r]))
  check('USDC is 2×500 + 1×0.5 = 1000.5, not the 2500.5 created', by.USDC?.amount === '1000.5' && by.USDC.claimed === 3, JSON.stringify(by.USDC))
  check('XLM is 3×2.5 = 7.5', by.XLM?.amount === '7.5' && by.XLM.claimed === 3, JSON.stringify(by.XLM))
  check('an asset with nothing claimed is absent, not zero-padded', !('EURC' in by), JSON.stringify(rows))
  check('assets are sorted', rows.map((r) => r.assetCode).join(',') === 'USDC,XLM')

  const counts = await dashboardCounts(u)
  check('active campaigns is 4', counts.activeCampaigns === 4, `${counts.activeCampaigns}`)
  check('pending claims counts ACTIVE links with a balance (1+0+1+2)', counts.pendingClaims === 4, `${counts.pendingClaims}`)
}

async function scopedAndReconciling(): Promise<void> {
  console.log('\n2. Scoped to the signed-in user, and agreeing with /campaigns')
  const alice = await user()
  const mallory = await user()
  await campaign(alice, { asset: 'XLM', amount: '1', links: ['CLAIMED', 'ACTIVE'] })
  await campaign(mallory, { asset: 'XLM', amount: '1000', links: ['CLAIMED', 'CLAIMED', 'ACTIVE'] })

  const a = await loadDashboard(alice)
  check('alice sees only her XLM', a.distributed.length === 1 && a.distributed[0]!.amount === '1', JSON.stringify(a.distributed))
  check('and only her campaign', a.recent.length === 1 && a.counts.activeCampaigns === 1)
  check('and only her pending claim', a.counts.pendingClaims === 1, `${a.counts.pendingClaims}`)

  const list = await listCampaigns(alice, campaignListQuerySchema.parse({}))
  check('recent campaigns is the head of the campaign list, same order',
    JSON.stringify(a.recent.map((r) => r.id)) === JSON.stringify(list.rows.slice(0, RECENT_CAMPAIGNS).map((r) => r.id)))
  check('and the claimed figure matches the list\'s', a.recent[0]!.claimed === list.rows[0]!.claimed)
}

async function outstandingExcludesExpired(): Promise<void> {
  console.log('\n3. Outstanding excludes links whose campaign has expired')
  const u = await user()
  await campaign(u, { asset: 'XLM', amount: '1', links: ['ACTIVE', 'ACTIVE'] })
  await campaign(u, { asset: 'XLM', amount: '1', links: ['ACTIVE'], expiresAt: new Date(Date.now() - 1000), status: 'EXPIRED' })
  const counts = await dashboardCounts(u)
  check('pending counts all three', counts.pendingClaims === 3, `${counts.pendingClaims}`)
  check('outstanding counts the two still claimable', counts.outstanding === 2, `${counts.outstanding}`)
}

async function noExponentialNotation(): Promise<void> {
  console.log('\n4. The smallest permitted amount renders as digits')
  const u = await user()
  await campaign(u, { asset: 'XLM', amount: '0.0000001', links: ['CLAIMED'] })
  const [row] = await distributedByAsset(u)
  check('one stroop is 0.0000001', row?.amount === '0.0000001', `${row?.amount}`)
  check('and not 1e-7', !/e/i.test(row?.amount ?? 'e'))
  const recent = (await loadDashboard(u)).recent
  check('the per-link amount in the table too', recent[0]?.amountPerLink === '0.0000001', `${recent[0]?.amountPerLink}`)
  const big = await user()
  await campaign(big, { asset: 'XLM', amount: '922337203685.4775807', links: ['CLAIMED'] })
  check('and the largest keeps every digit', (await distributedByAsset(big))[0]?.amount === '922337203685.4775807')
}

async function boundedAtScale(): Promise<void> {
  const size = env.MAX_LINKS_PER_CAMPAIGN
  console.log(`\n5. At MAX_LINKS_PER_CAMPAIGN (${size} links), no row load and no Horizon`)
  const u = await user()
  const statuses: S[] = Array.from({ length: size }, (_, i) => (i % 3 === 0 ? 'CLAIMED' : 'ACTIVE'))
  const id = await campaign(u, { asset: 'USDC', amount: '3', links: statuses })
  for (let i = 0; i < 7; i += 1) await campaign(u, { asset: 'XLM', amount: '1', links: ['ACTIVE'] })

  const started = process.hrtime.bigint()
  const dash = await loadDashboard(u)
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  const claimed = statuses.filter((s) => s === 'CLAIMED').length
  check(`it loads in well under a second (${ms.toFixed(0)} ms)`, ms < 1_000)
  check('distributed is exact at scale', dash.distributed.find((r) => r.assetCode === 'USDC')?.amount === String(claimed * 3), JSON.stringify(dash.distributed))
  check(`recent is capped at ${RECENT_CAMPAIGNS}`, dash.recent.length === RECENT_CAMPAIGNS, `${dash.recent.length}`)
  check('the payload carries counts, not links',
    !JSON.stringify(dash).includes('ephemeralPublicKey') && JSON.stringify(dash).length < 5_000, `${JSON.stringify(dash).length} bytes`)

  // No Horizon: the module never imports the client. Checked by reading the
  // import graph of the module rather than by intercepting the network.
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/lib/api/dashboard.ts', import.meta.url), 'utf8')
  check('lib/api/dashboard.ts imports nothing from lib/stellar', !/lib\/stellar/.test(source))

  await prisma.campaign.delete({ where: { id } })
}

/**
 * An asset is (network, code, issuer). A testnet rehearsal and the real
 * campaign must not sum into one "USDC", and neither must two issuers.
 */
async function assetsAreNotMergedAcrossNetworksOrIssuers(): Promise<void> {
  console.log('\n6. Same code, different network or issuer: separate rows')
  const u = await user()
  await campaign(u, { asset: 'USDC', amount: '100', links: ['CLAIMED'], network: 'testnet' })
  await campaign(u, { asset: 'USDC', amount: '7', links: ['CLAIMED', 'CLAIMED'], network: 'public' })
  const otherIssuer = Keypair.random().publicKey()
  await campaign(u, { asset: 'USDC', amount: '1', links: ['CLAIMED'], network: 'public', issuer: otherIssuer })

  const rows = await distributedByAsset(u)
  check('three rows, not one', rows.length === 3, JSON.stringify(rows))
  const find = (network: string, issuer: string) => rows.find((r) => r.network === network && r.assetIssuer === issuer)
  check('testnet USDC is 100', find('testnet', ISSUER)?.amount === '100')
  check('public USDC (primary issuer) is 14', find('public', ISSUER)?.amount === '14')
  check('public USDC (other issuer) is 1', find('public', otherIssuer)?.amount === '1')
  check('no row is the 115 a code-only sum would show', rows.every((r) => r.amount !== '115'))

  const labels = rows.map((r) => distributedLabel(r, rows))
  check('every row gets a distinct label', new Set(labels).size === 3, JSON.stringify(labels))
  check('labels name the network', labels.every((l) => /testnet|public/.test(l)), JSON.stringify(labels))
  check('and the issuer only where a code has two', labels.filter((l) => l.includes('…')).length === 2, JSON.stringify(labels))

  const single = await user()
  await campaign(single, { asset: 'XLM', amount: '1', links: ['CLAIMED'] })
  const one = await distributedByAsset(single)
  check('a single-network, single-issuer sender sees a bare code', distributedLabel(one[0]!, one) === 'XLM', distributedLabel(one[0]!, one))
}

async function main(): Promise<void> {
  try {
    await claimedOnlyAcrossAssets()
    await scopedAndReconciling()
    await outstandingExcludesExpired()
    await noExponentialNotation()
    await boundedAtScale()
    await assetsAreNotMergedAcrossNetworksOrIssuers()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
