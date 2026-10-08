# Issue #109: audit seed classification and emitted-log proof

Prepared 2026-10-08. Kleym source checkout `codex/app-sending-pilot`, initial
base `4163d7954bff9c1582c0c405174cddbe6951da33`; candidate contains accumulated
authorized app work and this independent fix. Final PR commit identifies the
published candidate. No deployment or wallet/network transaction performed.

## Change and acceptance

- `AUDIT_SIGNING_SEED` joins the shared secret registry, including primary/extra
  sponsor keys, encryption/session credentials and provider credentials.
- CI now reads the actual Zod object schema keys without loading runtime secret
  values. Secret-shaped names include `SEED`. Public exceptions are explicit and
  reviewed in `secret-classification.ts`; bootstrap username/switch are public.
- The actual Pino logger factory writes to an injected destination in tests.
  Every registered planted value is censored at root and one-object nested paths;
  entire `env` objects are censored too. Public identifiers remain observable.
  This does not promise recursive redaction of arbitrary unknown field names.
- The same classification assertion used by CI throws for an intentionally
  unclassified `FUTURE_SIGNING_SEED` fixture.
- Fixed public RFC 8032 signature data still verifies with SPKI public-key
  formatting; altered message fails. Existing receipt tests also pass. Signing,
  canonical receipt/export bytes and verification-key history code were unchanged.

## Executed proof

| Check | Observed | Evidence |
|---|---|---|
| Actual schema guard | 34 keys, 12 secret entries; pass | `classification-v2.log` |
| Focused redaction/classification + receipts | 17/17 pass | `focused-tests-v3.log` |
| Full source suite | 740 tests / 59 files pass | `all-tests-v2.log` |
| Full project lint | exit 0 | `full-lint.log` |
| Targeted lint | exit 0 | `lint-v2.log` |
| TypeScript | exit 0 | `typecheck-v2.log` |
| Production webpack build | exit 0 | `build-webpack.log` |
| Production Chromium bridge fixtures | 5/5 pass | `lantern-browser.log`, `evidences/lantern-browser/` |
| Prisma schema validation | valid | `schema-validation.log` |

The required dependency audit is **not green**: local pnpm reports 34 findings
(1 critical, 16 high, 14 moderate, 3 low). `dependency-audit.log` preserves the
actual result. The local pnpm also reports that package.json pnpm overrides are
ignored by its version; CI pins pnpm 10.6.4 via packageManager. Dependency
remediation and qualification with the supported package manager are release
gates, independent of #109's narrow redaction acceptance. No dependency was
upgraded or risk waived in this issue-closure slice.

`focused-tests.log` records an initial test-fixture mistake: raw public-key bytes
instead of the verifier's required SPKI wrapper. V2/V3 correct the fixture;
production verification was not changed. `build.log` records the local default
Turbopack failure caused by the shared node_modules junction escaping its root;
the explicit webpack build is the qualified production build. Existing
middleware deprecation and local pnpm configuration warnings remain recorded.

All redaction tests use obvious planted strings. The fixed Ed25519 fixture holds
public verification data only. No runtime seed was read for redaction proof;
no real credential is printed. Historical evidence is preserved separately.

## Closure boundary

This supports implementation acceptance for #109 on the PR candidate, subject to
senior review/merge. It does not claim the paused Railway deployment contains
the fix, that hosted CI passed, or that Mainnet funds/physical wallets are qualified.
