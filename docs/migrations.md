# Database and migration conventions

Read this before any schema change. The schema is where Kleym's central guarantee is enforced structurally, so a careless migration is a security change, not just a data change.

## Invariants

These come from `SPEC.md` §4.1 and are non-negotiable.

1. **No column ever stores a seed, secret key, or mnemonic.** `ClaimLink.ephemeralPublicKey` is a public key (`G...`) and carries a doc comment saying so. If a field name suggests otherwise, the schema is wrong — CI greps for this.
2. **Money columns are `Decimal @db.Decimal(23, 7)`.** Stellar's precision is exactly 7 decimal places. **Never `Float`.** In application code use `decimal.js` or string arithmetic, never JavaScript `Number` — `0.1 + 0.2 !== 0.3` is a bug that ships to production and loses funds.
3. `Campaign.csvExportedAt` gates activation. A campaign cannot leave `CREATING` until it is set.
4. `ClaimLink.balanceId` stays null until the owning `Batch` is `CONFIRMED`.

## The database is a cache

Per `SPEC.md` §3.5, the database is an index over the chain and is never the authority on whether money moved. A migration must never introduce a column that would be *trusted* over Horizon. Reconciliation resolves every disagreement in the chain's favour.

## Naming

Prisma generates `migrations/<timestamp>_<name>/`. The timestamp is UTC and assigned by Prisma — never hand-edit it, and never reorder migration directories. Renaming a migration after it has been applied anywhere breaks the checksum.

Use a snake_case name describing the change, not the ticket:

```
20260820T143000_add_delivery_otp_attempts    # good
20260820T143000_fix_issue_14                 # bad
```

## Workflow

```bash
pnpm prisma migrate dev --name <snake_case_name>   # author + apply locally
pnpm prisma migrate deploy                         # apply in CI / Railway
pnpm prisma migrate status                         # check drift
```

Never use `prisma db push` outside a throwaway local database — it applies changes without recording a migration, and the next `migrate dev` will want to reset.

## Before merging a schema change

- Run the migration against a **copy of real data**, not just an empty database (`AGENT.md` §6.2).
- Confirm `grep -ri "secret\|seed" prisma/schema.prisma` returns no storage field.
- Confirm no `Float` appears in `schema.prisma`.
- Check that every new query path is ownership-scoped — `where: { id, userId }`, never `where: { id }` followed by a check (`AGENT.md` §5.4).

## Destructive changes

Dropping or renaming a column that holds campaign or link state can strand funds by making a claimable balance unreconcilable. Any migration that drops data needs an explicit note in the PR describing what becomes unrecoverable and why it is safe.
