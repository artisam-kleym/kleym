/**
 * Produces tests/fixtures/balance-id.json from a real testnet transaction.
 *
 * Run once, by hand, when the fixture needs regenerating:  pnpm fixture:balance-id
 *
 * The fixture exists so `getClaimableBalanceId` is tested against an ID the
 * LEDGER assigned, not against another call to the same function. Regenerating
 * it requires Horizon and Friendbot, which is exactly why the test itself does
 * not — AGENT.md §7.2 keeps testnet out of the per-commit suite.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { claimantsFor } from '../src/lib/stellar/batch'

const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const server = new Horizon.Server(HORIZON_URL)

async function main(): Promise<void> {
  const sender = Keypair.random()
  const ephemeralA = Keypair.random()
  const ephemeralB = Keypair.random()

  const funded = await fetch(`https://friendbot.stellar.org/?addr=${sender.publicKey()}`)
  if (!funded.ok) throw new Error(`friendbot ${funded.status}`)

  const account = await server.loadAccount(sender.publicKey())
  const expiresAt = new Date(Date.now() + 7 * 86_400_000)

  const builder = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: Networks.TESTNET,
  })
  for (const ephemeral of [ephemeralA, ephemeralB]) {
    builder.addOperation(
      Operation.createClaimableBalance({
        asset: Asset.native(),
        amount: '1.5000000',
        claimants: claimantsFor(ephemeral.publicKey(), sender.publicKey(), expiresAt),
      }),
    )
  }

  const transaction = builder.setTimeout(120).build()
  const derived = [0, 1].map((i) => transaction.getClaimableBalanceId(i))

  transaction.sign(sender)
  const result = await server.submitTransaction(transaction)

  // What the ledger actually created, read back independently.
  const onChain = await server
    .claimableBalances()
    .sponsor(sender.publicKey())
    .limit(10)
    .call()
  const ledgerIds = onChain.records.map((record) => record.id).sort()

  if (JSON.stringify([...derived].sort()) !== JSON.stringify(ledgerIds)) {
    throw new Error(`derived ${JSON.stringify(derived)} but ledger holds ${JSON.stringify(ledgerIds)}`)
  }

  mkdirSync('tests/fixtures', { recursive: true })
  writeFileSync(
    'tests/fixtures/balance-id.json',
    `${JSON.stringify(
      {
        note: 'Real testnet transaction. balanceIds were read back from Horizon, not derived twice.',
        network: 'testnet',
        transactionHash: result.hash,
        senderPublicKey: sender.publicKey(),
        ephemeralPublicKeys: [ephemeralA.publicKey(), ephemeralB.publicKey()],
        expiresAt: expiresAt.toISOString(),
        amount: '1.5000000',
        signedXdr: transaction.toXDR(),
        resultXdr: result.result_xdr,
        balanceIds: derived,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`fixture written — tx ${result.hash}`)
  console.log(`balance IDs confirmed against Horizon: ${derived.join(', ')}`)
}

void main()
