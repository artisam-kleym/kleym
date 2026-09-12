#!/usr/bin/env node
/**
 * `kleym create-campaign --name … --amount … --links N --expires <iso> --out secrets.csv [--asset CODE:ISSUER] [--network testnet|public] [--labels file]`
 *
 * Reads KLEYM_API_KEY, KLEYM_URL and KLEYM_SENDER_SECRET from the
 * environment — never from a flag, so no seed lands in a shell history.
 * Prints the campaign id and where the secrets file went; prints no key.
 */
import { readFile } from 'node:fs/promises'
import { Keypair } from '@stellar/stellar-sdk'
import { KleymClient } from './client.js'
import { createCampaignEndToEnd } from './flow.js'

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  if (command !== 'create-campaign') {
    console.error('usage: kleym create-campaign --name <name> --amount <per link> --links <count> --expires <iso> --out <secrets.csv> [--asset CODE:ISSUER] [--network testnet|public] [--labels <file>]')
    process.exit(2)
  }
  const apiKey = process.env.KLEYM_API_KEY
  const baseUrl = process.env.KLEYM_URL
  const senderSecret = process.env.KLEYM_SENDER_SECRET
  if (!apiKey || !baseUrl || !senderSecret) {
    console.error('set KLEYM_API_KEY, KLEYM_URL and KLEYM_SENDER_SECRET in the environment')
    process.exit(2)
  }
  const name = flag(args, 'name')
  const amount = flag(args, 'amount')
  const links = Number(flag(args, 'links'))
  const expiresAt = flag(args, 'expires')
  const out = flag(args, 'out')
  if (!name || !amount || !links || !expiresAt || !out) {
    console.error('missing one of --name --amount --links --expires --out')
    process.exit(2)
  }
  const [assetCode, assetIssuer] = (flag(args, 'asset') ?? 'XLM').split(':')
  const network = (flag(args, 'network') ?? 'testnet') as 'testnet' | 'public'
  const labelsFile = flag(args, 'labels')
  const labels = labelsFile ? (await readFile(labelsFile, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []

  const client = new KleymClient({ baseUrl, apiKey })
  const result = await createCampaignEndToEnd({
    client,
    terms: { name, network, senderPublicKey: Keypair.fromSecret(senderSecret).publicKey(), assetCode: assetCode!, ...(assetIssuer ? { assetIssuer } : {}), amountPerLink: amount, linkCount: links, expiresAt },
    csvPath: out,
    appUrl: baseUrl,
    senderSecret,
    labels,
    onBatch: (b) => console.error(`batch ${b.sequence}: ${b.status} ${b.transactionHash}`),
  })
  console.log(JSON.stringify({ campaignId: result.campaignId, secretsFile: result.csvPath, batches: result.batches.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
