# Observability

Issue #53. Traces across the request path and the workers, a metric set drawn
from this system's own failures, a public status page fed by live signals, and
SLOs with the error budget they imply (`docs/slo.md`). Structured logs and the
`SECRET_ENV_KEYS` redaction in `lib/config/logger.ts` are unchanged.

No vendor. Both processes export OTLP/HTTP and the deployment decides where it
goes.

## Turning it on

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | e.g. `https://otel.example.com` — traces go to `/v1/traces`, metrics to `/v1/metrics`. Unset: nothing is registered and every span and metric call is a no-op. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `authorization=Bearer …` for the backend. A secret: in `SECRET_ENV_KEYS`, redacted from logs. |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | Collection interval (default 15 s). The status page's cache uses the same number. |

`kleym-web` registers in `src/instrumentation.ts`; Next.js then emits its own
spans for every request and route handler. `kleym-worker` registers in
`src/workers/index.ts`, where the queue, ledger and database gauges live.

## Traces

- **One trace per claim.** The claim page starts a trace (`lib/claim/trace.ts`)
  and sends a W3C `traceparent` on every call to `/api/claims/*`; the trace id
  is random and derived from nothing. Server-side, each phase is a span —
  `claim.resolve`, `claim.materialise`, `claim.claim`, `claim.submit` — carrying
  `phase` and `outcome` and nothing that identifies the link.
- **Workers join the request that enqueued them.** `enqueueBatchConfirm` puts
  the active trace context in the job (`trace`), and `job.batch-confirm` is a
  `CONSUMER` span under it, with `queue`, `batchId`, `attempt`. Kleym's own
  claim path involves no worker — the claim is settled on the ledger inside the
  request — so the worker hop in a trace is the campaign's batch confirmation.
- Spans are made with `withSpan` / `annotateSpan` (`lib/observability/tracing.ts`)
  only. CI fails on any other use of the OpenTelemetry API in `src/`.

## Metrics

Every instrument corresponds to a failure this project has met or documented:

| Metric | Type · labels | The failure it makes visible |
|---|---|---|
| `kleym.reconcile.passes` | counter · `job`, `outcome=complete\|incomplete` | #43 — a bounded pass that can never finish |
| `kleym.reconcile.remaining` | gauge · `job` | how far behind the last pass left it |
| `kleym.sponsor.spendable` / `.runway` | gauge · `sponsor`, `index` | `SPEC.md` §12 — exhaustion halts every claim |
| `kleym.claim.outcomes` | counter · `phase=resolve\|materialise\|claim\|submit`, `outcome` | the ledger-boundary wait in `/claim` failing on a slow ledger shows as `submit` / `unavailable` |
| `kleym.batch.confirm.latency` | histogram (s) · `network` | submit-to-confirm time; the ledger closing slowly |
| `kleym.stranded.reserve` / `.accounts` | gauge · `state=all\|critical` | `SPEC.md` §7.3 — float Kleym cannot recover |
| `kleym.queue.depth` / `.oldest_waiting` | gauge · `queue`, `state` | a worker that died quietly |
| `kleym.job.duration` | histogram (s) · `queue`, `outcome` | a job that has started taking minutes |
| `kleym.ratelimit.rejections` | counter · `route`, `reason=limit\|unavailable` | the limiter failing closed on a Redis outage, which looks like an outage — `unavailable` tells them apart |
| `kleym.dependency.up` | gauge · `dependency=postgres\|redis\|horizon` | the readiness probes, as a time series |

`route` is the limiter key's leading words (`claims:submit`, `otp:request:ip`,
`apikey`); the caller — address or key id — never becomes a label.

## Attributes are a log by another name

The logger's redaction does not see span attributes or metric labels, so
`lib/observability/attributes.ts` is the tracing side's equivalent, and it is an
**allowlist**: a key not in `ALLOWED_ATTRIBUTE_KEYS` is dropped, and a value is
dropped under any key when it contains a secret seed, a `#s=` fragment, an
envelope-shaped blob, or a Stellar public key (except under `sponsor`, whose key
is public and operational). Dropped keys are logged by name.

CI's secret-handling job enforces it three ways: no `setAttribute`/`startSpan`
outside `tracing.ts` and no instrument creation outside `metrics.ts`; the
allowlist may not name anything ephemeral, secret, seed, xdr, fragment, email,
address, token, claimant, recipient or balance; and the planted-value test in
`tests/lib/observability` runs there.

## Status page

`/status` (and `/api/status` as JSON) is public and computed **live** from the
same probes `/api/ready` runs, the queues as BullMQ holds them, the last
bounded-pass reports, the sponsor float and the stranded reserve — cached
fifteen seconds in memory to bound what a public page can do to the
dependencies it reports. It names components (Database, Queue and cache,
Stellar network, Background workers, Claim sponsorship, Ledger reconciliation),
not hosts, and states, not error text: why something is down stays in the log,
for the reason on `/api/ready`.

## Verified by

`pnpm verify:observability` (CI) with the SDK exporting into memory: the claim
spans under a browser-started `traceparent`; the worker span in the enqueuing
request's trace; every metric above under its forced condition — a queue with no
worker, a sponsor below threshold, an incomplete pass, stranded rows, a 30 s
confirm, a limited route, Horizon down, Redis gone; planted key material dropped
from a span; the status snapshot reporting Horizon down and a low sponsor live,
cached within the TTL and recomputed after it.
