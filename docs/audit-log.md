# The audit log: tamper-evident, append-only, exportable

`AuditLog` records who did what (SPEC §5.4). Since #49 it can also prove
that what it records is what was written.

## Hash chain

Every row written through `recordAudit` takes the next `seq`, carries
`prevHash` (the previous row's `rowHash`), and `rowHash =
SHA-256(prevHash ‖ canonical(row))`. The canonical form is explicit and
versioned (`canonVersion`, currently 1: a fixed field order, JSON-escaped,
metadata keys sorted recursively) so an upgrade cannot orphan history —
add v2, never change v1. Writers lock the single `AuditChainHead` row for
the length of the insert, so concurrent actions queue rather than fork.

Rows with no `seq` were written outside `recordAudit`. Verification reports
them as insertions.

## Verifying

- `pnpm audit:verify` — recomputes the whole chain; exits non-zero and names
  the first broken link (modified contents, a gap with no checkpoint, an
  unchained row, or a head that no longer matches the tail).
- `GET /api/admin/audit/verify` — the same, for staff; 200 when the chain
  holds, 409 with the first broken link when it does not.

## Append-only at the database

A trigger refuses `UPDATE` and `DELETE` on `AuditLog` whatever role the
connection uses, except inside a transaction that has declared itself the
retention job (`SET LOCAL kleym.audit_maintenance = 'on'`). A per-role
`GRANT` would depend on the application and the migrations running as
different database roles, which Railway does not give us; the trigger is
the control an auditor can see, and `scripts/verify-audit-chain.ts` proves
it against the application's own connection.

## Retention

Rows older than `AUDIT_RETENTION_DAYS` (730) are removed by the daily
maintenance job — only ever a contiguous prefix of the chain — inside one
transaction that also appends a **checkpoint** row (`audit.checkpoint`),
itself chained, recording how many rows it removed, which `seq` range, and
the hash of the last one. A verifier that finds the chain starting mid-way
accepts it only if a checkpoint names exactly that predecessor. Deletion is
therefore audited by construction, and it cannot be used as the bypass.

## Signed export

`GET /api/org/audit/export?from&to&format=csv|json` (an Owner, scoped to
their own organisation by the session — never by a parameter) and
`GET /api/admin/audit/export?organizationId&…` (staff) return the rows and
sign the response body byte-for-byte with an Ed25519 key. The signature and
the public key travel in `X-Kleym-Signature` and `X-Kleym-Signing-Key`.

An auditor verifies the file they saved with the public key alone:

```
pnpm audit:verify-export <file> <signature> <public-key>
```

It checks the signature over the bytes and, for a JSON export, recomputes
every row hash — an edited file fails both. No database, no Kleym.

`AUDIT_SIGNING_SEED` (32 random bytes, base64) is the private key's seed and
a secret in the same class as `SESSION_SECRET`. Rotating it changes the
public key on later exports; keep the old public key alongside old files.
