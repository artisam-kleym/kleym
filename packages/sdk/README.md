# @kleym/sdk

Private CSV exports use exclusive file creation: POSIX mode `0600`, or a Windows owner-only ACL set atomically when the file is created. Windows requires built-in Windows PowerShell/.NET tools. Paths and CSV contents use stdin, never command arguments; permission failures are reported without writing secrets. Existing files are never overwritten.

Drive Kleym without a browser, without weakening anything: link keys are
generated on **your** machine, the secrets file is written to **your** disk,
and only public keys cross the network. Batches are signed locally with the
sender key you hold. The client refuses to send any request whose body
contains a secret seed.

```ts
import { KleymClient, createCampaignEndToEnd } from '@kleym/sdk'

const client = new KleymClient({ baseUrl: 'https://kleym.example', apiKey: process.env.KLEYM_API_KEY! })
const stellar = await client.getStellarMetadata()
const result = await createCampaignEndToEnd({
  client,
  terms: { name: 'September payroll', network: stellar.network, senderPublicKey: 'G…', ...stellar.defaultAsset, amountPerLink: '250', linkCount: 120, expiresAt: '2026-10-12T00:00:00Z' },
  csvPath: './september-secrets.csv',   // this file IS the funds — keep it
  appUrl: 'https://kleym.example',
  senderSecret: process.env.KLEYM_SENDER_SECRET!,   // used to sign locally; never sent
})
```

CLI: `KLEYM_API_KEY=… KLEYM_URL=… KLEYM_SENDER_SECRET=… kleym create-campaign --name … --amount 250 --links 120 --expires 2026-10-12T00:00:00Z --out secrets.csv`

The CLI defaults to the deployment's official USDC/network metadata, rejects a conflicting `--network`, and accepts `--asset XLM` explicitly. Official USDC uses sender-authorised principal with Kleym paying funding fees and reserves; legacy XLM remains sender-paid. Test USDC has no financial value. See `docs/stellar-network.md` for compatibility rules.

Funding waits for each batch to be **CONFIRMED** before preparing the next one, including the final batch. A `FundingPendingError` means confirmation is still unknown; it does not mean the payment failed. Keep the existing CSV and resume that campaign with `kleym resume-campaign --id <campaign id>` or `resumeCampaignFunding({ client, campaignId, senderSecret })`. Resume does not create another campaign, regenerate keys or overwrite the export. A confirmed batch is never signed again. Default confirmation timeout is 120 seconds per batch, with a one-second poll interval; the SDK accepts positive integer overrides.

Upgrade the server and SDK together: campaign detail must expose the ordered public batch statuses and the sender public key. An older server is refused before signing. CSV attestation, WRITE scope and organisation ownership continue to be required. Optional labels may be omitted, empty, partial or complete; missing entries remain null.

Receiving webhooks:

```ts
import { verifyWebhook } from '@kleym/sdk'
const result = verifyWebhook(rawBody, req.headers, process.env.KLEYM_WEBHOOK_KEY!)
if (!result.ok) return res.status(400).end(result.reason)   // 'stale' is a replay
```

See `docs/api.md` in the Kleym repository for the write endpoints, the rate
limits and the webhook contract.
