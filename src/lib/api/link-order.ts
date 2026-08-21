/**
 * The one order links are ever listed in.
 *
 * `ClaimLink.createdAt` defaults to `CURRENT_TIMESTAMP`, which in Postgres is
 * TRANSACTION time — so every link registered by one `createMany` carries an
 * identical timestamp to the millisecond. `ORDER BY "createdAt"` over 90 equal
 * keys is not a total order, and Postgres promises nothing about which
 * permutation comes back: the sort is unstable, and its input is whatever
 * order the scan produced, which ordinary row updates change by relocating
 * tuples in the heap.
 *
 * Observed, not theorised. Updating fifteen of ninety links so their tuples
 * move returns a different permutation from the same query; adding `id` as a
 * tiebreak returns the same one every time.
 *
 * This matters far beyond presentation. Batch membership, operation index and
 * balance-ID mapping are all positional — `confirmOne` pairs the ledger's Nth
 * balance with the Nth link — so two queries disagreeing about order writes
 * one recipient's balance ID onto another recipient's link.
 *
 * `id` is a cuid: monotonic within a process and unique always, so it breaks
 * every tie and never introduces one.
 */
import type { Prisma } from '@/generated/prisma/client'

export const LINK_ORDER: Prisma.ClaimLinkOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
]
