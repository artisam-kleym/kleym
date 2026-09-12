# Sponsor runbook: the pool, topping up, rotating a key, alerts

The sponsor accounts are Kleym's own float. They pay the fees and lend the
reserves that let a recipient claim without holding XLM; reserves return on
merge, fees do not. Since #48 there is a **pool**.

## How the pool works

- `SPONSOR_SECRET_KEY` / `SPONSOR_PUBLIC_KEY` is the primary.
  `SPONSOR_SECRET_KEYS_EXTRA` (comma-separated seeds) adds more, in order.
  Every seed is an environment secret; none is ever in the database.
- A **new campaign is bound** to the first sponsor, in pool order, whose
  spendable XLM is at or above `SPONSOR_WORKING_THRESHOLD` (default 50). If
  none is, the richest is used. The choice is recorded on the campaign
  (`sponsorPublicKey`) and never changes: reserves return to the account that
  sponsored them, so switching mid-campaign would leave the first account's
  reserves outstanding.
- Claims on a campaign always use — and are checked and signed by — that
  campaign's sponsor. A campaign created before the pool existed reads as the
  primary.
- Failover is therefore a property of **new** campaigns. If the primary is
  drained, campaigns already bound to it stop claiming until it is topped up;
  the pool stops that from taking every campaign down with it.

## Alerts

`ALERT_WEBHOOK_URL` receives a JSON POST (`content-type: application/json`,
header `x-kleym-alert: <event>`) on:

- `sponsor.low_balance` — a sponsor's spendable float dropped below
  `SPONSOR_MIN_BALANCE_ALERT` at the moment a claim checked it. Once per
  sponsor per hour.
- `sponsor.failover` — a new campaign was bound to a sponsor other than the
  primary. Once per hour per distinct situation.

Body shape:

```json
{ "source": "kleym", "event": "sponsor.low_balance", "severity": "critical",
  "at": "2026-09-12T03:00:00.000Z", "sponsor": "G…", "spendable": "42.5", "threshold": 100 }
```

**PagerDuty (Events API v2):** point `ALERT_WEBHOOK_URL` at a small relay
that wraps the body as `{ "routing_key": …, "event_action": "trigger",
"dedup_key": "<sponsor>", "payload": { "summary": event, "severity":
"critical", "source": "kleym", "custom_details": body } }` — PagerDuty needs
its routing key in the body, which Kleym does not hold.
**Slack incoming webhook:** the same relay posting `{ "text": "…" }`. A
relay is a few lines on any function host; the alert itself is stable JSON.
If no receiver is configured, the alert is an `ERROR` log line only.

An unreachable receiver never fails a claim.

## Topping up

1. `/admin` → **Sponsor pool** shows spendable float, live campaigns and
   runway per sponsor. Runway is *at the current claim rate* — seven days of
   claims × the fee per claim — and says nothing about a burst.
2. Send XLM to the sponsor's public key from the treasury. Spendable float is
   `balance − (2 + subentries + sponsoring − sponsored) × base reserve`;
   the reserve part is lent, not spent, and comes back as claims complete.
3. The next claim on that sponsor's campaigns re-reads the balance; nothing
   restarts.

## Adding a sponsor

1. Generate a keypair offline; fund it (a few hundred XLM is a working float).
2. Append the seed to `SPONSOR_SECRET_KEYS_EXTRA` in the secret store; redeploy.
3. Startup validates every seed's shape; `/admin` lists the new account.
   New campaigns use it when it is first in pool order with working float.

## Rotating a sponsor key

The key cannot be rotated under live campaigns: campaigns bound to it need
its signature on every claim until they expire or are reclaimed.

1. Add the new sponsor (above). Put it **first** in the pool if it should
   take new campaigns: make it `SPONSOR_SECRET_KEY`/`SPONSOR_PUBLIC_KEY` and
   move the old primary into `SPONSOR_SECRET_KEYS_EXTRA`.
2. Leave the old key in the pool until every campaign bound to it has left
   `ACTIVE`/`PARTIAL`/`CREATING` (`/admin` → live campaigns = 0).
3. Reclaim leftovers as usual; then remove the old seed from the environment
   and sweep its remaining XLM to the treasury. Rows still naming its public
   key are history, not a dependency — but a claim against one would be
   refused, which is why step 2 waits.

## What never happens

No sponsor seed in the database, a log line (`SECRET_ENV_KEYS` drives the
logger's redaction for every pool variable, and CI checks the list), or the
client bundle (the `NEXT_PUBLIC_` seed scan). `scripts/verify-sponsors.ts`
plants the seeds in log calls and asserts they are redacted.
