# PR #117 compliance fixture correction

Initial GitHub Actions run: https://github.com/webnxt-2030/kleym/actions/runs/36554758262. At commit a858f1740fb96e80c8f71ee7324898659c4fae02, build/audit, secret guards and browser checks passed; the database job stopped in `verify:compliance`.

Decisive failure:

```text
FAIL  the callback was called exactly once
TypeError: Cannot read properties of undefined (reading 'body')
    at callbackIsInvoked (scripts/verify-compliance.ts:130:20)
```

The compliance harness used an intentionally closed Horizon port to demonstrate that allowed screening continued to ledger work. The new provider identity guard correctly refused that port before screening, so the fixture never reached its callback. The failure was in the harness precondition; no production network guard was removed or bypassed.

`scripts/verify-compliance.ts` now starts the existing isolated Testnet identity fixture before importing monetary actions and closes it during cleanup. It still refuses subsequent ledger reads and all submissions. Original screening allow/hold/block, timeout/error refusal, payload/signature, no-callback, attestation, export and URL assertions remain intact.

Focused proof against the existing isolated PostgreSQL/Redis verification services: **55 compliance checks passed, zero failures**, exit0. Typecheck and targeted ESLint passed. See `pr117-compliance-fix-result.json` and `pr117-compliance-fix.log`. The correction changes a standalone harness only; the prior446-unit-test aggregate, runtime source and actual wallet/ledger evidence remain applicable. Hosted CI re-execution is a separate result and must be read from the PR checks.
