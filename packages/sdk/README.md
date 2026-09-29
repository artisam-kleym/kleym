# @kleym/sdk

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

The CLI defaults to the deployment's official USDC/network metadata, rejects a conflicting `--network`, and accepts `--asset XLM` explicitly. Test USDC has no financial value. Sender fee/reserve sponsorship is separate follow-up work (#97–#100); current funding still requires the sender's XLM fees/reserves. See `docs/stellar-network.md` for the network boundary and compatibility rules.

Receiving webhooks:

```ts
import { verifyWebhook } from '@kleym/sdk'
const result = verifyWebhook(rawBody, req.headers, process.env.KLEYM_WEBHOOK_KEY!)
if (!result.ok) return res.status(400).end(result.reason)   // 'stale' is a replay
```

See `docs/api.md` in the Kleym repository for the write endpoints, the rate
limits and the webhook contract.
