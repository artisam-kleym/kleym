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

## What the chain is evidence against — and what it is not

The chain catches anyone who edits, inserts or removes rows **without being
able to recompute the chain**: an application bug, a script, a person with
write access to the table but not the discipline to rehash everything after
it. It does not catch a database superuser who rewrites rows *and*
recomputes every hash *and* moves the head — that produces a chain that
verifies, and no in-database chain can do better. The answer to that
attacker is the signed export: take extracts periodically and keep them
**outside** the database, with the public key recorded separately. A later
export that disagrees with an earlier one is the evidence the chain alone
cannot give.

## Rolling out on a populated database

Rows written before #49 have no chain position, and the verifier reports
them as insertions — correctly, since it cannot tell a legacy row from a
backdated forgery. Before the first deploy that carries the chain writes
anything:

```
pnpm audit:chain-backfill
```

chains every existing row in `(createdAt, id)` order, once, and moves the
head to the last of them. It refuses to run if the head has already moved
(a live write has taken `seq` 1), because there is then no honest place for
the legacy rows. `docs/release.md` lists it beside `AUDIT_SIGNING_SEED`.

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

**Record the public key out of band.** `X-Kleym-Signing-Key` travels in the
same response as the file and its signature, so verifying with the key from
the header only proves that the server signed what the server sent. Record
the public key once — from the first export, or from `signingPublicKey()`
at deploy — keep it with the auditor, and verify every later file against
*that* copy. A file whose header key differs from the recorded one is a
finding, not a rotation, unless the rotation was announced.

An auditor verifies the file they saved with the public key alone:

```
pnpm audit:verify-export <file> <signature> <public-key>
```

It checks the signature over the bytes and, for a JSON export, recomputes
every row hash — an edited file fails both. No database, no Kleym.

`AUDIT_SIGNING_SEED` (32 random bytes, base64) is the private key's seed and
a secret in the same class as `SESSION_SECRET`. Rotating it changes the
public key on later exports; keep the old public key alongside old files.
