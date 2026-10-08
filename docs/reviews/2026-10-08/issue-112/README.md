# Issue #112: deterministic API-key harness

The first PR #119 CI run (`37788823269`, head `f9ad058`) reproduced the known
no-secret-at-rest assertion failure: `no column contains the secret half` failed
after authentication, revocation, tampered-key checks, rate limits and scoped
access passed. The harness extracted only `issued.key.split('_')[2]`, which can
be truncated or empty. No production authentication defect was inferred.

## Narrow fix

- Extract the complete component with the exported production key pattern.
- Replace random separator sampling with four deterministic 32-byte base64url
  fixtures: leading, middle, repeated and absent underscores.
- Store only Argon2id hashes of disposable full tokens in the isolated database;
  verify each through real `resolveApiKey`, wrong-key and immediate revocation.
- Check full-token and full-secret absence across the stored row. The existing
  generated-key storage assertion remains mandatory with complete extraction.
- Never print fixture tokens or their secret components. Production parser,
  entropy generation and storage behavior are unchanged.

Local targeted lint and TypeScript passed. The existing real PostgreSQL/Redis
`verify:api-keys` CI step must pass on the fixed head before closing #112; local
unit/mocked tests are not a substitute. Deployment, wallet signatures and ledger
writes remain outside this harness. Full CI can still fail unrelated dependency,
legacy harness or release requirements without qualifying the whole product.
