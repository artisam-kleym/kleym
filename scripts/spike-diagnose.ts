/**
 * Diagnosis for issue #1: SPEC.md §3.3 fails on AccountMerge in all four
 * permutations. This isolates the two causes and tests a revised design.
 */
import {
  Asset, BASE_FEE, Claimant, Horizon, Keypair, Networks, Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const server = new Horizon.Server('https://horizon-testnet.stellar.org')
const NP = Networks.TESTNET
const FEE = String(Number(BASE_FEE) * 10)
const log = console.log

const fb = async (p: string) => {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${p}`)
  if (!r.ok) throw new Error(`friendbot ${r.status}`)
}
const exists = async (p: string) => {
  // Rethrow anything that is not a genuine 404 — swallowing a transient Horizon
  // error here would report "ephemeral gone: true", which is this script's
  // entire output.
  try { await server.loadAccount(p); return true } catch (e: any) {
    if (e?.response?.status === 404 || e?.name === 'NotFoundError') return false
    throw e
  }
}
const codes = (e: any) => JSON.stringify(e?.response?.data?.extras?.result_codes ?? e?.message)

async function currentLedger(): Promise<number> {
  const p: any = await server.ledgers().order('desc').limit(1).call()
  return p.records[0].sequence
}
async function waitForNextLedger(): Promise<void> {
  const start = await currentLedger()
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    if ((await currentLedger()) > start) return
  }
  throw new Error('ledger did not advance')
}

async function main() {
  const sponsor = Keypair.random(), sender = Keypair.random(), issuer = Keypair.random()
  await Promise.all([fb(sponsor.publicKey()), fb(sender.publicKey()), fb(issuer.publicKey())])
  const usdc = new Asset('USDC', issuer.publicKey())

  let a = await server.loadAccount(sender.publicKey())
  let t = new TransactionBuilder(a, { fee: FEE, networkPassphrase: NP })
    .addOperation(Operation.changeTrust({ asset: usdc })).setTimeout(60).build()
  t.sign(sender); await server.submitTransaction(t)
  a = await server.loadAccount(issuer.publicKey())
  t = new TransactionBuilder(a, { fee: FEE, networkPassphrase: NP })
    .addOperation(Operation.payment({ destination: sender.publicKey(), asset: usdc, amount: '10000' }))
    .setTimeout(60).build()
  t.sign(issuer); await server.submitTransaction(t)
  log('setup done\n')

  const mkBalance = async (ephPub: string, asset: Asset, amount: string) => {
    const sa = await server.loadAccount(sender.publicKey())
    const unix = Math.floor((Date.now() + 3600_000) / 1000).toString()
    const tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.createClaimableBalance({
        asset, amount,
        claimants: [
          new Claimant(ephPub, Claimant.predicateBeforeAbsoluteTime(unix)),
          new Claimant(sender.publicKey(), Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(unix))),
        ],
      })).setTimeout(60).build()
    tx.sign(sender)
    const id = tx.getClaimableBalanceId(0)
    await server.submitTransaction(tx)
    return id
  }

  // ── Cause A: create + merge in the SAME transaction ──────────────────────
  log('── Cause A: create an account and merge it in one transaction ──')
  {
    const eph = Keypair.random(), dest = Keypair.random()
    await fb(dest.publicKey())
    const sa = await server.loadAccount(sponsor.publicKey())
    const tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.createAccount({ destination: eph.publicKey(), startingBalance: '0', source: sponsor.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .addOperation(Operation.accountMerge({ destination: dest.publicKey(), source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph)
    try { await server.submitTransaction(tx); log('  UNEXPECTED: merge succeeded') }
    catch (e) { log(`  fails as observed: ${codes(e)}`) }
  }

  // ── Cause A control: same ops, merge in a LATER transaction ──────────────
  log('\n── Cause A control: same account, merged one ledger later ──')
  {
    const eph = Keypair.random(), dest = Keypair.random()
    await fb(dest.publicKey())
    let sa = await server.loadAccount(sponsor.publicKey())
    let tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.createAccount({ destination: eph.publicKey(), startingBalance: '0', source: sponsor.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph); await server.submitTransaction(tx)
    await waitForNextLedger()
    sa = await server.loadAccount(sponsor.publicKey())
    tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.accountMerge({ destination: dest.publicKey(), source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph)
    try { await server.submitTransaction(tx); log(`  merge SUCCEEDED; ephemeral gone: ${!(await exists(eph.publicKey()))}`) }
    catch (e) { log(`  still fails: ${codes(e)}`) }
  }

  // ── Cause B: merge with a trustline still attached ───────────────────────
  log('\n── Cause B: merging an account that still holds a trustline ──')
  {
    const eph = Keypair.random(), dest = Keypair.random()
    await fb(dest.publicKey())
    let sa = await server.loadAccount(sponsor.publicKey())
    let tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.createAccount({ destination: eph.publicKey(), startingBalance: '0', source: sponsor.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: usdc, source: eph.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph); await server.submitTransaction(tx)
    await waitForNextLedger()

    sa = await server.loadAccount(sponsor.publicKey())
    tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.accountMerge({ destination: dest.publicKey(), source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph)
    try { await server.submitTransaction(tx); log('  UNEXPECTED: merge succeeded with trustline attached') }
    catch (e) { log(`  fails as observed: ${codes(e)}`) }

    sa = await server.loadAccount(sponsor.publicKey())
    tx = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.changeTrust({ asset: usdc, limit: '0', source: eph.publicKey() }))
      .addOperation(Operation.accountMerge({ destination: dest.publicKey(), source: eph.publicKey() }))
      .setTimeout(60).build()
    tx.sign(sponsor); tx.sign(eph)
    try { await server.submitTransaction(tx); log(`  removing the trustline first SUCCEEDS; ephemeral gone: ${!(await exists(eph.publicKey()))}`) }
    catch (e) { log(`  still fails: ${codes(e)}`) }
  }

  // ── Revised design: two transactions, hardest permutation ────────────────
  log('\n── Revised design: TX1 materialise, TX2 claim+forward+merge (new recipient x USDC) ──')
  {
    const eph = Keypair.random(), recip = Keypair.random()
    const balanceId = await mkBalance(eph.publicKey(), usdc, '500.0000000')

    let sa = await server.loadAccount(sponsor.publicKey())
    const tx1 = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.createAccount({ destination: eph.publicKey(), startingBalance: '0', source: sponsor.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: eph.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: usdc, source: eph.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: eph.publicKey() }))
      .setTimeout(120).build()
    tx1.sign(sponsor); tx1.sign(eph)
    await server.submitTransaction(tx1)
    log('  TX1 ok — ephemeral account + trustline exist, sponsored')
    await waitForNextLedger()

    sa = await server.loadAccount(sponsor.publicKey())
    const tx2 = new TransactionBuilder(sa, { fee: FEE, networkPassphrase: NP })
      .addOperation(Operation.claimClaimableBalance({ balanceId, source: eph.publicKey() }))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: recip.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.createAccount({ destination: recip.publicKey(), startingBalance: '0', source: sponsor.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: recip.publicKey() }))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: recip.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: usdc, source: recip.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: recip.publicKey() }))
      .addOperation(Operation.payment({ destination: recip.publicKey(), asset: usdc, amount: '500.0000000', source: eph.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: usdc, limit: '0', source: eph.publicKey() }))
      .addOperation(Operation.accountMerge({ destination: recip.publicKey(), source: eph.publicKey() }))
      .setTimeout(120).build()
    tx2.sign(sponsor); tx2.sign(eph); tx2.sign(recip)
    try {
      await server.submitTransaction(tx2)
      const ra = await server.loadAccount(recip.publicKey())
      const bal = ra.balances.find((b: any) => b.asset_code === 'USDC')
      log(`  TX2 SUCCEEDED — recipient USDC = ${(bal as any)?.balance}, ephemeral gone: ${!(await exists(eph.publicKey()))}`)
      const sp: any = await server.loadAccount(sponsor.publicKey())
      log(`  sponsor num_sponsoring now ${sp.num_sponsoring} (recipient account + trustline = 3 entries expected)`)
    } catch (e) { log(`  TX2 FAILED: ${codes(e)}`) }
  }
}
main().catch((e) => { console.error('aborted:', codes(e)); process.exit(1) })
