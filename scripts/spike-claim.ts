/**
 * SPEC.md §3.3 testnet spike — issue #1.
 *
 * Standalone. No Next.js, no Prisma, no UI. Its only job is to prove, or
 * disprove, the sponsored claim transaction before anything is built on it.
 *
 * SPEC.md §3.3 as originally written is DISPROVEN — an account cannot be merged
 * in the transaction that created it, nor while it holds a trustline. This script
 * now exercises the adopted two-transaction design instead.
 *
 * Proves four permutations: new/existing recipient x native/non-native asset.
 * Also proves the two predicate directions and the balance-ID extraction path.
 *
 * NOTHING IN THIS FILE MAY BE REUSED AS APPLICATION CODE. It holds ephemeral
 * seeds in process memory, which is legitimate here (the sender's browser does
 * the same) and illegitimate on a server.
 */
import {
  Asset,
  BASE_FEE,
  Claimant,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
const FRIENDBOT_URL = process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org'
const NETWORK_PASSPHRASE = Networks.TESTNET

const server = new Horizon.Server(HORIZON_URL)
const FEE_PER_OP = String(Number(BASE_FEE) * 10)

// ── helpers ──────────────────────────────────────────────────────────────────

const log = (...a: unknown[]) => console.log(...a)
const section = (t: string) => log(`\n${'─'.repeat(74)}\n${t}\n${'─'.repeat(74)}`)

async function friendbot(pub: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${pub}`)
  if (!res.ok) throw new Error(`friendbot ${res.status} for ${pub}: ${await res.text()}`)
}

async function accountExists(pub: string): Promise<boolean> {
  try {
    await server.loadAccount(pub)
    return true
  } catch (e: any) {
    if (e?.response?.status === 404 || e?.name === 'NotFoundError') return false
    throw e
  }
}

/** Balance of `asset` held by `pub`, as an exact Decimal. Zero if no trustline. */
async function balanceOf(pub: string, asset: Asset): Promise<Decimal> {
  const acct = await server.loadAccount(pub)
  const row = acct.balances.find((b: any) =>
    asset.isNative()
      ? b.asset_type === 'native'
      : b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
  )
  return new Decimal(row ? (row as any).balance : 0)
}

async function hasTrustline(pub: string, asset: Asset): Promise<boolean> {
  if (asset.isNative()) return true
  if (!(await accountExists(pub))) return false
  const acct = await server.loadAccount(pub)
  return acct.balances.some(
    (b: any) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
  )
}

async function currentLedger(): Promise<number> {
  const page: any = await server.ledgers().order('desc').limit(1).call()
  return page.records[0].sequence
}

/**
 * AccountMerge compares the account's sequence number against a ceiling derived
 * from the last closed ledger, so the merge must land in a ledger strictly after
 * the one that created the account. This wait is structural, not a workaround.
 */
async function waitForNextLedger(): Promise<void> {
  const start = await currentLedger()
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    if ((await currentLedger()) > start) return
  }
  throw new Error('ledger did not advance')
}

async function numSponsoring(pub: string): Promise<number> {
  const acct: any = await server.loadAccount(pub)
  return Number(acct.num_sponsoring ?? 0)
}

/**
 * Sponsoring an entry does not spend XLM — it raises the sponsor's minimum
 * balance, locking part of the balance rather than transferring it. Reserve
 * recovery therefore has to be measured here, not in the balance.
 */
async function reserveObligation(pub: string): Promise<Decimal> {
  const acct: any = await server.loadAccount(pub)
  const entries = new Decimal(2)
    .plus(acct.subentry_count ?? 0)
    .plus(acct.num_sponsoring ?? 0)
    .minus(acct.num_sponsored ?? 0)
  return entries.times(await baseReserve())
}

/** Fee actually charged, read back from the ledger rather than assumed. */
async function feeCharged(hash: string): Promise<Decimal> {
  const tx: any = await server.transactions().transaction(hash).call()
  return new Decimal(tx.fee_charged).div(1e7)
}

/** Operation/transaction result codes from a Horizon rejection, or null. */
function resultCodes(e: any): { transaction?: string; operations?: string[] } | null {
  return e?.response?.data?.extras?.result_codes ?? null
}

function describeError(e: any): string {
  const rc = e?.response?.data?.extras?.result_codes
  if (rc) return JSON.stringify(rc)
  return e?.message ?? String(e)
}

// ── setup ────────────────────────────────────────────────────────────────────

interface World {
  sponsor: Keypair
  sender: Keypair
  issuer: Keypair
  usdc: Asset
}

async function setUpWorld(): Promise<World> {
  section('Setup')
  const sponsor = Keypair.random()
  const sender = Keypair.random()
  const issuer = Keypair.random()

  log(`sponsor  ${sponsor.publicKey()}`)
  log(`sender   ${sender.publicKey()}`)
  log(`issuer   ${issuer.publicKey()}`)

  await Promise.all([
    friendbot(sponsor.publicKey()),
    friendbot(sender.publicKey()),
    friendbot(issuer.publicKey()),
  ])
  log('funded all three via friendbot')

  const usdc = new Asset('USDC', issuer.publicKey())

  // Sender needs a trustline and a supply of the non-native asset.
  const senderAcct = await server.loadAccount(sender.publicKey())
  const trustTx = new TransactionBuilder(senderAcct, {
    fee: FEE_PER_OP,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build()
  trustTx.sign(sender)
  await server.submitTransaction(trustTx)

  const issuerAcct = await server.loadAccount(issuer.publicKey())
  const fundTx = new TransactionBuilder(issuerAcct, {
    fee: FEE_PER_OP,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination: sender.publicKey(), asset: usdc, amount: '10000' }),
    )
    .setTimeout(60)
    .build()
  fundTx.sign(issuer)
  await server.submitTransaction(fundTx)
  log('sender holds 10000 USDC')

  return { sponsor, sender, issuer, usdc }
}

/**
 * Read the reserve multiplier from the live protocol rather than hardcoding it.
 * SPEC.md §3.2 is explicit that this must not be a constant.
 */
async function baseReserve(): Promise<Decimal> {
  const page: any = await server.ledgers().order('desc').limit(1).call()
  const stroops = page.records[0].base_reserve_in_stroops
  return new Decimal(stroops).div(1e7)
}

// ── create side (SPEC §3.2) ──────────────────────────────────────────────────

async function createClaimableBalance(
  w: World,
  ephemeralPub: string,
  asset: Asset,
  amount: string,
  expiresAt: Date,
): Promise<{ balanceId: string; extractedId: string }> {
  const senderAcct = await server.loadAccount(w.sender.publicKey())
  const unix = Math.floor(expiresAt.getTime() / 1000).toString()

  const tx = new TransactionBuilder(senderAcct, {
    fee: FEE_PER_OP,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createClaimableBalance({
        asset,
        amount,
        claimants: [
          new Claimant(ephemeralPub, Claimant.predicateBeforeAbsoluteTime(unix)),
          new Claimant(
            w.sender.publicKey(),
            Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(unix)),
          ),
        ],
      }),
    )
    .setTimeout(60)
    .build()

  tx.sign(w.sender)

  // SPEC §7.2: use the SDK helper, not manual XDR walking.
  const extractedId = tx.getClaimableBalanceId(0)

  await server.submitTransaction(tx)

  // Confirm the locally-derived ID matches what the ledger actually recorded.
  const onChain: any = await server.claimableBalances().claimableBalance(extractedId).call()

  return { balanceId: onChain.id, extractedId }
}

// ── claim side (SPEC §3.3) ───────────────────────────────────────────────────

interface ClaimPlan {
  xdr: string
  needsRecipientSignature: boolean
  opCount: number
  /** Ledger-observed, not inferred from test setup — assertions derive from these. */
  recipientExists: boolean
  recipientTrusts: boolean
}

/**
 * TX1 — materialise the ephemeral account and, for a non-native asset, its
 * trustline. Signers: SPONSOR, EPHEMERAL. The recipient is deliberately absent,
 * so this can be submitted while the recipient is still connecting a wallet.
 */
async function materialiseEphemeral(
  w: World,
  ephemeralPub: string,
  ephemeralKp: Keypair,
  asset: Asset,
): Promise<{ hash: string; opCount: number }> {
  const sponsorAcct = await server.loadAccount(w.sponsor.publicKey())
  const b = new TransactionBuilder(sponsorAcct, {
    fee: FEE_PER_OP,
    networkPassphrase: NETWORK_PASSPHRASE,
  })

  b.addOperation(
    Operation.beginSponsoringFutureReserves({
      sponsoredId: ephemeralPub,
      source: w.sponsor.publicKey(),
    }),
  )
  b.addOperation(
    Operation.createAccount({
      destination: ephemeralPub,
      startingBalance: '0',
      source: w.sponsor.publicKey(),
    }),
  )
  b.addOperation(Operation.endSponsoringFutureReserves({ source: ephemeralPub }))

  if (!asset.isNative()) {
    b.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: ephemeralPub,
        source: w.sponsor.publicKey(),
      }),
    )
    b.addOperation(Operation.changeTrust({ asset, source: ephemeralPub }))
    b.addOperation(Operation.endSponsoringFutureReserves({ source: ephemeralPub }))
  }

  const tx = b.setTimeout(180).build()
  tx.sign(w.sponsor)
  tx.sign(ephemeralKp)
  const res: any = await server.submitTransaction(tx)
  return { hash: res.hash, opCount: tx.operations.length }
}

/**
 * TX2 — claim, forward to the recipient, dispose of the ephemeral account.
 * Must land in a ledger after TX1. Signers: SPONSOR, EPHEMERAL, and RECIPIENT
 * only when the recipient is an operation source.
 */
async function prepareClaim(
  w: World,
  ephemeralPub: string,
  recipientPub: string,
  asset: Asset,
  amount: string,
  balanceId: string,
): Promise<ClaimPlan> {
  const recipientExists = await accountExists(recipientPub)
  const recipientTrusts = recipientExists ? await hasTrustline(recipientPub, asset) : false
  const nonNative = !asset.isNative()

  const sponsorAcct = await server.loadAccount(w.sponsor.publicKey())
  const b = new TransactionBuilder(sponsorAcct, {
    fee: FEE_PER_OP,
    networkPassphrase: NETWORK_PASSPHRASE,
  })

  b.addOperation(Operation.claimClaimableBalance({ balanceId, source: ephemeralPub }))

  if (!recipientExists) {
    b.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: recipientPub,
        source: w.sponsor.publicKey(),
      }),
    )
    b.addOperation(
      Operation.createAccount({
        destination: recipientPub,
        startingBalance: '0',
        source: w.sponsor.publicKey(),
      }),
    )
    b.addOperation(Operation.endSponsoringFutureReserves({ source: recipientPub }))
  }

  if (nonNative && !recipientTrusts) {
    b.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: recipientPub,
        source: w.sponsor.publicKey(),
      }),
    )
    b.addOperation(Operation.changeTrust({ asset, source: recipientPub }))
    b.addOperation(Operation.endSponsoringFutureReserves({ source: recipientPub }))
  }

  b.addOperation(
    Operation.payment({ destination: recipientPub, asset, amount, source: ephemeralPub }),
  )

  // AccountMerge refuses an account with subentries, so the ephemeral trustline
  // must go first. Its sponsored reserve returns to the sponsor here.
  if (nonNative) {
    b.addOperation(
      Operation.changeTrust({ asset, limit: '0', source: ephemeralPub }),
    )
  }

  b.addOperation(Operation.accountMerge({ destination: recipientPub, source: ephemeralPub }))

  const tx = b.setTimeout(180).build()
  tx.sign(w.sponsor)

  // Signing when the recipient is not an operation source yields tx_bad_auth_extra.
  const needsRecipientSignature = !recipientExists || (nonNative && !recipientTrusts)

  return {
    xdr: tx.toXDR(),
    needsRecipientSignature,
    opCount: tx.operations.length,
    recipientExists,
    recipientTrusts,
  }
}

// ── one permutation ──────────────────────────────────────────────────────────

interface Result {
  name: string
  passed: boolean
  detail: string[]
  failure?: string
}

async function runPermutation(
  w: World,
  opts: { name: string; asset: Asset; existingRecipient: boolean },
): Promise<Result> {
  const detail: string[] = []
  const amount = '500.0000000'
  const asset = opts.asset

  try {
    const ephemeral = Keypair.random()
    const recipient = Keypair.random()

    if (opts.existingRecipient) {
      await friendbot(recipient.publicKey())
      if (!asset.isNative()) {
        const ra = await server.loadAccount(recipient.publicKey())
        const t = new TransactionBuilder(ra, {
          fee: FEE_PER_OP,
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(Operation.changeTrust({ asset }))
          .setTimeout(60)
          .build()
        t.sign(recipient)
        await server.submitTransaction(t)
      }
    }

    const expiresAt = new Date(Date.now() + 3600_000)
    const { balanceId, extractedId } = await createClaimableBalance(
      w,
      ephemeral.publicKey(),
      asset,
      amount,
      expiresAt,
    )
    detail.push(`balance ${balanceId.slice(0, 16)}…  (SDK-extracted ID matched ledger: ${extractedId === balanceId})`)
    if (extractedId !== balanceId) throw new Error('extracted balance ID did not match the ledger')

    const before = {
      recipient: opts.existingRecipient ? await balanceOf(recipient.publicKey(), asset) : new Decimal(0),
      sponsor: await balanceOf(w.sponsor.publicKey(), Asset.native()),
      sponsoring: await numSponsoring(w.sponsor.publicKey()),
      obligation: await reserveObligation(w.sponsor.publicKey()),
    }

    // TX1: materialise the ephemeral account. No recipient involvement.
    const tx1 = await materialiseEphemeral(w, ephemeral.publicKey(), ephemeral, asset)
    detail.push(`TX1 ${tx1.opCount} ops, ${tx1.hash.slice(0, 16)}…`)

    // The merge in TX2 requires a ledger boundary after TX1.
    await waitForNextLedger()

    const plan = await prepareClaim(
      w,
      ephemeral.publicKey(),
      recipient.publicKey(),
      asset,
      amount,
      balanceId,
    )
    detail.push(`${plan.opCount} ops, recipient signature required: ${plan.needsRecipientSignature}`)

    const tx = new Transaction(plan.xdr, NETWORK_PASSPHRASE)
    tx.sign(ephemeral)
    if (plan.needsRecipientSignature) tx.sign(recipient)

    const res: any = await server.submitTransaction(tx)
    detail.push(`TX2 ${plan.opCount} ops, ${res.hash.slice(0, 16)}…`)

    // ── assertions ───────────────────────────────────────────────────────────

    // 1. Recipient received the exact amount.
    const after = await balanceOf(recipient.publicKey(), asset)
    const expected = before.recipient.plus(amount)
    if (!asset.isNative() && !after.equals(expected)) {
      throw new Error(`recipient balance ${after} != expected ${expected}`)
    }
    if (asset.isNative()) {
      // Native also receives the merged ephemeral balance (0) — still exact.
      if (!after.equals(expected)) {
        throw new Error(`recipient XLM ${after} != expected ${expected}`)
      }
    }
    detail.push(`recipient +${amount} ${asset.isNative() ? 'XLM' : asset.getCode()} exactly`)

    // 2. The ephemeral account is gone.
    if (await accountExists(ephemeral.publicKey())) {
      throw new Error('ephemeral account still exists after the claim')
    }
    detail.push('ephemeral account merged away')

    // 3. Sponsor reserves recovered: no ephemeral sponsorship left behind.
    const fee = (await feeCharged(tx1.hash)).plus(await feeCharged(res.hash))
    const sponsorAfter = await balanceOf(w.sponsor.publicKey(), Asset.native())
    const sponsoringAfter = await numSponsoring(w.sponsor.publicKey())
    const reserve = await baseReserve()

    // Sponsorships that legitimately persist: the recipient's account and, for a
    // non-native asset, its trustline. Every ephemeral sponsorship must be gone.
    // Derived from what prepareClaim observed on the ledger, not from this
    // test's own setup flags, so the assertion stays honest if setup changes.
    // An account costs TWO base reserves (Stellar's account minimum is
    // `2 + subentries`), a trustline one.
    const expectedNewSponsorships =
      (plan.recipientExists ? 0 : 2) + (!asset.isNative() && !plan.recipientTrusts ? 1 : 0)
    const actualNew = sponsoringAfter - before.sponsoring
    if (actualNew !== expectedNewSponsorships) {
      throw new Error(
        `sponsor num_sponsoring moved by ${actualNew}, expected ${expectedNewSponsorships} — ephemeral reserves leaked`,
      )
    }

    // SPEC §10.3: the sponsor's XLM balance must move by fees alone. Every
    // reserve the ephemeral account consumed has to come back on merge.
    const actualSpend = before.sponsor.minus(sponsorAfter)
    if (!actualSpend.equals(fee)) {
      throw new Error(
        `sponsor balance moved ${actualSpend} XLM, expected fee-only ${fee} — reserve leaked`,
      )
    }

    // What legitimately persists is the obligation against the recipient's own
    // entries; the ephemeral's must be fully released.
    const obligationAfter = await reserveObligation(w.sponsor.publicKey())
    const expectedObligation = reserve.times(expectedNewSponsorships)
    const actualObligation = obligationAfter.minus(before.obligation)
    if (!actualObligation.equals(expectedObligation)) {
      throw new Error(
        `sponsor reserve obligation moved ${actualObligation} XLM, expected ${expectedObligation} (${expectedNewSponsorships} x ${reserve})`,
      )
    }
    detail.push(
      `sponsor balance -${actualSpend} XLM (fees only); reserve obligation +${actualObligation} XLM for ${expectedNewSponsorships} recipient entr(y|ies); ephemeral reserves fully recovered`,
    )

    return { name: opts.name, passed: true, detail }
  } catch (e: any) {
    return { name: opts.name, passed: false, detail, failure: describeError(e) }
  }
}

// ── predicate directions ─────────────────────────────────────────────────────

/**
 * Both predicate directions, without waiting on the clock: a balance whose
 * expiry is already in the past inverts which claimant is eligible.
 */
async function runPredicateChecks(w: World): Promise<Result[]> {
  const out: Result[] = []
  const asset = Asset.native()
  const amount = '10.0000000'

  // Expired balance: recipient must fail, sender must succeed.
  {
    const detail: string[] = []
    try {
      const eph = Keypair.random()
      const past = new Date(Date.now() - 3600_000)
      const { balanceId } = await createClaimableBalance(w, eph.publicKey(), asset, amount, past)

      const recip = Keypair.random()
      await materialiseEphemeral(w, eph.publicKey(), eph, asset)
      await waitForNextLedger()
      const plan = await prepareClaim(w, eph.publicKey(), recip.publicKey(), asset, amount, balanceId)
      const tx = new Transaction(plan.xdr, NETWORK_PASSPHRASE)
      tx.sign(eph)
      if (plan.needsRecipientSignature) tx.sign(recip)

      let claimed = false
      let codes: ReturnType<typeof resultCodes> = null
      try {
        await server.submitTransaction(tx)
        claimed = true
      } catch (e) {
        codes = resultCodes(e)
      }
      if (claimed) throw new Error('recipient claimed a balance after expiry')
      // "Something threw" is not evidence: a timeout bound, a bad sequence, or a
      // Horizon 5xx would all look like an enforced predicate. Assert the code.
      if (codes?.operations?.[0] !== 'op_cannot_claim') {
        throw new Error(
          `expected op_cannot_claim on the claim op, got ${JSON.stringify(codes)}`,
        )
      }
      detail.push('recipient claim after expiry rejected with op_cannot_claim')

      const sa = await server.loadAccount(w.sender.publicKey())
      const reclaim = new TransactionBuilder(sa, {
        fee: FEE_PER_OP,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.claimClaimableBalance({ balanceId }))
        .setTimeout(60)
        .build()
      reclaim.sign(w.sender)
      await server.submitTransaction(reclaim)
      detail.push('sender reclaim after expiry succeeded')

      out.push({ name: 'Predicate — after expiry', passed: true, detail })
    } catch (e: any) {
      out.push({ name: 'Predicate — after expiry', passed: false, detail, failure: describeError(e) })
    }
  }

  // Live balance: sender must not be able to claim before expiry.
  {
    const detail: string[] = []
    try {
      const eph = Keypair.random()
      const future = new Date(Date.now() + 3600_000)
      const { balanceId } = await createClaimableBalance(w, eph.publicKey(), asset, amount, future)

      const sa = await server.loadAccount(w.sender.publicKey())
      const early = new TransactionBuilder(sa, {
        fee: FEE_PER_OP,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.claimClaimableBalance({ balanceId }))
        .setTimeout(60)
        .build()
      early.sign(w.sender)

      let claimed = false
      let codes: ReturnType<typeof resultCodes> = null
      try {
        await server.submitTransaction(early)
        claimed = true
      } catch (e) {
        codes = resultCodes(e)
      }
      if (claimed) throw new Error('sender claimed a balance before expiry')
      if (codes?.operations?.[0] !== 'op_cannot_claim') {
        throw new Error(
          `expected op_cannot_claim on the claim op, got ${JSON.stringify(codes)}`,
        )
      }
      detail.push('sender claim before expiry rejected with op_cannot_claim')
      out.push({ name: 'Predicate — before expiry', passed: true, detail })
    } catch (e: any) {
      out.push({ name: 'Predicate — before expiry', passed: false, detail, failure: describeError(e) })
    }
  }

  return out
}

/**
 * SPEC §3.3 states that signing when the recipient is not an operation source is
 * rejected. Following `needsRecipientSignature` only ever proves the happy path,
 * so this exercises the negative directly, then submits the same transaction
 * correctly signed to show the rejection was about the extra signature and not
 * some unrelated defect.
 */
async function runSignatureDisciplineCheck(w: World): Promise<Result> {
  const detail: string[] = []
  const asset = Asset.native()
  const amount = '25.0000000'
  try {
    const eph = Keypair.random()
    const recipient = Keypair.random()
    await friendbot(recipient.publicKey()) // existing + native => not an op source

    const expiresAt = new Date(Date.now() + 3600_000)
    const { balanceId } = await createClaimableBalance(w, eph.publicKey(), asset, amount, expiresAt)
    await materialiseEphemeral(w, eph.publicKey(), eph, asset)
    await waitForNextLedger()

    const plan = await prepareClaim(w, eph.publicKey(), recipient.publicKey(), asset, amount, balanceId)
    if (plan.needsRecipientSignature) {
      throw new Error('setup wrong: this permutation should not need a recipient signature')
    }

    const overSigned = new Transaction(plan.xdr, NETWORK_PASSPHRASE)
    overSigned.sign(eph)
    overSigned.sign(recipient) // the unnecessary signature under test
    let accepted = false
    let codes: ReturnType<typeof resultCodes> = null
    try {
      await server.submitTransaction(overSigned)
      accepted = true
    } catch (e) {
      codes = resultCodes(e)
    }
    if (accepted) throw new Error('an over-signed transaction was accepted')
    if (codes?.transaction !== 'tx_bad_auth_extra') {
      throw new Error(`expected tx_bad_auth_extra, got ${JSON.stringify(codes)}`)
    }
    detail.push('unnecessary recipient signature rejected with tx_bad_auth_extra')

    const correct = new Transaction(plan.xdr, NETWORK_PASSPHRASE)
    correct.sign(eph)
    await server.submitTransaction(correct)
    detail.push('same transaction succeeds without it — rejection was the signature, not the ops')

    return { name: 'Signature discipline — over-signed transaction', passed: true, detail }
  } catch (e: any) {
    return {
      name: 'Signature discipline — over-signed transaction',
      passed: false,
      detail,
      failure: describeError(e),
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Kleym — claim transaction spike (two-transaction design)')
  log(`horizon: ${HORIZON_URL}`)

  const w = await setUpWorld()
  const reserve = await baseReserve()
  log(`base reserve read from live protocol: ${reserve} XLM`)

  section('Permutations')
  const results: Result[] = []
  for (const opts of [
    { name: 'New recipient      x  native (XLM)', asset: Asset.native(), existingRecipient: false },
    { name: 'Existing recipient x  native (XLM)', asset: Asset.native(), existingRecipient: true },
    { name: 'New recipient      x  non-native (USDC)', asset: w.usdc, existingRecipient: false },
    { name: 'Existing recipient x  non-native (USDC)', asset: w.usdc, existingRecipient: true },
  ]) {
    log(`\n▶ ${opts.name}`)
    const r = await runPermutation(w, opts)
    r.detail.forEach((d) => log(`    ${d}`))
    if (!r.passed) log(`    FAILED: ${r.failure}`)
    results.push(r)
  }

  section('Signature discipline')
  {
    const r = await runSignatureDisciplineCheck(w)
    log(`\n▶ ${r.name}`)
    r.detail.forEach((d) => log(`    ${d}`))
    if (!r.passed) log(`    FAILED: ${r.failure}`)
    results.push(r)
  }

  section('Predicates')
  for (const r of await runPredicateChecks(w)) {
    log(`\n▶ ${r.name}`)
    r.detail.forEach((d) => log(`    ${d}`))
    if (!r.passed) log(`    FAILED: ${r.failure}`)
    results.push(r)
  }

  section('Summary')
  for (const r of results) log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}${r.passed ? '' : ` — ${r.failure}`}`)

  const failed = results.filter((r) => !r.passed)
  log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    log('\nSPIKE FAILED. Per AGENT.md §2, stop and report — do not build on this design.')
    process.exit(1)
  }
  log('\nSpike passed. The two-transaction claim design is verified on testnet.')
}

main().catch((e) => {
  console.error('\nspike aborted:', describeError(e))
  process.exit(1)
})
